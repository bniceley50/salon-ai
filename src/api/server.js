/**
 * Salon AI API Server - Your MVP Backend
 * This is the core server that will handle WhatsApp webhooks
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { colorAI } = require('../core/colorAI');

const app = express();
const port = process.env.PORT || 3000;

// Security and middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Analytics tracking (simplified for MVP)
const analytics = {
  track: (event, data) => {
    console.log(`📊 ANALYTICS: ${event}`, data);
    // TODO: Send to Mixpanel/Segment/Google Analytics
  }
};

/**
 * Formula Safety Check API - Your Core Feature
 */
app.post('/api/formula/check', async (req, res) => {
  try {
    const { formula, hairCondition, salon } = req.body;
    
    analytics.track('formula_check_requested', {
      salon: salon?.id,
      formula: formula?.product,
      porosity: hairCondition?.porosity
    });

    const result = await colorAI.generateFormula({
      ...formula,
      ...hairCondition
    });

    // Track if we prevented a disaster
    if (!result.warnings || result.warnings.length === 0) {
      analytics.track('formula_approved', { salon: salon?.id });
    } else {
      const critical = result.warnings.find(w => w.level === 'CRITICAL');
      if (critical) {
        analytics.track('disaster_prevented', {
          salon: salon?.id,
          formula: formula?.product,
          warning: critical.message
        });
      }
    }

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Formula check error:', error);
    analytics.track('formula_check_error', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: 'Safety check failed - please try again'
    });
  }
});

/**
 * WhatsApp Webhook - Where messages come in
 */
app.post('/webhook/whatsapp', (req, res) => {
  try {
    const { messages, contacts } = req.body;
    
    if (messages && messages.length > 0) {
      for (const message of messages) {
        handleWhatsAppMessage(message, contacts);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).send('Error');
  }
});

/**
 * Simple WhatsApp message handler
 */
async function handleWhatsAppMessage(message, contacts) {
  const phoneNumber = message.from;
  const text = message.text?.body || '';
  
  analytics.track('whatsapp_message_received', {
    phone: phoneNumber,
    message_length: text.length
  });

  // Simple formula parsing for MVP
  if (text.toLowerCase().includes('formula') || text.toLowerCase().includes('color')) {
    
    // Extract basic info (this will get smarter with NLP later)
    const porosity = extractPorosity(text);
    const product = extractProduct(text);
    
    if (product) {
      try {
        const safetyCheck = await colorAI.generateFormula({
          product,
          porosity: porosity || 'medium'
        });

        let response = `🎨 Formula Safety Check:\n\n`;
        
        if (safetyCheck.warnings && safetyCheck.warnings.length > 0) {
          const critical = safetyCheck.warnings.find(w => w.level === 'CRITICAL');
          if (critical) {
            response += `⚠️ DANGER: ${critical.message}\n`;
            if (safetyCheck.alternativeFormula) {
              response += `✅ Try instead: ${safetyCheck.alternativeFormula}\n`;
            }
          }
        } else {
          response += `✅ Formula looks safe to use!\n`;
        }

        response += `\nConfidence: ${(safetyCheck.confidence * 100).toFixed(0)}%`;
        
        // TODO: Send WhatsApp response
        console.log(`Would send to ${phoneNumber}:`, response);
        
      } catch (error) {
        console.error('Formula processing error:', error);
      }
    }
  }
}

// Helper functions for message parsing
function extractPorosity(text) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('high porosity')) return 'high';
  if (lowerText.includes('low porosity')) return 'low';
  if (lowerText.includes('medium porosity')) return 'medium';
  return null;
}

function extractProduct(text) {
  const patterns = [
    /(\d+[A-Z]+)/g, // 4NA, 7N, etc.
    /(level \d+)/gi,
    /(\d+vol)/gi
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * Statistics endpoint for dashboard
 */
app.get('/api/stats', (req, res) => {
  const stats = colorAI.getStats();
  res.json({
    ...stats,
    uptime: process.uptime(),
    version: '1.0.0-mvp'
  });
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'salon-ai-api'
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Salon AI API running on port ${port}`);
  console.log(`🎯 Ready to prevent hair disasters!`);
  console.log(`📊 Stats available at: http://localhost:${port}/api/stats`);
});

module.exports = app;