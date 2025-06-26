/**
 * Voice Integration for Booth Rental Management
 * Enables hands-free balance checks and payment confirmations while stylists work
 * THIS is actually useful - stylists have their hands full of chemicals
 */

const { Readable } = require('stream');
const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');

class BoothRentalVoice {
  constructor(rentalManager) {
    this.rentalManager = rentalManager;
    
    // Initialize speech clients
    this.speechClient = new speech.SpeechClient();
    this.ttsClient = new textToSpeech.TextToSpeechClient();
    
    // Voice command patterns
    this.voiceCommands = {
      balance: [
        'what\'s my balance',
        'how much do i owe',
        'what do i owe',
        'check my balance',
        'rent balance'
      ],
      commission: [
        'what\'s my commission',
        'how much commission',
        'commission earned',
        'my earnings',
        'product sales'
      ],
      payment: [
        'make a payment',
        'pay my rent',
        'pay rent',
        'process payment',
        'pay now'
      ],
      help: [
        'help',
        'what can you do',
        'commands',
        'options'
      ]
    };
  }

  /**
   * Process voice message from WhatsApp
   */
  async processVoiceMessage(audioUrl, phoneNumber) {
    try {
      // Download and transcribe audio
      const transcript = await this.transcribeAudio(audioUrl);
      console.log(`Voice transcript from ${phoneNumber}: ${transcript}`);

      // Identify intent
      const intent = this.identifyIntent(transcript.toLowerCase());
      
      // Generate response based on intent
      let response;
      switch (intent.command) {
        case 'balance':
          response = await this.handleBalanceVoice(phoneNumber);
          break;
        case 'commission':
          response = await this.handleCommissionVoice(phoneNumber);
          break;
        case 'payment':
          response = await this.handlePaymentVoice(phoneNumber);
          break;
        default:
          response = this.getHelpResponse();
      }

      // Convert response to speech
      const audioResponse = await this.textToSpeech(response.text);
      
      return {
        transcript,
        intent,
        textResponse: response.text,
        audioResponse,
        followUp: response.followUp
      };

    } catch (error) {
      console.error('Voice processing error:', error);
      return {
        error: true,
        textResponse: 'Sorry, I couldn\'t process your voice message. Please try texting your request.'
      };
    }
  }

  /**
   * Transcribe audio to text
   */
  async transcribeAudio(audioUrl) {
    // In production, download audio from URL
    // For now, simulate transcription
    
    const request = {
      config: {
        encoding: 'OGG_OPUS',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        model: 'latest_long',
        useEnhanced: true,
      },
      audio: {
        uri: audioUrl, // In production, use Google Cloud Storage URL
      },
    };

    // Simulate transcription for demo
    return "What's my balance?";
    
    // Real implementation:
    // const [response] = await this.speechClient.recognize(request);
    // return response.results
    //   .map(result => result.alternatives[0].transcript)
    //   .join(' ');
  }

  /**
   * Identify user intent from transcript
   */
  identifyIntent(transcript) {
    // Check each command category
    for (const [command, patterns] of Object.entries(this.voiceCommands)) {
      if (patterns.some(pattern => transcript.includes(pattern))) {
        return {
          command,
          confidence: 0.9,
          transcript
        };
      }
    }

    // Check for partial matches
    const words = transcript.split(' ');
    if (words.includes('balance') || words.includes('owe')) {
      return { command: 'balance', confidence: 0.7, transcript };
    }
    if (words.includes('commission') || words.includes('earned')) {
      return { command: 'commission', confidence: 0.7, transcript };
    }
    if (words.includes('pay') || words.includes('payment')) {
      return { command: 'payment', confidence: 0.7, transcript };
    }

    return { command: 'unknown', confidence: 0.3, transcript };
  }

  /**
   * Handle balance inquiry via voice
   */
  async handleBalanceVoice(phoneNumber) {
    const renterId = phoneNumber;
    const balanceInfo = this.rentalManager.getBalanceInquiry(renterId);

    if (balanceInfo.error) {
      return {
        text: 'I don\'t have your rental information on file. Please text SETUP to get started.',
        followUp: 'TEXT_SETUP'
      };
    }

    const dueText = balanceInfo.breakdown.dueDate.includes('in') ? 
      `due ${balanceInfo.breakdown.dueDate}` : 
      `${balanceInfo.breakdown.dueDate}`;

    let text = `Hi ${balanceInfo.renter}, your current balance is $${balanceInfo.currentBalance}, ${dueText}. `;
    
    if (balanceInfo.breakdown.commissionsThisMonth > 0) {
      text += `You've earned $${balanceInfo.breakdown.commissionsThisMonth} in commissions this month, which has been credited to your account. `;
    }

    if (balanceInfo.currentBalance > 0) {
      text += `To make a payment, just say "pay my rent" or text PAY.`;
    } else {
      text += `You're all paid up!`;
    }

    return {
      text,
      followUp: balanceInfo.currentBalance > 0 ? 'PAYMENT_AVAILABLE' : 'NONE'
    };
  }

