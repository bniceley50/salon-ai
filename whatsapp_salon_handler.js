// WhatsApp Business Cloud API Handler for Salon
// Production-ready message processing with error handling

const axios = require('axios');
const { SquareIntegration } = require('./square_integration_production');
const { MessageParser } = require('./message_parser');
const { RateLimiter } = require('limiter');

class WhatsAppSalonHandler {
  constructor(config) {
    this.config = config;
    this.square = new SquareIntegration(config.square);
    this.parser = new MessageParser();
    
    // WhatsApp API rate limits
    this.messageLimiter = new RateLimiter({ 
      tokensPerInterval: 80, 
      interval: 'second' 
    });
    
    // Track conversation state
    this.conversations = new Map();
    
    // Clean up old conversations every hour
    setInterval(() => this.cleanupConversations(), 60 * 60 * 1000);
  }

  // Main webhook handler
  async handleWebhook(req, res) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(req)) {
        return res.status(401).send('Unauthorized');
      }
      
      const { entry } = req.body;
      
      // Process each message
      for (const item of entry) {
        const { changes } = item;
        
        for (const change of changes) {
          if (change.field === 'messages') {
            await this.processMessage(change.value);
          }
        }
      }
      
      res.status(200).send('OK');
      
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  // Process incoming message
  async processMessage(data) {
    const { messages, contacts } = data;
    
    if (!messages || messages.length === 0) return;
    
    const message = messages[0];
    const contact = contacts[0];
    
    // Rate limiting
    await this.messageLimiter.removeTokens(1);
    
    try {
      // Get or create conversation state
      const conversation = this.getConversation(message.from);
      
      // Parse message intent
      const intent = await this.parser.parseIntent(message.text.body);
      
      // Handle based on intent
      let response;
      switch (intent.type) {
        case 'BOOKING_REQUEST':
          response = await this.handleBookingRequest(intent, conversation, contact);
          break;
          
        case 'AVAILABILITY_CHECK':
          response = await this.handleAvailabilityCheck(intent, conversation);
          break;
          
        case 'CANCEL_APPOINTMENT':
          response = await this.handleCancellation(intent, conversation);
          break;
          
        case 'CONFIRM_SLOT':
          response = await this.handleSlotConfirmation(intent, conversation);
          break;
          
        default:
          response = await this.handleGeneralInquiry(message.text.body, conversation);
      }
      
      // Send response
      await this.sendMessage(message.from, response);
      
      // Update conversation state
      this.updateConversation(message.from, conversation);
      
    } catch (error) {
      console.error('Message processing error:', error);
      
      // Send error message
      await this.sendMessage(
        message.from, 
        "I'm having trouble understanding your request. Please call the salon at (555) 123-4567 for immediate assistance."
      );
    }
  }

  // Handle booking request
  async handleBookingRequest(intent, conversation, contact) {
    const { service, stylist, dateTime } = intent.entities;
    
    // Check if we have all required information
    if (!service || !dateTime) {
      conversation.state = 'COLLECTING_INFO';
      conversation.pendingBooking = { service, stylist, dateTime };
      
      if (!service) {
        return {
          text: `Hi ${contact.profile.name}! What service would you like to book? We offer:\n\n💇 Haircut\n🎨 Color\n✨ Highlights\n💨 Blowdry\n💆 Treatment`,
          quickReplies: ['Haircut', 'Color', 'Highlights', 'Blowdry', 'Treatment']
        };
      }
      
      if (!dateTime) {
        return {
          text: "When would you like to come in? You can say things like 'tomorrow at 2pm' or 'next Tuesday morning'."
        };
      }
    }
    
    // Get available slots
    const availability = await this.square.getAvailableSlots({
      serviceId: this.mapServiceToId(service),
      teamMemberId: stylist ? this.mapStylistToId(stylist) : null,
      date: dateTime,
      locationId: this.config.locationId
    });
    
    if (!availability.success) {
      return {
        text: "I'm having trouble checking availability right now. Please call us at (555) 123-4567 to book your appointment."
      };
    }
    
    if (availability.slots.length === 0) {
      return {
        text: `I'm sorry, we don't have any openings for ${service} on ${this.formatDate(dateTime)}. Would you like to check another day?`,
        quickReplies: ['Tomorrow', 'Day after tomorrow', 'Next week']
      };
    }
    
    // Store available slots in conversation
    conversation.state = 'SELECTING_SLOT';
    conversation.availableSlots = availability.slots;
    conversation.pendingBooking = { service, stylist, dateTime };
    
    // Format slot options
    const slotOptions = availability.slots.slice(0, 5).map((slot, index) => {
      const time = new Date(slot.startTime);
      return `${index + 1}. ${time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    });
    
    return {
      text: `Great! I found these available times for ${service} on ${this.formatDate(dateTime)}:\n\n${slotOptions.join('\n')}\n\nWhich time works best for you?`,
      quickReplies: ['1', '2', '3', '4', '5']
    };
  }

  // Handle slot confirmation
  async handleSlotConfirmation(intent, conversation) {
    if (conversation.state !== 'SELECTING_SLOT' || !conversation.availableSlots) {
      return {
        text: "I'm not sure which appointment you're referring to. Let's start over - what service would you like to book?"
      };
    }
    
    const slotIndex = parseInt(intent.entities.selection) - 1;
    
    if (slotIndex < 0 || slotIndex >= conversation.availableSlots.length) {
      return {
        text: "Please select a valid time slot number from the list above."
      };
    }
    
    const selectedSlot = conversation.availableSlots[slotIndex];
    const { service, stylist } = conversation.pendingBooking;
    
    // Create the booking
    const booking = await this.square.createAppointment({
      serviceId: this.mapServiceToId(service),
      teamMemberId: stylist ? this.mapStylistToId(stylist) : this.selectAvailableStylist(selectedSlot),
      startAt: selectedSlot.startTime,
      durationMinutes: selectedSlot.duration,
      locationId: this.config.locationId,
      customerId: conversation.customerId || await this.createCustomer(conversation.phoneNumber),
      phoneNumber: conversation.phoneNumber,
      depositRequired: this.requiresDeposit(service),
      depositAmount: this.getDepositAmount(service)
    });
    
    if (!booking.success) {
      return {
        text: booking.error || "I couldn't complete your booking. Please try again or call us directly."
      };
    }
    
    // Clear conversation state
    conversation.state = 'COMPLETED';
    conversation.lastBooking = booking.booking;
    
    return {
      text: booking.message,
      buttons: [
        {
          type: 'QUICK_REPLY',
          text: 'Add to Calendar'
        },
        {
          type: 'QUICK_REPLY', 
          text: 'Share Location'
        }
      ]
    };
  }

  // Send WhatsApp message
  async sendMessage(to, content) {
    try {
      await this.messageLimiter.removeTokens(1);
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: content.text }
      };
      
      // Add interactive elements if present
      if (content.quickReplies) {
        payload.type = 'interactive';
        payload.interactive = {
          type: 'button',
          body: { text: content.text },
          action: {
            buttons: content.quickReplies.map((reply, index) => ({
              type: 'reply',
              reply: {
                id: `quick_reply_${index}`,
                title: reply
              }
            }))
          }
        };
      }
      
      const response = await axios.post(
        `https://graph.facebook.com/v17.0/${this.config.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
      
    } catch (error) {
      console.error('WhatsApp send error:', error.response?.data || error);
      throw error;
    }
  }

  // Conversation state management
  getConversation(phoneNumber) {
    if (!this.conversations.has(phoneNumber)) {
      this.conversations.set(phoneNumber, {
        phoneNumber,
        state: 'NEW',
        created: Date.now(),
        lastActivity: Date.now()
      });
    }
    
    const conversation = this.conversations.get(phoneNumber);
    conversation.lastActivity = Date.now();
    
    return conversation;
  }

  updateConversation(phoneNumber, updates) {
    const conversation = this.conversations.get(phoneNumber);
    Object.assign(conversation, updates);
  }

  cleanupConversations() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [phoneNumber, conversation] of this.conversations) {
      if (conversation.lastActivity < oneHourAgo) {
        this.conversations.delete(phoneNumber);
      }
    }
  }

  // Utility methods
  requiresDeposit(service) {
    const depositServices = ['color', 'highlights', 'treatment'];
    return depositServices.includes(service.toLowerCase());
  }

  getDepositAmount(service) {
    const deposits = {
      'color': 50,
      'highlights': 75,
      'treatment': 30
    };
    
    return deposits[service.toLowerCase()] || 0;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  mapServiceToId(service) {
    const serviceMap = {
      'haircut': 'srv_haircut_001',
      'color': 'srv_color_001',
      'highlights': 'srv_highlights_001',
      'blowdry': 'srv_blowdry_001',
      'treatment': 'srv_treatment_001'
    };
    
    return serviceMap[service.toLowerCase()] || 'srv_general_001';
  }

  mapStylistToId(stylist) {
    // In production, this would query your database
    const stylistMap = {
      'sarah': 'tm_sarah_001',
      'jessica': 'tm_jessica_001',
      'maria': 'tm_maria_001'
    };
    
    return stylistMap[stylist.toLowerCase()];
  }
}

module.exports = WhatsAppSalonHandler;