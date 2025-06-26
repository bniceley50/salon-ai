// Real-time Analytics Dashboard
// Track everything that matters for growth

const { EventEmitter } = require('events');

class AnalyticsDashboard extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    
    // Real-time metrics
    this.metrics = {
      realtime: new Map(),
      historical: new Map(),
      predictions: new Map()
    };
    
    // Dashboard components
    this.components = this.initializeComponents();
    
    // Start real-time tracking
    this.startRealtimeTracking();
  }

  initializeComponents() {
    return {
      // Core Business Metrics
      businessMetrics: {
        revenue: {
          mrr: { current: 0, growth: 0, churn: 0 },
          arr: { current: 0, projected: 0 },
          ltv: { average: 0, byTier: new Map() },
          cac: { blended: 0, byChannel: new Map() }
        },
        
        usage: {
          dau: 0, // Daily active users
          mau: 0, // Monthly active users
          engagement: { average: 0, distribution: [] },
          retention: { day1: 0, day7: 0, day30: 0 }
        },
        
        growth: {
          signups: { today: 0, week: 0, month: 0 },
          conversions: { rate: 0, bySource: new Map() },
          viral: { coefficient: 0, cycleTime: 0 },
          referrals: { sent: 0, accepted: 0, converted: 0 }
        }
      },

      // Product Analytics
      productMetrics: {
        features: {
          adoption: new Map(), // Feature -> adoption rate
          usage: new Map(),    // Feature -> usage frequency
          value: new Map()     // Feature -> business value
        },
        
        aiPerformance: {
          accuracy: { formulas: 0, bookings: 0, nlp: 0 },
          speed: { p50: 0, p95: 0, p99: 0 },
          cost: { perRequest: 0, perUser: 0, total: 0 }
        },
        
        userJourneys: {
          onboarding: { completion: 0, dropoff: new Map() },
          activation: { rate: 0, timeToValue: 0 },
          engagement: { depth: 0, breadth: 0 }
        }
      },

      // Operational Metrics
      operationalMetrics: {
        infrastructure: {
          uptime: 0,
          errorRate: 0,
          responseTime: { api: 0, webhook: 0, ai: 0 },
          scaling: { current: 0, threshold: 0, cost: 0 }
        },
        
        support: {
          tickets: { open: 0, resolved: 0, avgTime: 0 },
          satisfaction: { csat: 0, nps: 0 },
          commonIssues: new Map()
        },
        
        quality: {
          disasters: { prevented: 0, reported: 0 },
          accuracy: { formulas: 0, bookings: 0 },
          safety: { incidents: 0, severity: [] }
        }
      },

      // Marketing Analytics
      marketingMetrics: {
        campaigns: {
          reddit: { posts: 0, engagement: 0, conversions: 0 },
          facebook: { spend: 0, cpm: 0, ctr: 0, roas: 0 },
          email: { sent: 0, opened: 0, clicked: 0, converted: 0 },
          referral: { sent: 0, clicked: 0, converted: 0 }
        },
        
        content: {
          viral: { coefficient: 0, topContent: [] },
          engagement: { likes: 0, shares: 0, comments: 0 },
          reach: { organic: 0, paid: 0, earned: 0 }
        },
        
        attribution: {
          firstTouch: new Map(),
          lastTouch: new Map(),
          multiTouch: new Map(),
          revenue: new Map()
        }
      }
    };
  }

  // Real-time event tracking
  trackEvent(event) {
    const timestamp = Date.now();
    const eventData = {
      ...event,
      timestamp,
      sessionId: event.sessionId || 'anonymous',
      processed: false
    };

    // Store in real-time buffer
    this.bufferEvent(eventData);

    // Process immediately for real-time metrics
    this.updateRealtimeMetrics(eventData);

    // Emit for webhooks/integrations
    this.emit('event', eventData);

    return eventData;
  }

  // Update real-time metrics
  updateRealtimeMetrics(event) {
    switch (event.type) {
      case 'SIGNUP':
        this.components.businessMetrics.growth.signups.today++;
        this.updateConversionFunnel(event);
        break;

      case 'BOOKING_CREATED':
        this.updateBookingMetrics(event);
        break;

      case 'DISASTER_PREVENTED':
        this.components.operationalMetrics.quality.disasters.prevented++;
        this.calculateDisasterValue(event);
        break;

      case 'FORMULA_GENERATED':
        this.updateAIMetrics(event);
        break;

      case 'REFERRAL_SENT':
        this.updateViralMetrics(event);
        break;

      case 'PAYMENT_RECEIVED':
        this.updateRevenueMetrics(event);
        break;

      default:
        this.updateGeneralMetrics(event);
    }
  }

  // Generate dashboard view
  generateDashboard(timeframe = '24h') {
    const dashboard = {
      summary: this.generateSummary(timeframe),
      kpis: this.generateKPIs(),
      charts: this.generateCharts(timeframe),
      alerts: this.generateAlerts(),
      insights: this.generateInsights()
    };

    return dashboard;
  }

  // Generate executive summary
  generateSummary(timeframe) {
    const current = this.components.businessMetrics;
    const previous = this.getHistoricalMetrics(timeframe);

    return {
      revenue: {
        mrr: current.revenue.mrr.current,
        mrrGrowth: this.calculateGrowth(current.revenue.mrr, previous.revenue.mrr),
        churn: current.revenue.mrr.churn,
        netRevenue: current.revenue.mrr.current - current.revenue.mrr.churn
      },
      
      users: {
        total: this.getTotalUsers(),
        active: current.usage.dau,
        growth: this.calculateGrowth(current.usage, previous.usage),
        engagement: current.usage.engagement.average
      },
      
      operations: {
        uptime: current.operationalMetrics.infrastructure.uptime,
        disasters: current.operationalMetrics.quality.disasters,
        satisfaction: current.operationalMetrics.support.satisfaction.nps
      },
      
      highlights: this.generateHighlights()
    };
  }

  // Generate key performance indicators
  generateKPIs() {
    return {
      northStar: {
        metric: 'Weekly Active Stylists',
        current: this.calculateWAS(),
        target: 10000,
        progress: this.calculateWAS() / 10000
      },
      
      financial: {
        mrr: this.components.businessMetrics.revenue.mrr.current,
        ltv: this.components.businessMetrics.revenue.ltv.average,
        cac: this.components.businessMetrics.revenue.cac.blended,
        ltvCacRatio: this.components.businessMetrics.revenue.ltv.average / 
                     this.components.businessMetrics.revenue.cac.blended
      },
      
      product: {
        activation: this.components.productMetrics.userJourneys.activation.rate,
        retention: this.components.businessMetrics.usage.retention.day30,
        nps: this.components.operationalMetrics.support.satisfaction.nps,
        viralCoefficient: this.components.businessMetrics.growth.viral.coefficient
      },
      
      operational: {
        uptime: this.components.operationalMetrics.infrastructure.uptime,
        responseTime: this.components.operationalMetrics.infrastructure.responseTime.api,
        errorRate: this.components.operationalMetrics.infrastructure.errorRate,
        aiCost: this.components.productMetrics.aiPerformance.cost.perUser
      }
    };
  }

  // Generate charts data
  generateCharts(timeframe) {
    return {
      revenue: {
        type: 'line',
        data: this.getTimeSeriesData('revenue', timeframe),
        annotations: this.getRevenueAnnotations()
      },
      
      userGrowth: {
        type: 'area',
        data: this.getTimeSeriesData('users', timeframe),
        segments: ['new', 'active', 'churned']
      },
      
      featureAdoption: {
        type: 'bar',
        data: this.getFeatureAdoptionData(),
        sorted: true
      },
      
      viralGrowth: {
        type: 'scatter',
        data: this.getViralGrowthData(),
        trendline: true
      },
      
      cohortRetention: {
        type: 'heatmap',
        data: this.getCohortRetentionData(),
        colorScale: 'retention'
      }
    };
  }

  // Generate alerts
  generateAlerts() {
    const alerts = [];

    // Revenue alerts
    if (this.components.businessMetrics.revenue.mrr.churn > 0.05) {
      alerts.push({
        severity: 'high',
        type: 'churn',
        message: 'Churn rate exceeding 5%',
        value: this.components.businessMetrics.revenue.mrr.churn,
        action: 'Review churned user feedback'
      });
    }

    // Infrastructure alerts
    if (this.components.operationalMetrics.infrastructure.errorRate > 0.01) {
      alerts.push({
        severity: 'medium',
        type: 'errors',
        message: 'Error rate above 1%',
        value: this.components.operationalMetrics.infrastructure.errorRate,
        action: 'Check error logs'
      });
    }

    // Growth alerts
    if (this.components.businessMetrics.growth.viral.coefficient < 1) {
      alerts.push({
        severity: 'low',
        type: 'viral',
        message: 'Viral coefficient below 1',
        value: this.components.businessMetrics.growth.viral.coefficient,
        action: 'Optimize referral incentives'
      });
    }

    return alerts;
  }

  // Generate AI-powered insights
  generateInsights() {
    const insights = [];

    // Growth opportunity
    const conversionBySource = this.components.businessMetrics.growth.conversions.bySource;
    const bestSource = this.findBestConversionSource(conversionBySource);
    
    if (bestSource) {
      insights.push({
        type: 'opportunity',
        title: `${bestSource.name} showing ${bestSource.rate}% conversion`,
        description: `Increase budget allocation to ${bestSource.name}`,
        impact: `Estimated ${bestSource.potential} additional conversions/month`,
        confidence: 0.85
      });
    }

    // Feature correlation
    const featureRevenue = this.correlateFeatureUsageWithRevenue();
    if (featureRevenue.correlation > 0.7) {
      insights.push({
        type: 'product',
        title: `${featureRevenue.feature} drives revenue`,
        description: 'Users of this feature have higher LTV',
        impact: `${featureRevenue.lift}% revenue lift`,
        confidence: featureRevenue.significance
      });
    }

    // Churn prediction
    const churnRisk = this.predictChurnRisk();
    if (churnRisk.atRisk > 50) {
      insights.push({
        type: 'retention',
        title: `${churnRisk.atRisk} users at churn risk`,
        description: 'Based on usage patterns',
        impact: `Potential revenue loss: $${churnRisk.revenue}`,
        confidence: 0.78
      });
    }

    return insights;
  }

  // Export dashboard data
  exportDashboard(format = 'json') {
    const data = this.generateDashboard('30d');

    switch (format) {
      case 'csv':
        return this.convertToCSV(data);
      case 'pdf':
        return this.generatePDFReport(data);
      case 'api':
        return this.formatForAPI(data);
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  // Real-time dashboard updates via WebSocket
  streamDashboard(ws) {
    const interval = setInterval(() => {
      const update = {
        timestamp: Date.now(),
        metrics: {
          dau: this.components.businessMetrics.usage.dau,
          revenue: this.components.businessMetrics.revenue.mrr.current,
          activeNow: this.getActiveUsers(),
          recentEvents: this.getRecentEvents(10)
        }
      };

      ws.send(JSON.stringify(update));
    }, 1000);

    ws.on('close', () => clearInterval(interval));
  }
}

module.exports = AnalyticsDashboard;