  /**
   * Handle commission inquiry via voice
   */
  async handleCommissionVoice(phoneNumber) {
    const renterId = phoneNumber;
    const currentMonth = new Date();
    const commissionTotal = this.rentalManager.getMonthlyCommissions(renterId, currentMonth);
    const details = this.rentalManager.getCommissionDetails(renterId, 3); // Just top 3 for voice

    let text = `You've earned $${commissionTotal.toFixed(2)} in commissions this month. `;
    
    if (details.length > 0) {
      text += `Your recent sales include: `;
      details.forEach((sale, i) => {
        text += `${sale.product} on ${sale.date} earning ${sale.earned}. `;
      });
    }

    text += `This amount will be deducted from your next rent payment. For a full report, text COMMISSION.`;

    return {
      text,
      followUp: 'TEXT_COMMISSION_DETAILS'
    };
  }

  /**
   * Handle payment request via voice
   */
  async handlePaymentVoice(phoneNumber) {
    const renterId = phoneNumber;
    const rentDue = this.rentalManager.calculateRentDue(renterId);

    if (rentDue.error) {
      return {
        text: 'I don\'t have your rental information. Please text SETUP to get started.',
        followUp: 'TEXT_SETUP'
      };
    }

    const amount = rentDue.breakdown.netAmount;

    return {
      text: `Your total amount due is $${amount}, including rent and processing fees. To confirm this payment, please text PAY. You'll receive a receipt immediately after processing.`,
      followUp: 'TEXT_PAY_CONFIRM'
    };
  }

  /**
   * Get help response
   */
  getHelpResponse() {
    return {
      text: `I can help you with booth rental payments. You can ask me: What's my balance? What's my commission? Or say: Make a payment. You can also text commands like BAL, COMMISSION, or PAY anytime.`,
      followUp: 'NONE'
    };
  }

  /**
   * Convert text to speech
   */
  async textToSpeech(text) {
    const request = {
      input: { text },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Neural2-F', // Professional female voice
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'OGG_OPUS',
        speakingRate: 1.0,
        pitch: 0.0,
        volumeGainDb: 0.0
      },
    };

    try {
      const [response] = await this.ttsClient.synthesizeSpeech(request);
      return response.audioContent;
    } catch (error) {
      console.error('TTS error:', error);
      return null;
    }
  }

  /**
   * Generate voice-friendly rent reminder
   */
  generateVoiceReminder(renterId) {
    const rentDue = this.rentalManager.calculateRentDue(renterId);
    const renter = this.rentalManager.renters.get(renterId);
    
    let message = `Hi ${renter.name}, this is your booth rental reminder. `;

    if (rentDue.isLate) {
      message += `Your rent is ${rentDue.daysLate} days overdue. `;
      message += `The total amount due, including late fees, is $${rentDue.breakdown.netAmount}. `;
      message += `Please make a payment today to avoid additional fees. `;
    } else {
      message += `Your rent of $${rentDue.breakdown.totalDue} is due in ${rentDue.daysUntilDue} days. `;
      if (rentDue.breakdown.commissionsEarned > 0) {
        message += `Good news! You've earned $${rentDue.breakdown.commissionsEarned} in commissions, `;
        message += `so your actual payment will be $${rentDue.breakdown.totalDue}. `;
      }
    }

    message += `To pay now, just say "pay my rent" or text PAY. Thank you!`;

    return message;
  }

  /**
   * Process voice commands for salon owner
   */
  async processOwnerVoiceCommand(transcript, phoneNumber) {
    const lowerTranscript = transcript.toLowerCase();

    // Owner-specific commands
    if (lowerTranscript.includes('booth report') || lowerTranscript.includes('rental report')) {
      const report = this.rentalManager.generateOwnerReport();
      
      let text = `Here's your booth rental report for ${new Date().toLocaleDateString('en-US', { month: 'long' })}. `;
      text += `You have ${report.summary.totalBooths} booths rented. `;
      text += `Expected revenue is $${report.summary.expectedRevenue}. `;
      text += `You've collected $${report.summary.actualCollected} so far, `;
      text += `with $${report.summary.pendingPayments} still pending. `;
      text += `Your collection rate is ${report.summary.collectionRate} percent. `;
      
      const lateRenters = report.renters.filter(r => r.status === 'LATE');
      if (lateRenters.length > 0) {
        text += `${lateRenters.length} renters are late on payment. `;
        text += `Text REPORT for full details.`;
      }

      return { text, followUp: 'TEXT_REPORT_DETAILS' };
    }

    if (lowerTranscript.includes('send reminders') || lowerTranscript.includes('payment reminder')) {
      // Trigger reminder sending
      const pending = this.rentalManager.renters.size; // Count pending payments
      
      return {
        text: `Sending payment reminders to ${pending} booth renters. They'll receive WhatsApp messages with their current balance and payment options. You'll get a summary report when complete.`,
        followUp: 'REMINDERS_SENT'
      };
    }

    return this.getHelpResponse();
  }
}

module.exports = BoothRentalVoice;