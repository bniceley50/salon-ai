// Hybrid GPT-Powered WhatsApp Handler
// Combines template simplicity with GPT intelligence

const OpenAI = require('openai');
const { WhatsAppSalonHandler } = require('./whatsapp_salon_handler');

class HybridGPTWhatsAppHandler extends WhatsAppSalonHandler {
  constructor(config) {
    super(config);
    
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey
    });
    
    // Template cache for common requests
    this.templateCache = new Map();
    this.loadTemplates();
    
    // GPT usage metrics
    this.gptMetrics = {
      calls: 0,
      tokens: 0,
      cost: 0
    };
  }

  // Override message parsing with GPT
  async parseIntent(message, conversation) {
    // First, try template matching for common phrases
    const templateMatch = this.matchTemplate(message);
    if (templateMatch) {
      this.metrics.templateHits++;
      return templateMatch;
    }
    
    // Fall back to GPT for complex requests
    return await this.parseWithGPT(message, conversation);
  }

  // GPT-powered intent parsing
  async parseWithGPT(message, conversation) {
    try {
      const systemPrompt = `You are a hair salon booking assistant. Parse customer messages and extract:
1. Intent: BOOK_APPOINTMENT, CHECK_AVAILABILITY, CANCEL, RESCHEDULE, or GENERAL_INQUIRY
2. Service: haircut, color, highlights, blowdry, treatment
3. Stylist name (if mentioned)
4. Date/time preferences
5. Any special requests

Previous context: ${JSON.stringify(conversation.pendingBooking || {})}

Respond in JSON format.`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        temperature: 0.3,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content);
      
      // Track usage
      this.gptMetrics.calls++;
      this.gptMetrics.tokens += completion.usage.total_tokens;
      this.gptMetrics.cost += (completion.usage.total_tokens * 0.002) / 1000;
      
      return {
        type: result.intent,
        entities: {
          service: result.service,
          stylist: result.stylist,
          dateTime: this.parseDateTime(result.dateTime),
          specialRequests: result.specialRequests
        },
        confidence: result.confidence || 0.9
      };
      
    } catch (error) {
      console.error('GPT parsing error:', error);
      
      // Fallback to basic parsing
      return this.basicParse(message);
    }
  }

  // Generate natural responses with GPT
  async generateResponse(intent, data, conversation) {
    // Use templates for common responses
    if (this.hasTemplate(intent.type, data.scenario)) {
      return this.applyTemplate(intent.type, data);
    }
    
    // Generate with GPT for complex scenarios
    try {
      const prompt = this.buildResponsePrompt(intent, data, conversation);
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { 
            role: "system", 
            content: "You are a friendly hair salon receptionist. Keep responses brief and conversational. Include emojis sparingly." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      return completion.choices[0].message.content;
      
    } catch (error) {
      console.error('GPT response generation error:', error);
      return this.getFallbackResponse(intent.type, data);
    }
  }

  // Template matching for common requests
  matchTemplate(message) {
    const lowerMessage = message.toLowerCase();
    
    const templates = [
      {
        patterns: ['book', 'appointment', 'schedule'],
        intent: 'BOOK_APPOINTMENT'
      },
      {
        patterns: ['available', 'availability', 'free', 'open'],
        intent: 'CHECK_AVAILABILITY'
      },
      {
        patterns: ['cancel', 'cancellation'],
        intent: 'CANCEL'
      },
      {
        patterns: ['reschedule', 'change', 'move'],
        intent: 'RESCHEDULE'
      },
      {
        patterns: ['price', 'cost', 'how much'],
        intent: 'PRICING'
      }
    ];
    
    for (const template of templates) {
      if (template.patterns.some(pattern => lowerMessage.includes(pattern))) {
        // Extract entities with regex
        const entities = this.extractEntitiesFromTemplate(message);
        
        return {
          type: template.intent,
          entities: entities,
          confidence: 0.95,
          method: 'template'
        };
      }
    }
    
    return null;
  }

  // Extract entities using pattern matching
  extractEntitiesFromTemplate(message) {
    const entities = {};
    
    // Service detection
    const services = ['haircut', 'color', 'highlights', 'blowdry', 'treatment'];
    for (const service of services) {
      if (message.toLowerCase().includes(service)) {
        entities.service = service;
        break;
      }
    }
    
    // Time extraction
    const timePatterns = [
      /tomorrow/i,
      /next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /(\d{1,2})(:\d{2})?\s*(am|pm)/i,
      /(morning|afternoon|evening)/i
    ];
    
    for (const pattern of timePatterns) {
      const match = message.match(pattern);
      if (match) {
        entities.dateTime = this.parseTimeExpression(match[0]);
        break;
      }
    }
    
    // Stylist extraction
    const stylistPattern = /with ([\w]+)/i;
    const stylistMatch = message.match(stylistPattern);
    if (stylistMatch) {
      entities.stylist = stylistMatch[1];
    }
    
    return entities;
  }

  // Build response prompt for GPT
  buildResponsePrompt(intent, data, conversation) {
    const context = {
      intent: intent.type,
      service: data.service,
      availableSlots: data.slots?.length || 0,
      customerName: conversation.customerName || 'there',
      previousVisits: conversation.visitCount || 0
    };
    
    return `Generate a friendly response for a hair salon booking system.
Context: ${JSON.stringify(context)}
Task: ${this.getTaskDescription(intent.type)}
Include: ${this.getInclusionRequirements(intent.type)}
Tone: Friendly, professional, concise`;
  }

  // Cost optimization: Batch similar requests
  async batchProcess(messages) {
    if (messages.length === 1) {
      return [await this.parseIntent(messages[0].text, messages[0].conversation)];
    }
    
    // Group similar messages
    const batches = this.groupSimilarMessages(messages);
    const results = [];
    
    for (const batch of batches) {
      if (batch.length === 1) {
        results.push(await this.parseIntent(batch[0].text, batch[0].conversation));
      } else {
        // Process batch with GPT
        const batchResults = await this.batchGPTProcess(batch);
        results.push(...batchResults);
      }
    }
    
    return results;
  }

  // Monitor and optimize GPT usage
  getUsageReport() {
    const avgCostPerMessage = this.gptMetrics.cost / this.gptMetrics.calls;
    const templateHitRate = this.metrics.templateHits / 
      (this.metrics.templateHits + this.gptMetrics.calls);
    
    return {
      totalGPTCalls: this.gptMetrics.calls,
      totalTokens: this.gptMetrics.tokens,
      totalCost: `$${this.gptMetrics.cost.toFixed(4)}`,
      avgCostPerMessage: `$${avgCostPerMessage.toFixed(4)}`,
      templateHitRate: `${(templateHitRate * 100).toFixed(1)}%`,
      recommendation: templateHitRate < 0.7 
        ? 'Consider adding more templates for common requests'
        : 'Good template coverage'
    };
  }

  // Fallback responses when GPT fails
  getFallbackResponse(intentType, data) {
    const fallbacks = {
      'BOOK_APPOINTMENT': `I'd love to help you book an appointment! Our ${data.service || 'services'} are available ${data.nextAvailable || 'this week'}. What day works best for you?`,
      
      'CHECK_AVAILABILITY': `Let me check our availability for you. We typically have openings throughout the week. What service are you interested in?`,
      
      'CANCEL': `I can help you cancel your appointment. Please provide your confirmation number or the date/time of your appointment.`,
      
      'GENERAL_INQUIRY': `Thanks for reaching out! How can I help you today? You can book appointments, check availability, or ask about our services.`
    };
    
    return fallbacks[intentType] || fallbacks['GENERAL_INQUIRY'];
  }
}

module.exports = HybridGPTWhatsAppHandler;