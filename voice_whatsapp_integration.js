// Voice-Enabled WhatsApp Integration for Salons
// Hands-free operation for busy stylists

const OpenAI = require('openai');
const { Readable } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');

class VoiceWhatsAppIntegration {
  constructor(config) {
    this.config = config;
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    
    // Voice processing queue
    this.voiceQueue = [];
    this.processing = false;
    
    // Conversation context for better voice understanding
    this.voiceContexts = new Map();
    
    // Supported voice commands
    this.voiceCommands = this.initializeVoiceCommands();
  }

  // Process incoming voice message
  async processVoiceMessage(message) {
    const { from, voice } = message;
    
    try {
      // Download voice file from WhatsApp
      const audioBuffer = await this.downloadVoiceFile(voice.id);
      
      // Convert to format supported by Whisper (opus to mp3)
      const mp3Buffer = await this.convertAudio(audioBuffer);
      
      // Transcribe with Whisper
      const transcription = await this.transcribeAudio(mp3Buffer, from);
      
      // Get voice context for better understanding
      const context = this.getVoiceContext(from);
      
      // Process transcribed text with context
      const intent = await this.processVoiceCommand(transcription.text, context);
      
      // Execute action based on intent
      const response = await this.executeVoiceAction(intent, from);
      
      // Send response (text or voice based on preference)
      await this.sendVoiceResponse(from, response, context.preferVoice);
      
      // Update context
      this.updateVoiceContext(from, transcription.text, intent);
      
      return {
        success: true,
        transcription: transcription.text,
        action: intent.action,
        response: response
      };
      
    } catch (error) {
      console.error('Voice processing error:', error);
      
      await this.sendTextMessage(from, 
        "Sorry, I couldn't understand that. Try speaking more clearly or type your request."
      );
      
      return { success: false, error: error.message };
    }
  }

  // Transcribe audio using Whisper API
  async transcribeAudio(audioBuffer, userId) {
    try {
      // Create a readable stream from buffer
      const audioStream = Readable.from(audioBuffer);
      audioStream.path = 'audio.mp3'; // Whisper needs a filename
      
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
        language: "en",
        prompt: this.getWhisperPrompt(userId)
      });
      
