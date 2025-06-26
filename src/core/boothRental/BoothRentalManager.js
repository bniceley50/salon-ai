/**
 * Booth Rental Manager - The REAL Money Maker
 * Automates rent collection, commission calculation, and payment processing
 * This solves an actual $200+/month problem for salon owners
 */

class BoothRentalManager {
  constructor() {
    // Track all booth renters and their financial data
    this.renters = new Map();
    this.rentCollections = new Map();
    this.commissions = new Map();
    
    // Payment settings
    this.paymentSettings = {
      processingFee: 0.015, // 1.5% (cheaper than Vagaro's 2.9%)
      lateFeeAmount: 25,
      lateFeeGracePeriod: 3, // days
      reminderDays: [7, 3, 1, 0], // When to send reminders
    };

    // Analytics for the owner
    this.analytics = {
      totalRentCollected: 0,
      totalCommissionsPaid: 0,
      latePayments: 0,
      automatedCollections: 0
    };
  }

  /**
   * Register a new booth renter
   */
  addRenter(renterData) {
    const renterId = renterData.phone || `renter_${Date.now()}`;
    
    this.renters.set(renterId, {
      id: renterId,
      name: renterData.name,
      phone: renterData.phone,
      stationNumber: renterData.stationNumber,
      monthlyRent: renterData.monthlyRent,
      commissionRate: renterData.commissionRate || 0.20, // 20% default
      paymentMethod: renterData.paymentMethod || 'bank_transfer',
      contractStart: new Date(),
      status: 'active',
      balance: 0,
      autopayEnabled: true
    });

    return {
      success: true,
      renterId,
      message: `Booth renter ${renterData.name} added. Monthly rent: $${renterData.monthlyRent}`
    };
  }

  /**
   * Calculate rent due with commission deductions
   */
  calculateRentDue(renterId, month = new Date()) {
    const renter = this.renters.get(renterId);
    if (!renter) return { error: 'Renter not found' };

    const baseRent = renter.monthlyRent;
    const commissionsEarned = this.getMonthlyCommissions(renterId, month);
    const previousBalance = renter.balance || 0;
    
    // Check if payment is late
    const dueDate = new Date(month.getFullYear(), month.getMonth(), 1);
    const today = new Date();
    const daysLate = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
    const lateFee = daysLate > this.paymentSettings.lateFeeGracePeriod ? 
      this.paymentSettings.lateFeeAmount : 0;

    const totalDue = baseRent - commissionsEarned + previousBalance + lateFee;
    const processingFee = totalDue * this.paymentSettings.processingFee;

    return {
      renterId,
      month: month.toISOString().slice(0, 7),
      breakdown: {
        baseRent,
        commissionsEarned,
        previousBalance,
        lateFee,
        processingFee: Math.round(processingFee * 100) / 100,
        totalDue: Math.round(totalDue * 100) / 100,
        netAmount: Math.round((totalDue + processingFee) * 100) / 100
      },
      daysUntilDue: Math.max(0, -daysLate),
      isLate: daysLate > 0,
      daysLate
    };
  }

  /**
   * Process automated rent collection
   */
  async collectRent(renterId, amount = null) {
    const renter = this.renters.get(renterId);
    if (!renter) return { error: 'Renter not found' };

    const rentDue = this.calculateRentDue(renterId);
    const collectionAmount = amount || rentDue.breakdown.netAmount;

    try {
      // This would integrate with Square/Stripe
      const payment = await this.processPayment({
        renterId,
        amount: collectionAmount,
        method: renter.paymentMethod,
        description: `Booth rent - ${rentDue.month}`
      });

      if (payment.success) {
        // Record successful collection
        this.rentCollections.set(`${renterId}_${rentDue.month}`, {
          renterId,
          amount: collectionAmount,
          collectedAt: new Date(),
          automatic: !amount, // Was it autopay?
          transactionId: payment.transactionId
        });

        // Update analytics
        this.analytics.totalRentCollected += collectionAmount;
        if (!amount) this.analytics.automatedCollections++;

        // Reset balance
        renter.balance = 0;

        return {
          success: true,
          message: `Rent collected: $${collectionAmount}`,
          transactionId: payment.transactionId,
          receipt: this.generateReceipt(renterId, rentDue, payment)
        };
      }
    } catch (error) {
      console.error('Rent collection failed:', error);
      return {
        success: false,
        error: 'Payment failed',
        nextRetry: new Date(Date.now() + 24 * 60 * 60 * 1000) // Retry tomorrow
      };
    }
  }

  /**
   * Track product sales commission
   */
  recordCommission(renterId, saleData) {
    const renter = this.renters.get(renterId);
    if (!renter) return { error: 'Renter not found' };

    const commission = saleData.amount * renter.commissionRate;
    const monthKey = new Date().toISOString().slice(0, 7);
    
    if (!this.commissions.has(renterId)) {
      this.commissions.set(renterId, new Map());
    }
    
    const renterCommissions = this.commissions.get(renterId);
    const monthlyCommissions = renterCommissions.get(monthKey) || [];
    
    monthlyCommissions.push({
      date: new Date(),
      productSold: saleData.product,
      saleAmount: saleData.amount,
      commissionEarned: commission,
      clientName: saleData.clientName
    });

    renterCommissions.set(monthKey, monthlyCommissions);
    this.analytics.totalCommissionsPaid += commission;

    return {
      success: true,
      commission: commission,
      totalThisMonth: this.getMonthlyCommissions(renterId)
    };
  }

