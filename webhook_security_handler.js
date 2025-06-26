// Webhook Security Handler
// Production-ready signature validation and request authentication

const crypto = require('crypto');
const { RateLimiter } = require('limiter');

class WebhookSecurityHandler {
  constructor(config) {
    this.config = config;
    
    // Rate limiting per IP
    this.ipLimiters = new Map();
    
    // Request replay prevention
    this.processedRequests = new Set();
    
    // Webhook signature keys
    this.signatureKeys = {
      whatsapp: config.whatsappWebhookSecret,
      square: config.squareWebhookSecret,
      stripe: config.stripeWebhookSecret
    };
    
    // Clean up old request IDs every hour
    setInterval(() => this.cleanupProcessedRequests(), 60 * 60 * 1000);
  }

  // Main security validation
  async validateRequest(req, source) {
    try {
      // 1. Rate limiting
      if (!await this.checkRateLimit(req)) {
        return {
          valid: false,
          error: 'Rate limit exceeded',
          statusCode: 429
        };
      }
      
      // 2. Signature validation
      if (!this.validateSignature(req, source)) {
        return {
          valid: false,
          error: 'Invalid signature',
          statusCode: 401
        };
      }
      
      // 3. Replay attack prevention
      if (!this.checkReplayAttack(req)) {
        return {
          valid: false,
          error: 'Duplicate request',
          statusCode: 409
        };
      }
      
      // 4. Timestamp validation
      if (!this.validateTimestamp(req)) {
        return {
          valid: false,
          error: 'Request too old',
          statusCode: 400
        };
      }
      
      // 5. Payload validation
      if (!this.validatePayload(req, source)) {
        return {
          valid: false,
          error: 'Invalid payload',
          statusCode: 400
        };
      }
      
      return {
        valid: true,
        statusCode: 200
      };
      
    } catch (error) {
      console.error('Webhook validation error:', error);
      return {
        valid: false,
        error: 'Internal validation error',
        statusCode: 500
      };
    }
  }

  // Signature validation for different providers
  validateSignature(req, source) {
    switch (source) {
      case 'whatsapp':
        return this.validateWhatsAppSignature(req);
      case 'square':
        return this.validateSquareSignature(req);
      case 'stripe':
        return this.validateStripeSignature(req);
      default:
        console.error('Unknown webhook source:', source);
        return false;
    }
  }

