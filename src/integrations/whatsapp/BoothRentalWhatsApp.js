/**
 * WhatsApp Handler for Booth Rental Management
 * Handles rent collection, balance inquiries, and payment processing via WhatsApp
 * This is where the REAL value happens - automated conversations about money
 */

const BoothRentalManager = require('../../core/boothRental/BoothRentalManager');

class BoothRentalWhatsApp {
  constructor(config) {
    this.config = config;
    this.rentalManager = new BoothRentalManager();
    
    // Conversation states for multi-step flows
    this.conversations = new Map();
    
    // Command patterns
    this.commands = {
      'PAY': this.handlePaymentRequest.bind(this),
      'BALANCE': this.handleBalanceInquiry.bind(this),
      'BAL': this.handleBalanceInquiry.bind(this),
      'COMMISSION': this.handleCommissionInquiry.bind(this),
      'HELP': this.handleHelp.bind(this),
      'SETUP': this.handleOwnerSetup.bind(this),
      'REPORT': this.handleOwnerReport.bind(this),
      'REMIND': this.handleSendReminders.bind(this)
    };
  }

  /**
   * Main message processor - handles all WhatsApp messages
   */
  async processMessage(message) {
    const phoneNumber = message.from;
    const text = (message.text?.body || '').toUpperCase().trim();
    const messageType = message.type;

    console.log(`Processing message from ${phoneNumber}: ${text}`);

    try {
      // Handle voice messages first
      if (messageType === 'audio') {
        return await this.handleVoiceMessage(message);
      }

      // Check if it's a command
      const command = text.split(' ')[0];
      if (this.commands[command]) {
        return await this.commands[command](phoneNumber, text, message);
      }

      // Check for natural language patterns
      if (this.isBalanceInquiry(text)) {
        return await this.handleBalanceInquiry(phoneNumber, text, message);
      }
      
      if (this.isPaymentRelated(text)) {
        return await this.handlePaymentRequest(phoneNumber, text, message);
      }

      // Check for ongoing conversation
      const conversation = this.conversations.get(phoneNumber);
      if (conversation) {
        return await this.continueConversation(phoneNumber, text, conversation);
      }

      // Default response
      return await this.sendMessage(phoneNumber, 
        `Hi! I help manage booth rental payments. Try:\n\n` +
        `• BAL - Check your balance\n` +
        `• PAY - Make a payment\n` +
        `• COMMISSION - View earnings\n` +
        `• HELP - See all options`
      );

    } catch (error) {
      console.error('Message processing error:', error);
      return await this.sendMessage(phoneNumber, 
        'Sorry, I encountered an error. Please try again or contact the salon.'
      );
    }
  }

  /**
   * Handle balance inquiry
   */
  async handleBalanceInquiry(phoneNumber, text, message) {
    // Look up renter by phone number
    const renterId = phoneNumber; // In production, map phone to renterId
    const balanceInfo = this.rentalManager.getBalanceInquiry(renterId);

    if (balanceInfo.error) {
      // New renter - start setup flow
      return await this.startRenterSetup(phoneNumber);
    }

    const response = `💰 **Balance for ${balanceInfo.renter}**
    
Station: ${balanceInfo.station}
Current Balance: $${balanceInfo.currentBalance}

📊 **Breakdown:**
Monthly Rent: $${balanceInfo.breakdown.monthlyRent}
Commission Credit: -$${balanceInfo.breakdown.commissionsThisMonth}
Due: ${balanceInfo.breakdown.dueDate}

📈 **Recent Sales:**
${this.formatCommissionList(balanceInfo.breakdown.recentSales)}

💳 Reply PAY to pay $${balanceInfo.paymentOptions.payNow}
📱 Reply COMMISSION for full earnings report`;

    return await this.sendMessage(phoneNumber, response);
  }