  /**
   * Get total commissions for a month
   */
  getMonthlyCommissions(renterId, month = new Date()) {
    const monthKey = month.toISOString().slice(0, 7);
    const renterCommissions = this.commissions.get(renterId);
    
    if (!renterCommissions) return 0;
    
    const monthlyCommissions = renterCommissions.get(monthKey) || [];
    return monthlyCommissions.reduce((total, comm) => total + comm.commissionEarned, 0);
  }

  /**
   * Generate rent reminder message
   */
  generateRentReminder(renterId) {
    const renter = this.renters.get(renterId);
    const rentDue = this.calculateRentDue(renterId);
    
    if (rentDue.isLate) {
      return {
        type: 'late_notice',
        message: `⚠️ RENT OVERDUE - Station ${renter.stationNumber}
        
Days Late: ${rentDue.daysLate}
Amount Due: $${rentDue.breakdown.totalDue}
Late Fee: $${rentDue.breakdown.lateFee}
Total with fees: $${rentDue.breakdown.netAmount}

Reply PAY to process payment
Reply CALL to discuss`,
        urgent: true
      };
    }

    return {
      type: 'reminder',
      message: `💰 Rent Reminder - ${renter.name}

Station: ${renter.stationNumber}
Due in: ${rentDue.daysUntilDue} days
Base Rent: $${rentDue.breakdown.baseRent}
Commission Credit: -$${rentDue.breakdown.commissionsEarned}
Amount Due: $${rentDue.breakdown.totalDue}

Reply PAY to pay now and avoid late fees
Reply BAL for detailed breakdown`,
      urgent: rentDue.daysUntilDue <= 1
    };
  }

  /**
   * Generate financial summary for salon owner
   */
  generateOwnerReport(month = new Date()) {
    const monthKey = month.toISOString().slice(0, 7);
    const report = {
      month: monthKey,
      summary: {
        totalBooths: this.renters.size,
        expectedRevenue: 0,
        actualCollected: 0,
        pendingPayments: 0,
        totalCommissionsPaid: 0
      },
      renters: []
    };

    for (const [renterId, renter] of this.renters) {
      const rentDue = this.calculateRentDue(renterId, month);
      const collected = this.rentCollections.get(`${renterId}_${monthKey}`);
      
      report.summary.expectedRevenue += renter.monthlyRent;
      if (collected) {
        report.summary.actualCollected += collected.amount;
      } else {
        report.summary.pendingPayments += rentDue.breakdown.totalDue;
      }
      
      report.summary.totalCommissionsPaid += rentDue.breakdown.commissionsEarned;
      
      report.renters.push({
        name: renter.name,
        station: renter.stationNumber,
        status: collected ? 'PAID' : (rentDue.isLate ? 'LATE' : 'PENDING'),
        amount: rentDue.breakdown.totalDue,
        commissions: rentDue.breakdown.commissionsEarned,
        daysLate: rentDue.daysLate
      });
    }

    report.summary.collectionRate = 
      (report.summary.actualCollected / report.summary.expectedRevenue * 100).toFixed(1);

    return report;
  }

  /**
   * Process payment (integrates with Square/Stripe)
   */
  async processPayment(paymentData) {
    // This would actually call Square API
    // For now, simulate successful payment
    console.log('Processing payment:', paymentData);
    
    return {
      success: true,
      transactionId: `txn_${Date.now()}`,
      processedAt: new Date()
    };
  }

  /**
   * Generate receipt for successful payment
   */
  generateReceipt(renterId, rentDue, payment) {
    const renter = this.renters.get(renterId);
    
    return {
      receiptId: `RCP_${Date.now()}`,
      date: new Date().toISOString(),
      renter: {
        name: renter.name,
        station: renter.stationNumber
      },
      payment: {
        month: rentDue.month,
        baseRent: rentDue.breakdown.baseRent,
        commissionCredit: -rentDue.breakdown.commissionsEarned,
        lateFee: rentDue.breakdown.lateFee,
        processingFee: rentDue.breakdown.processingFee,
        totalPaid: rentDue.breakdown.netAmount,
        transactionId: payment.transactionId
      }
    };
  }

  /**
   * Get booth renter balance inquiry response
   */
  getBalanceInquiry(renterId) {
    const renter = this.renters.get(renterId);
    if (!renter) return { error: 'Renter not found' };

    const rentDue = this.calculateRentDue(renterId);
    const commissionDetails = this.getCommissionDetails(renterId);

    return {
      renter: renter.name,
      station: renter.stationNumber,
      currentBalance: rentDue.breakdown.totalDue,
      breakdown: {
        monthlyRent: renter.monthlyRent,
        commissionsThisMonth: rentDue.breakdown.commissionsEarned,
        recentSales: commissionDetails.slice(0, 5),
        dueDate: rentDue.daysUntilDue > 0 ? 
          `in ${rentDue.daysUntilDue} days` : 
          `${rentDue.daysLate} days late`
      },
      paymentOptions: {
        payNow: rentDue.breakdown.netAmount,
        autopayEnabled: renter.autopayEnabled
      }
    };
  }

  /**
   * Get commission details for a renter
   */
  getCommissionDetails(renterId, limit = 10) {
    const monthKey = new Date().toISOString().slice(0, 7);
    const renterCommissions = this.commissions.get(renterId);
    
    if (!renterCommissions) return [];
    
    const monthlyCommissions = renterCommissions.get(monthKey) || [];
    return monthlyCommissions
      .sort((a, b) => b.date - a.date)
      .slice(0, limit)
      .map(comm => ({
        date: comm.date.toLocaleDateString(),
        product: comm.productSold,
        sale: `$${comm.saleAmount}`,
        earned: `$${comm.commissionEarned.toFixed(2)}`
      }));
  }
}

module.exports = BoothRentalManager;