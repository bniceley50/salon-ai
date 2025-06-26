// Comprehensive Monitoring Setup
// Because you can't fix what you can't see

const Sentry = require('@sentry/node');
const prometheus = require('prom-client');
const StatsD = require('node-statsd');
const winston = require('winston');
const { ElasticsearchTransport } = require('winston-elasticsearch');

class MonitoringSetup {
  constructor(config) {
    this.config = config;
    
    // Initialize all monitoring services
    this.initializeSentry();
    this.initializeMetrics();
    this.initializeLogging();
    this.initializeHealthChecks();
    this.initializeAlerts();
  }

  // Sentry for error tracking
  initializeSentry() {
    Sentry.init({
      dsn: this.config.sentryDsn,
      environment: this.config.environment,
      tracesSampleRate: this.config.environment === 'production' ? 0.1 : 1.0,
      
      beforeSend(event, hint) {
        // Sanitize sensitive data
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers?.authorization;
        }
        
        // Filter out noise
        const error = hint.originalException;
        if (error?.message?.includes('Socket hang up')) {
          return null;
        }
        
        return event;
      },
      
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app: this.app })
      ]
    });
  }

  // Prometheus + StatsD metrics
  initializeMetrics() {
    // Prometheus registry
    this.register = new prometheus.Registry();
    prometheus.collectDefaultMetrics({ register: this.register });
    
    // Custom metrics
    this.metrics = {
      // Business metrics
      bookingsCreated: new prometheus.Counter({
        name: 'bookings_created_total',
        help: 'Total bookings created',
        labelNames: ['service', 'stylist', 'source']
      }),
      
      disastersPrevented: new prometheus.Counter({
        name: 'disasters_prevented_total',
        help: 'Color disasters prevented by AI',
        labelNames: ['severity', 'formula_type']
      }),
      
      revenue: new prometheus.Gauge({
        name: 'revenue_total',
        help: 'Total revenue',
        labelNames: ['type', 'period']
      }),
      
      // Technical metrics
      apiDuration: new prometheus.Histogram({
        name: 'api_duration_seconds',
        help: 'API request duration',
        labelNames: ['method', 'route', 'status'],
        buckets: [0.1, 0.5, 1, 2, 5]
      }),
      
      aiCost: new prometheus.Counter({
        name: 'ai_cost_dollars',
        help: 'AI API costs',
        labelNames: ['provider', 'model', 'operation']
      }),
      
      webhookLatency: new prometheus.Histogram({
        name: 'webhook_latency_ms',
        help: 'Webhook processing latency',
        labelNames: ['source', 'type'],
        buckets: [10, 50, 100, 500, 1000, 5000]
      }),
      
      // User metrics
      activeUsers: new prometheus.Gauge({
        name: 'active_users',
        help: 'Currently active users',
        labelNames: ['tier', 'platform']
      }),
      
      featureUsage: new prometheus.Counter({
        name: 'feature_usage_total',
        help: 'Feature usage tracking',
        labelNames: ['feature', 'user_tier']
      })
    };
    
    // Register all metrics
    Object.values(this.metrics).forEach(metric => {
      this.register.registerMetric(metric);
    });
    
    // StatsD for real-time metrics
    this.statsd = new StatsD({
      host: this.config.statsdHost,
      port: 8125,
      prefix: 'salonai.'
    });
  }

  // Comprehensive logging
  initializeLogging() {
    const esTransport = new ElasticsearchTransport({
      level: 'info',
      clientOpts: { 
        node: this.config.elasticsearchUrl,
        auth: {
          username: this.config.elasticsearchUser,
          password: this.config.elasticsearchPass
        }
      },
      index: 'salon-ai-logs'
    });
    
    this.logger = winston.createLogger({
      level: this.config.logLevel || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      
      defaultMeta: {
        service: 'salon-ai',
        environment: this.config.environment
      },
      
      transports: [
        // Console for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        
        // File for backup
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error' 
        }),
        
        new winston.transports.File({ 
          filename: 'logs/combined.log' 
        }),
        
        // Elasticsearch for searching
        esTransport
      ]
    });
  }

  // Health checks
  initializeHealthChecks() {
    this.healthChecks = {
      database: async () => {
        try {
          await this.db.query('SELECT 1');
          return { status: 'healthy', latency: 0 };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      },
      
      redis: async () => {
        try {
          const start = Date.now();
          await this.redis.ping();
          return { status: 'healthy', latency: Date.now() - start };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      },
      
      whatsapp: async () => {
        try {
          const response = await this.checkWhatsAppHealth();
          return { status: response.status, latency: response.latency };
        } catch (error) {
          return { status: 'degraded', error: error.message };
        }
      },
      
      square: async () => {
        try {
          const response = await this.square.locationsApi.listLocations();
          return { status: 'healthy', locations: response.result.locations.length };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      },
      
      ai: async () => {
        try {
          const start = Date.now();
          await this.openai.models.list();
          return { status: 'healthy', latency: Date.now() - start };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      }
    };
  }

  // Alert configuration
  initializeAlerts() {
    this.alertRules = [
      {
        name: 'High Error Rate',
        condition: () => this.getErrorRate() > 0.05,
        severity: 'critical',
        action: 'page',
        message: 'Error rate exceeds 5%'
      },
      
      {
        name: 'API Latency',
        condition: () => this.getP95Latency() > 5000,
        severity: 'warning',
        action: 'slack',
        message: 'API p95 latency exceeds 5 seconds'
      },
      
      {
        name: 'Low Disk Space',
        condition: () => this.getDiskUsage() > 0.9,
        severity: 'critical',
        action: 'page',
        message: 'Disk usage exceeds 90%'
      },
      
      {
        name: 'High AI Costs',
        condition: () => this.getHourlyAICost() > 100,
        severity: 'warning',
        action: 'email',
        message: 'AI costs exceeding $100/hour'
      },
      
      {
        name: 'Booking Failures',
        condition: () => this.getBookingFailureRate() > 0.1,
        severity: 'critical',
        action: 'page',
        message: 'Booking failure rate exceeds 10%'
      },
      
      {
        name: 'Redis Memory',
        condition: () => this.getRedisMemory() > 0.8,
        severity: 'warning',
        action: 'slack',
        message: 'Redis memory usage exceeds 80%'
      }
    ];
  }

  // Monitoring middleware
  createMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      // Track request
      this.statsd.increment('http.requests');
      
      // Capture response
      const originalSend = res.send;
      res.send = function(data) {
        res.send = originalSend;
        
        // Record metrics
        const duration = (Date.now() - start) / 1000;
        const labels = {
          method: req.method,
          route: req.route?.path || 'unknown',
          status: res.statusCode
        };
        
        this.metrics.apiDuration.observe(labels, duration);
        this.statsd.timing('http.response_time', Date.now() - start);
        
        // Log request
        this.logger.info('HTTP Request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: duration,
          userAgent: req.headers['user-agent'],
          ip: req.ip
        });
        
        return res.send(data);
      }.bind(this);
      
      next();
    };
  }

  // Track business events
  trackBusinessEvent(event, data) {
    switch (event) {
      case 'booking_created':
        this.metrics.bookingsCreated.inc({
          service: data.service,
          stylist: data.stylist,
          source: data.source
        });
        this.statsd.increment('bookings.created');
        break;
        
      case 'disaster_prevented':
        this.metrics.disastersPrevented.inc({
          severity: data.severity,
          formula_type: data.formulaType
        });
        this.logger.warn('Disaster Prevented', data);
        break;
        
      case 'payment_received':
        this.metrics.revenue.inc({
          type: data.type,
          period: 'daily'
        }, data.amount);
        this.statsd.gauge('revenue.daily', data.amount);
        break;
        
      case 'feature_used':
        this.metrics.featureUsage.inc({
          feature: data.feature,
          user_tier: data.userTier
        });
        break;
    }
  }

  // Custom dashboards
  generateDashboard() {
    return {
      technical: {
        uptime: this.calculateUptime(),
        errorRate: this.getErrorRate(),
        latency: {
          p50: this.getP50Latency(),
          p95: this.getP95Latency(),
          p99: this.getP99Latency()
        },
        throughput: this.getThroughput()
      },
      
      business: {
        bookingsToday: this.getBookingsToday(),
        disastersPrevented: this.getDisastersPrevented(),
        revenue: {
          today: this.getRevenueToday(),
          mtd: this.getRevenueMTD(),
          mrr: this.getMRR()
        },
        activeUsers: this.getActiveUsers()
      },
      
      infrastructure: {
        cpu: this.getCPUUsage(),
        memory: this.getMemoryUsage(),
        disk: this.getDiskUsage(),
        networkIO: this.getNetworkIO()
      },
      
      alerts: this.getActiveAlerts()
    };
  }

  // Alert execution
  async checkAlerts() {
    for (const rule of this.alertRules) {
      try {
        if (await rule.condition()) {
          await this.sendAlert(rule);
        }
      } catch (error) {
        this.logger.error('Alert check failed', { rule: rule.name, error });
      }
    }
  }

  // Send alerts
  async sendAlert(rule) {
    const alert = {
      name: rule.name,
      severity: rule.severity,
      message: rule.message,
      timestamp: new Date(),
      environment: this.config.environment
    };
    
    switch (rule.action) {
      case 'page':
        await this.pagerDuty.sendAlert(alert);
        break;
        
      case 'slack':
        await this.slack.sendAlert(alert);
        break;
        
      case 'email':
        await this.email.sendAlert(alert);
        break;
    }
    
    // Log alert
    this.logger.error('Alert triggered', alert);
    this.statsd.increment(`alerts.${rule.severity}`);
  }

  // Expose metrics endpoint
  getMetricsEndpoint() {
    return async (req, res) => {
      res.set('Content-Type', this.register.contentType);
      res.end(await this.register.metrics());
    };
  }

  // Health check endpoint
  getHealthEndpoint() {
    return async (req, res) => {
      const checks = {};
      
      for (const [name, check] of Object.entries(this.healthChecks)) {
        checks[name] = await check();
      }
      
      const overall = Object.values(checks).every(c => c.status === 'healthy');
      
      res.status(overall ? 200 : 503).json({
        status: overall ? 'healthy' : 'unhealthy',
        timestamp: new Date(),
        checks: checks
      });
    };
  }
}

module.exports = MonitoringSetup;