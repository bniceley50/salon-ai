/**
 * Color Safety Check - The Core Safety Module
 * This is your FIRST REAL MODULE that replaces the mock
 * Every formula goes through this before being recommended
 */

class ColorSafetyCheck {
  constructor() {
    // Critical combinations that cause disasters
    this.dangerousCombos = {
      // 4NA on high porosity = instant black disaster
      '4NA': {
        'high': {
          risk: 'CRITICAL',
          warning: 'Will turn jet black and cause severe damage!',
          alternative: '6NA',
          reason: 'High porosity + 4NA = hair disaster'
        },
        'extreme_high': {
          risk: 'CRITICAL', 
          warning: 'Extreme damage risk - hair will break',
          alternative: '8NA',
          reason: 'Porosity too high for any ash tones'
        }
      },
      
      // Developer strength limits
      '40vol': {
        'damaged': {
          risk: 'CRITICAL',
          warning: 'Chemical burn risk on damaged hair!',
          alternative: '20vol',
          reason: 'Damaged hair cannot handle 40vol developer'
        }
      },

      // Metallic dye conflicts
      'lightener': {
        'metallic_history': {
          risk: 'CRITICAL',
          warning: 'NEVER bleach over metallic dyes - hair will smoke!',
          alternative: 'color_remover_first',
          reason: 'Metallic + bleach = chemical reaction'
        }
      }
    };

    // Additional safety rules
    this.safetyRules = [
      {
        condition: (formula) => formula.pregnancy && formula.ammonia,
        risk: 'HIGH',
        warning: 'Ammonia not recommended during pregnancy',
        alternative: 'ammonia_free_formula'
      },
      {
        condition: (formula) => formula.greyPercentage > 80 && formula.level > 7,
        risk: 'MEDIUM', 
        warning: 'Resistant grey needs stronger formulation',
        alternative: 'add_activator'
      }
    ];

    // Track prevention stats
    this.stats = {
      formulas_checked: 0,
      disasters_prevented: 0,
      warnings_issued: 0
    };
  }

  /**
   * Main safety validation - this is called by your WhatsApp bot
   */
  validateFormula(formula, hairCondition) {
    this.stats.formulas_checked++;
    
    const result = {
      safe: true,
      warnings: [],
      alternatives: [],
      confidence: 0.95,
      safetyChecked: true
    };

    // Check dangerous combinations first
    const dangerCheck = this.checkDangerousCombos(formula, hairCondition);
    if (dangerCheck.dangerous) {
      result.safe = false;
      result.warnings.push(dangerCheck);
      this.stats.disasters_prevented++;
    }

    // Check additional safety rules
    const ruleWarnings = this.checkSafetyRules(formula);
    result.warnings.push(...ruleWarnings);
    
    if (ruleWarnings.length > 0) {
      this.stats.warnings_issued++;
    }

    // Log for analytics
    this.logSafetyCheck(formula, hairCondition, result);

    return result;
  }

  checkDangerousCombos(formula, hairCondition) {
    const product = formula.product || formula.color;
    const developer = formula.developer;
    const porosity = hairCondition.porosity;
    const history = hairCondition.previousTreatments || [];

    // Check product + porosity combinations
    if (this.dangerousCombos[product] && this.dangerousCombos[product][porosity]) {
      const danger = this.dangerousCombos[product][porosity];
      return {
        dangerous: true,
        level: danger.risk,
        preventApplication: danger.risk === 'CRITICAL',
        message: danger.warning,
        alternative: danger.alternative,
        reason: danger.reason
      };
    }

    // Check developer strength
    if (this.dangerousCombos[developer] && this.dangerousCombos[developer][hairCondition.condition]) {
      const danger = this.dangerousCombos[developer][hairCondition.condition];
      return {
        dangerous: true,
        level: danger.risk,
        preventApplication: true,
        message: danger.warning,
        alternative: danger.alternative,
        reason: danger.reason
      };
    }

    // Check treatment conflicts
    if (history.includes('metallic_dye') && (product === 'lightener' || formula.bleach)) {
      const danger = this.dangerousCombos['lightener']['metallic_history'];
      return {
        dangerous: true,
        level: danger.risk,
        preventApplication: true,
        message: danger.warning,
        alternative: danger.alternative,
        reason: danger.reason
      };
    }

    return { dangerous: false };
  }

  checkSafetyRules(formula) {
    const warnings = [];
    
    for (const rule of this.safetyRules) {
      if (rule.condition(formula)) {
        warnings.push({
          level: rule.risk,
          message: rule.warning,
          suggestion: rule.alternative,
          preventApplication: rule.risk === 'CRITICAL'
        });
      }
    }

    return warnings;
  }

  /**
   * Generate safe alternative formula
   */
  generateSafeAlternative(originalFormula, hairCondition) {
    const validation = this.validateFormula(originalFormula, hairCondition);
    
    if (validation.safe) {
      return originalFormula; // Already safe
    }

    // Build safer version
    const safeFormula = { ...originalFormula };
    
    // Apply first critical fix
    const criticalWarning = validation.warnings.find(w => w.level === 'CRITICAL');
    if (criticalWarning && criticalWarning.alternative) {
      if (criticalWarning.alternative.includes('vol')) {
        safeFormula.developer = criticalWarning.alternative;
      } else if (criticalWarning.alternative.includes('NA')) {
        safeFormula.product = criticalWarning.alternative;
      }
    }

    return safeFormula;
  }

  /**
   * Get prevention statistics - for your sales pitch!
   */
  getStats() {
    return {
      ...this.stats,
      prevention_rate: this.stats.formulas_checked > 0 
        ? (this.stats.disasters_prevented / this.stats.formulas_checked * 100).toFixed(1)
        : 0
    };
  }

  logSafetyCheck(formula, hairCondition, result) {
    // This will connect to your analytics later
    console.log('SAFETY CHECK:', {
      timestamp: new Date().toISOString(),
      safe: result.safe,
      warnings: result.warnings.length,
      formula: formula.product || 'unknown',
      porosity: hairCondition.porosity,
      prevented_disaster: !result.safe
    });
    
    // TODO: Send to analytics service
    // analytics.track('formula_safety_check', { ... });
  }
}

module.exports = ColorSafetyCheck;