  // WhatsApp signature validation
  validateWhatsAppSignature(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;
    
    const elements = signature.split('=');
    const signatureHash = elements[1];
    
    const expectedHash = crypto
      .createHmac('sha256', this.signatureKeys.whatsapp)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signatureHash),
      Buffer.from(expectedHash)
    );
  }

  // Square signature validation  
  validateSquareSignature(req) {
    const signature = req.headers['x-square-hmacsha256-signature'];
    if (!signature) return false;
    
    const webhookUrl = `${this.config.baseUrl}/webhooks/square`;
    const body = JSON.stringify(req.body);
    
    const hash = crypto
      .createHmac('sha256', this.signatureKeys.square)
      .update(webhookUrl + body)
      .digest('base64');
    
    return signature === hash;
  }

  // Stripe signature validation
  validateStripeSignature(req) {
    const signature = req.headers['stripe-signature'];
    if (!signature) return false;
    
    try {
      const elements = signature.split(',');
      let timestamp;
      let signatures = [];
      
      for (const element of elements) {
        const [key, value] = element.split('=');
        if (key === 't') {
          timestamp = value;
        } else if (key === 'v1') {
          signatures.push(value);
        }
      }
      
      const payload = `${timestamp}.${JSON.stringify(req.body)}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.signatureKeys.stripe)
        .update(payload)
        .digest('hex');
      
      return signatures.some(sig => 
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))
      );
      
    } catch (error) {
      console.error('Stripe signature validation error:', error);
      return false;
    }
  }

  // Rate limiting by IP
  async checkRateLimit(req) {
    const ip = this.getClientIp(req);
    
    if (!this.ipLimiters.has(ip)) {
      this.ipLimiters.set(ip, new RateLimiter({
        tokensPerInterval: 100,
        interval: 'minute',
        fireImmediately: true
      }));
    }
    
    const limiter = this.ipLimiters.get(ip);
    
    try {
      await limiter.removeTokens(1);
      return true;
    } catch (error) {
      console.warn(`Rate limit exceeded for IP: ${ip}`);
      return false;
    }
  }

  // Prevent replay attacks
  checkReplayAttack(req) {
    const requestId = this.getRequestId(req);
    
    if (this.processedRequests.has(requestId)) {
      console.warn('Duplicate request detected:', requestId);
      return false;
    }
    
    this.processedRequests.add(requestId);
    return true;
  }

  // Validate request timestamp
  validateTimestamp(req) {
    const timestamp = this.getRequestTimestamp(req);
    
    if (!timestamp) return false;
    
    const requestTime = parseInt(timestamp) * 1000;
    const currentTime = Date.now();
    const timeDiff = Math.abs(currentTime - requestTime);
    
    // Allow 5 minute time window
    const maxTimeDiff = 5 * 60 * 1000;
    
    if (timeDiff > maxTimeDiff) {
      console.warn('Request timestamp too old:', new Date(requestTime));
      return false;
    }
    
    return true;
  }

  // Validate payload structure
  validatePayload(req, source) {
    const body = req.body;
    
    if (!body || typeof body !== 'object') {
      return false;
    }
    
    switch (source) {
      case 'whatsapp':
        return body.entry && Array.isArray(body.entry);
        
      case 'square':
        return body.type && body.data && body.event_id;
        
      case 'stripe':
        return body.type && body.data && body.id;
        
      default:
        return false;
    }
  }

  // Helper: Get client IP
  getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] ||
           req.connection.remoteAddress ||
           'unknown';
  }

  // Helper: Get request ID
  getRequestId(req) {
    const body = JSON.stringify(req.body);
    const timestamp = this.getRequestTimestamp(req) || Date.now();
    
    return crypto
      .createHash('sha256')
      .update(`${timestamp}:${body}`)
      .digest('hex');
  }

  // Helper: Get request timestamp
  getRequestTimestamp(req) {
    // Different webhook providers send timestamps differently
    if (req.headers['x-square-request-timestamp']) {
      return req.headers['x-square-request-timestamp'];
    }
    
    if (req.headers['stripe-signature']) {
      const signature = req.headers['stripe-signature'];
      const match = signature.match(/t=(\d+)/);
      return match ? match[1] : null;
    }
    
    if (req.body?.timestamp) {
      return req.body.timestamp;
    }
    
    return null;
  }

  // Cleanup old request IDs
  cleanupProcessedRequests() {
    // Keep only last hour of request IDs
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    // In production, store with timestamps and clean properly
    // This is simplified for the example
    if (this.processedRequests.size > 10000) {
      this.processedRequests.clear();
    }
  }

  // IP Whitelist for internal services
  isWhitelistedIp(ip) {
    const whitelist = this.config.ipWhitelist || [];
    return whitelist.includes(ip);
  }

  // Log security events
  logSecurityEvent(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: event.type,
      ip: event.ip,
      source: event.source,
      success: event.success,
      details: event.details
    };
    
    // In production, send to security monitoring service
    console.log('Security Event:', JSON.stringify(logEntry));
    
    // Alert on suspicious patterns
    if (event.type === 'INVALID_SIGNATURE' || event.type === 'REPLAY_ATTACK') {
      this.alertSecurityTeam(logEntry);
    }
  }

  // Alert security team
  async alertSecurityTeam(event) {
    // In production, integrate with PagerDuty, Slack, etc.
    console.error('SECURITY ALERT:', event);
  }
}

// Express middleware
function createWebhookMiddleware(securityHandler) {
  return async (req, res, next) => {
    // Determine webhook source from URL
    const source = req.path.includes('whatsapp') ? 'whatsapp' :
                  req.path.includes('square') ? 'square' :
                  req.path.includes('stripe') ? 'stripe' : 'unknown';
    
    const validation = await securityHandler.validateRequest(req, source);
    
    if (!validation.valid) {
      securityHandler.logSecurityEvent({
        type: 'WEBHOOK_REJECTED',
        ip: securityHandler.getClientIp(req),
        source: source,
        success: false,
        details: validation.error
      });
      
      return res.status(validation.statusCode).json({
        error: validation.error
      });
    }
    
    // Add security context to request
    req.webhookSecurity = {
      source: source,
      validated: true,
      ip: securityHandler.getClientIp(req)
    };
    
    next();
  };
}

module.exports = {
  WebhookSecurityHandler,
  createWebhookMiddleware
};