  /**
   * Handle payment request
   */
  async handlePaymentRequest(phoneNumber, text, message) {
    const renterId = phoneNumber;
    const rentDue = this.rentalManager.calculateRentDue(renterId);

    if (rentDue.error) {
      return await this.sendMessage(phoneNumber, 
        'I don\'t have your rental information. Reply SETUP to get started.'
      );
    }

    // Start payment conversation
    const conversation = {
      type: 'payment',
      step: 'confirm_amount',
      data: {
        renterId,
        amount: rentDue.breakdown.netAmount,
        breakdown: rentDue.breakdown
      }
    };

    this.conversations.set(phoneNumber, conversation);

    const response = `💳 **Payment Summary**
    
Amount Due: $${rentDue.breakdown.totalDue}
Processing Fee: $${rentDue.breakdown.processingFee}
**Total: $${rentDue.breakdown.netAmount}**

This includes:
• Base Rent: $${rentDue.breakdown.baseRent}
• Commission Credit: -$${rentDue.breakdown.commissionsEarned}
${rentDue.breakdown.lateFee > 0 ? `• Late Fee: $${rentDue.breakdown.lateFee}` : ''}

Reply YES to confirm payment of $${rentDue.breakdown.netAmount}
Reply NO to cancel`;

    return await this.sendMessage(phoneNumber, response);
  }

  /**
   * Handle commission inquiry
   */
  async handleCommissionInquiry(phoneNumber, text, message) {
    const renterId = phoneNumber;
    const currentMonth = new Date();
    const commissionTotal = this.rentalManager.getMonthlyCommissions(renterId, currentMonth);
    const details = this.rentalManager.getCommissionDetails(renterId, 20);

    const response = `💰 **Commission Report**
    
Month: ${currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
Total Earned: $${commissionTotal.toFixed(2)}

📊 **Recent Sales:**
${this.formatDetailedCommissionList(details)}

💡 Your commission will be deducted from next month's rent.

Reply BAL to see how this affects your rent`;

    return await this.sendMessage(phoneNumber, response);
  }

  /**
   * Handle salon owner setup commands
   */
  async handleOwnerSetup(phoneNumber, text, message) {
    // Verify owner phone number
    if (!this.isOwnerPhone(phoneNumber)) {
      return await this.sendMessage(phoneNumber, 
        'This command is only available to salon owners.'
      );
    }

    const parts = text.split(' ');
    if (parts.length < 4) {
      return await this.sendMessage(phoneNumber,
        `To add a booth renter, use format:
        
SETUP [Name] [Phone] [Station] [MonthlyRent]

Example:
SETUP Sarah 555-1234 3 450

This will set up Sarah at Station 3 for $450/month`
      );
    }

    const [cmd, name, phone, station, rent] = parts;
    const result = this.rentalManager.addRenter({
      name,
      phone: this.normalizePhone(phone),
      stationNumber: station,
      monthlyRent: parseFloat(rent)
    });

    if (result.success) {
      // Send welcome message to renter
      await this.sendMessage(result.renterId,
        `Welcome ${name}! 🎉
        
You're all set up for Station ${station} at $${rent}/month.

I'll help you manage:
• Automatic rent reminders
• Commission tracking
• Easy payments

Reply HELP anytime for assistance.`
      );

      return await this.sendMessage(phoneNumber, 
        `✅ ${result.message}\n\nThe renter has been notified.`
      );
    }
  }

  /**
   * Handle owner report request
   */
  async handleOwnerReport(phoneNumber, text, message) {
    if (!this.isOwnerPhone(phoneNumber)) {
      return await this.sendMessage(phoneNumber, 
        'This command is only available to salon owners.'
      );
    }

    const report = this.rentalManager.generateOwnerReport();
    
    const response = `📊 **Monthly Booth Rental Report**
    
Month: ${report.month}
Total Booths: ${report.summary.totalBooths}

💰 **Financial Summary:**
Expected Revenue: $${report.summary.expectedRevenue}
Collected: $${report.summary.actualCollected}
Pending: $${report.summary.pendingPayments}
Collection Rate: ${report.summary.collectionRate}%

👥 **Renter Status:**
${this.formatRenterReport(report.renters)}

💡 **Actions:**
Reply REMIND to send payment reminders
Reply REPORT DETAILED for full breakdown`;

    return await this.sendMessage(phoneNumber, response);
  }