      return {
        text: transcription.text,
        confidence: this.estimateConfidence(transcription.text)
      };
      
    } catch (error) {
      console.error('Whisper transcription error:', error);
      throw new Error('Failed to transcribe audio');
    }
  }

  // Get context-aware prompt for Whisper
  getWhisperPrompt(userId) {
    const context = this.voiceContexts.get(userId);
    
    if (!context || !context.lastTranscription) {
      return "Hair salon booking system. Common words: appointment, haircut, color, highlights, tomorrow, cancel, Sarah, Jessica";
    }
    
    // Provide context from last interaction
    return `Previous: "${context.lastTranscription}". Hair salon context. Names: Sarah, Jessica, Maria.`;
  }

  // Process voice command with intent recognition
  async processVoiceCommand(text, context) {
    // First try exact command matching
    const exactMatch = this.matchExactCommand(text);
    if (exactMatch) {
      return exactMatch;
    }
    
    // Use GPT for natural language understanding
    try {
      const systemPrompt = `You are processing voice commands for a hair salon. 
Previous context: ${JSON.stringify(context.recent)}
Common commands:
- "What's my next appointment"
- "Book me with Sarah tomorrow"  
- "Check if we have color in stock"
- "Show today's schedule"
- "Cancel my 2pm"

Extract the intent and relevant details from the voice command.`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        temperature: 0.3,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content);
      
    } catch (error) {
      console.error('GPT voice processing error:', error);
      return { action: 'UNCLEAR', text: text };
    }
  }

  // Execute voice action
  async executeVoiceAction(intent, userId) {
    switch (intent.action) {
      case 'CHECK_NEXT_APPOINTMENT':
        return await this.getNextAppointment(userId);
        
      case 'QUICK_BOOK':
        return await this.quickBook(intent.details, userId);
        
      case 'CHECK_INVENTORY':
        return await this.checkInventory(intent.details.product);
        
      case 'VIEW_SCHEDULE':
        return await this.getTodaySchedule(intent.details.stylist);
        
      case 'CANCEL_APPOINTMENT':
        return await this.cancelByVoice(intent.details, userId);
        
      case 'SET_TIMER':
        return await this.setProcessingTimer(intent.details);
        
      default:
        return "I didn't catch that. You can ask about appointments, check inventory, or view schedules.";
    }
  }

  // Voice command implementations
  async getNextAppointment(userId) {
    // Get stylist info from user ID
    const stylist = await this.getStylistByPhone(userId);
    
    if (!stylist) {
      return "I don't have you registered as a stylist. Please contact management.";
    }
    
    const nextAppt = await this.square.getNextAppointment(stylist.id);
    
    if (!nextAppt) {
      return "You don't have any appointments scheduled for today.";
    }
    
    const time = new Date(nextAppt.startAt);
    const timeStr = time.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
    
    return `Your next appointment is ${nextAppt.customerName} at ${timeStr} for ${nextAppt.service}. ${this.getColorNotes(nextAppt)}`;
  }

  async quickBook(details, userId) {
    const { service, time, customer } = details;
    
    // For voice bookings, prefer next available slot
    if (!time || time === 'next available') {
      const nextSlot = await this.getNextAvailableSlot(service);
      
      if (!nextSlot) {
        return `No ${service} appointments available today. First opening is tomorrow at 10 AM.`;
      }
      
      // Confirm before booking
      this.voiceContexts.get(userId).pendingBooking = {
        slot: nextSlot,
        service: service,
        customer: customer
      };
      
      return `I found an opening at ${this.formatTime(nextSlot.startAt)} for ${service}. Say 'confirm' to book it.`;
    }
    
    // Book specific time
    const booking = await this.createQuickBooking(details);
    
    if (booking.success) {
      return `Booked! ${customer} is scheduled for ${service} at ${time}. Confirmation sent.`;
    }
    
    return `Couldn't book that appointment. ${booking.error}`;
  }

  async checkInventory(product) {
    const inventory = await this.getInventoryLevel(product);
    
    if (!inventory) {
      return `I don't show ${product} in our inventory system.`;
    }
    
    if (inventory.quantity < inventory.reorderPoint) {
      return `${product}: Only ${inventory.quantity} left. Below reorder point. Should I place an order?`;
    }
    
    return `${product}: ${inventory.quantity} units in stock. You're good.`;
  }

  // Generate voice response using TTS
  async sendVoiceResponse(to, text, preferVoice = false) {
    if (!preferVoice) {
      return await this.sendTextMessage(to, text);
    }
    
    try {
      // Generate speech using OpenAI TTS
      const mp3 = await this.openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy", // Professional, clear voice
        input: text,
        speed: 0.9 // Slightly slower for clarity
      });
      
      const buffer = Buffer.from(await mp3.arrayBuffer());
      
      // Send voice message via WhatsApp
      await this.sendWhatsAppVoice(to, buffer);
      
    } catch (error) {
      console.error('TTS error:', error);
      // Fallback to text
      await this.sendTextMessage(to, text);
    }
  }

  // Initialize common voice commands
  initializeVoiceCommands() {
    return {
      // Appointment queries
      "what's my next": { action: 'CHECK_NEXT_APPOINTMENT' },
      "next appointment": { action: 'CHECK_NEXT_APPOINTMENT' },
      "who's next": { action: 'CHECK_NEXT_APPOINTMENT' },
      
      // Quick booking
      "book": { action: 'QUICK_BOOK', requiresDetails: true },
      "schedule": { action: 'QUICK_BOOK', requiresDetails: true },
      
      // Inventory
      "check inventory": { action: 'CHECK_INVENTORY', requiresDetails: true },
      "do we have": { action: 'CHECK_INVENTORY', requiresDetails: true },
      
      // Schedule view
      "show schedule": { action: 'VIEW_SCHEDULE' },
      "today's appointments": { action: 'VIEW_SCHEDULE' },
      
      // Timers (for processing)
      "set timer": { action: 'SET_TIMER', requiresDetails: true },
      "remind me in": { action: 'SET_TIMER', requiresDetails: true }
    };
  }

  // Voice context management
  getVoiceContext(userId) {
    if (!this.voiceContexts.has(userId)) {
      this.voiceContexts.set(userId, {
        userId: userId,
        recent: [],
        preferVoice: true,
        lastTranscription: null,
        pendingAction: null
      });
    }
    
    return this.voiceContexts.get(userId);
  }

  updateVoiceContext(userId, transcription, intent) {
    const context = this.voiceContexts.get(userId);
    
    context.lastTranscription = transcription;
    context.recent.push({
      text: transcription,
      intent: intent,
      timestamp: Date.now()
    });
    
    // Keep only last 5 interactions
    if (context.recent.length > 5) {
      context.recent.shift();
    }
  }

  // Audio conversion helper
  async convertAudio(inputBuffer) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      
      ffmpeg()
        .input(Readable.from(inputBuffer))
        .inputFormat('ogg')
        .audioCodec('libmp3lame')
        .audioChannels(1)
        .audioFrequency(16000)
        .format('mp3')
        .on('error', reject)
        .on('end', () => resolve(Buffer.concat(chunks)))
        .pipe()
        .on('data', chunk => chunks.push(chunk));
    });
  }

  // Helper functions
  formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  getColorNotes(appointment) {
    if (appointment.service.includes('color')) {
      return appointment.notes ? 
        `Note: ${appointment.notes}` : 
        'Remember to check porosity!';
    }
    return '';
  }

  // Processing timer for color/chemical services
  async setProcessingTimer(details) {
    const { duration, service } = details;
    const minutes = this.parseDuration(duration);
    
    setTimeout(() => {
      this.sendTimerAlert(details.userId, service, minutes);
    }, minutes * 60 * 1000);
    
    return `Timer set for ${minutes} minutes. I'll alert you when ${service} is ready to rinse.`;
  }
}

module.exports = VoiceWhatsAppIntegration;