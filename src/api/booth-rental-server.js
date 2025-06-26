/**
 * Booth Rental Management API Server
 * This server handles automated rent collection, commission tracking, and WhatsApp integration
 * FINALLY solving a real problem that salons will pay for
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');

const BoothRentalManager = require('../core/boothRental/BoothRentalManager');
const BoothRentalWhatsApp = require('../integrations/whatsapp/BoothRentalWhatsApp');
const BoothRentalVoice = require('../integrations/voice/BoothRentalVoice');

const app = express();
const port = process.env.PORT || 3000;

// Security and middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Initialize managers
const rentalManager = new BoothRentalManager();
const whatsappHandler = new BoothRentalWhatsApp({
  whatsappApiUrl: process.env.WHATSAPP_API_URL,
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  ownerPhones: (process.env.OWNER_PHONES || '').split(',')
});
const voiceHandler = new BoothRentalVoice(rentalManager);

// Analytics tracking
const analytics = {
  track: (event, data) => {
    console.log(`📊 ANALYTICS: ${event}`, data);
    // TODO: Send to Mixpanel/Segment for real tracking
  }
};

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'booth-rental-management',
    timestamp: new Date().toISOString(),
    stats: rentalManager.analytics
  });
});

/**
 * WhatsApp webhook for message handling
 */
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { messages } = req.body;
    
    for (const message of messages) {
      analytics.track('whatsapp_message_received', {
        from: message.from,
        type: message.type
      });

      await whatsappHandler.processMessage(message);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

/**
 * Voice message processing endpoint
 */
app.post('/api/voice/process', async (req, res) => {
  try {
    const { audioUrl, phoneNumber } = req.body;
    
    analytics.track('voice_message_received', { phoneNumber });
    
    const result = await voiceHandler.processVoiceMessage(audioUrl, phoneNumber);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Voice processing error:', error);
    res.status(500).json({ error: 'Voice processing failed' });
  }
});

/**
 * Add new booth renter
 */
app.post('/api/renters', async (req, res) => {
  try {
    const result = rentalManager.addRenter(req.body);
    
    analytics.track('renter_added', {
      renterId: result.renterId,
      monthlyRent: req.body.monthlyRent,
      station: req.body.stationNumber
    });

    res.json(result);
  } catch (error) {
    console.error('Add renter error:', error);
    res.status(500).json({ error: 'Failed to add renter' });
  }
});

/**
 * Get renter balance and details
 */
app.get('/api/renters/:renterId/balance', (req, res) => {
  try {
    const { renterId } = req.params;
    const balance = rentalManager.getBalanceInquiry(renterId);
    
    if (balance.error) {
      return res.status(404).json({ error: 'Renter not found' });
    }

    res.json(balance);
  } catch (error) {
    console.error('Balance inquiry error:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

/**
 * Process rent payment
 */
app.post('/api/payments/rent', async (req, res) => {
  try {
    const { renterId, amount } = req.body;
    
    analytics.track('rent_payment_initiated', {
      renterId,
      amount: amount || 'auto'
    });

    const result = await rentalManager.collectRent(renterId, amount);
    
    if (result.success) {
      analytics.track('rent_payment_successful', {
        renterId,
        amount: result.receipt.payment.totalPaid,
        transactionId: result.transactionId
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

/**
 * Record product sale commission
 */
app.post('/api/commissions', (req, res) => {
  try {
    const { renterId, product, amount, clientName } = req.body;
    
    const result = rentalManager.recordCommission(renterId, {
      product,
      amount,
      clientName
    });

    analytics.track('commission_recorded', {
      renterId,
      amount,
      commission: result.commission
    });

    res.json(result);
  } catch (error) {
    console.error('Commission error:', error);
    res.status(500).json({ error: 'Failed to record commission' });
  }
});

/**
 * Get monthly report for salon owner
 */
app.get('/api/reports/monthly', (req, res) => {
  try {
    const { month } = req.query;
    const report = rentalManager.generateOwnerReport(
      month ? new Date(month) : new Date()
    );

    res.json(report);
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * Dashboard stats endpoint
 */
app.get('/api/stats', (req, res) => {
  const stats = {
    ...rentalManager.analytics,
    totalRenters: rentalManager.renters.size,
    monthlyRecurringRevenue: Array.from(rentalManager.renters.values())
      .reduce((total, renter) => total + renter.monthlyRent, 0),
    averageCollectionTime: '1.2 days', // Calculate from actual data
    automationRate: rentalManager.analytics.automatedCollections / 
      (rentalManager.analytics.totalRentCollected || 1) * 100
  };

  res.json(stats);
});

/**
 * Send manual reminders
 */
app.post('/api/reminders/send', async (req, res) => {
  try {
    await whatsappHandler.sendRentReminders();
    
    analytics.track('manual_reminders_sent', {
      count: rentalManager.renters.size
    });

    res.json({
      success: true,
      remindersSent: rentalManager.renters.size
    });
  } catch (error) {
    console.error('Reminder error:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

/**
 * Automated tasks - runs every day at 9 AM
 */
cron.schedule('0 9 * * *', async () => {
  console.log('Running daily automation tasks...');
  
  try {
    // Send rent reminders
    await whatsappHandler.sendRentReminders();
    
    // Process autopay for due rents
    for (const [renterId, renter] of rentalManager.renters) {
      if (renter.autopayEnabled) {
        const rentDue = rentalManager.calculateRentDue(renterId);
        if (rentDue.daysUntilDue === 0) {
          await rentalManager.collectRent(renterId);
        }
      }
    }
    
    analytics.track('daily_automation_complete', {
      date: new Date().toISOString()
    });
  } catch (error) {
    console.error('Automation error:', error);
  }
});

/**
 * Monthly report generation - runs on the 1st at 8 AM
 */
cron.schedule('0 8 1 * *', async () => {
  console.log('Generating monthly reports...');
  
  const report = rentalManager.generateOwnerReport();
  
  // Send report to owner via WhatsApp
  const ownerPhones = (process.env.OWNER_PHONES || '').split(',');
  for (const phone of ownerPhones) {
    await whatsappHandler.sendMessage(phone, 
      `📊 Monthly Report Ready!\n\nView at: ${process.env.APP_URL}/reports`
    );
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Booth Rental Management API running on port ${port}`);
  console.log(`💰 Ready to automate rent collection!`);
  console.log(`📊 Stats available at: http://localhost:${port}/api/stats`);
  console.log(`\n✅ Solving REAL salon problems:`);
  console.log(`   - Automated rent collection`);
  console.log(`   - Commission tracking`);
  console.log(`   - WhatsApp reminders`);
  console.log(`   - Voice balance checks`);
});

module.exports = app;