  /**
   * Continue multi-step conversations
   */
  async continueConversation(phoneNumber, text, conversation) {
    if (conversation.type === 'payment' && conversation.step === 'confirm_amount') {
      if (text === 'YES') {
        // Process payment
        const result = await this.rentalManager.collectRent(
          conversation.data.renterId,
          conversation.data.amount
        );

        this.conversations.delete(phoneNumber);

        if (result.success) {
          return await this.sendMessage(phoneNumber,
            `✅ **Payment Successful!**
            
Amount Paid: $${conversation.data.amount}
Transaction ID: ${result.transactionId}

Thank you for your payment! Your receipt has been emailed.`
          );
        } else {
          return await this.sendMessage(phoneNumber,
            `❌ Payment failed. ${result.error}
            
Please try again or contact the salon for assistance.`
          );
        }
      } else {
        this.conversations.delete(phoneNumber);
        return await this.sendMessage(phoneNumber, 'Payment cancelled.');
      }
    }
  }

  /**
   * Handle voice messages for hands-free balance checks
   */
  async handleVoiceMessage(message) {
    const phoneNumber = message.from;
    
    // In production, this would transcribe the audio
    // For now, send instructions
    return await this.sendMessage(phoneNumber,
      `🎤 Voice commands available:
      
Say "What's my balance?" to check rent due
Say "What's my commission?" for earnings
Say "Make a payment" to pay rent

Or text: BAL, COMMISSION, or PAY`
    );
  }

  /**
   * Send automated rent reminders
   */
  async sendRentReminders() {
    console.log('Sending automated rent reminders...');
    
    for (const [renterId, renter] of this.rentalManager.renters) {
      if (!renter.autopayEnabled) continue;
      
      const rentDue = this.rentalManager.calculateRentDue(renterId);
      const reminder = this.rentalManager.generateRentReminder(renterId);
      
      // Send reminder based on schedule
      if (this.shouldSendReminder(rentDue)) {
        await this.sendMessage(renterId, reminder.message);
      }
    }
  }

  // Helper methods
  isBalanceInquiry(text) {
    const patterns = ['BALANCE', 'BAL', 'HOW MUCH', 'WHAT DO I OWE', 'RENT DUE'];
    return patterns.some(pattern => text.includes(pattern));
  }

  isPaymentRelated(text) {
    const patterns = ['PAY', 'PAYMENT', 'SEND MONEY', 'PAY RENT'];
    return patterns.some(pattern => text.includes(pattern));
  }

  isOwnerPhone(phone) {
    // In production, check against owner database
    return this.config.ownerPhones?.includes(phone) || false;
  }

  normalizePhone(phone) {
    return phone.replace(/\D/g, '');
  }

  formatCommissionList(sales) {
    if (!sales || sales.length === 0) return 'No recent sales';
    
    return sales.map(sale => 
      `• ${sale.date}: ${sale.product} (+${sale.earned})`
    ).join('\n');
  }

  formatDetailedCommissionList(sales) {
    if (!sales || sales.length === 0) return 'No sales recorded this month';
    
    return sales.map((sale, i) => 
      `${i + 1}. ${sale.date} - ${sale.product}
       Sale: ${sale.sale} → Earned: ${sale.earned}`
    ).join('\n\n');
  }

  formatRenterReport(renters) {
    return renters.map(r => {
      const status = r.status === 'PAID' ? '✅' : 
                    r.status === 'LATE' ? '⚠️' : '⏳';
      const late = r.daysLate > 0 ? ` (${r.daysLate}d late)` : '';
      return `${status} ${r.name} - Station ${r.station}: $${r.amount}${late}`;
    }).join('\n');
  }

  shouldSendReminder(rentDue) {
    const daysUntilDue = rentDue.daysUntilDue;
    const reminderDays = [7, 3, 1, 0, -1, -3, -7]; // Include late reminders
    return reminderDays.includes(daysUntilDue);
  }

  async sendMessage(phoneNumber, message) {
    // This would integrate with WhatsApp API
    console.log(`Sending to ${phoneNumber}: ${message}`);
    
    // In production:
    // await axios.post(this.config.whatsappApiUrl, {
    //   to: phoneNumber,
    //   type: 'text',
    //   text: { body: message }
    // });
    
    return { success: true, messageId: `msg_${Date.now()}` };
  }
}

module.exports = BoothRentalWhatsApp;