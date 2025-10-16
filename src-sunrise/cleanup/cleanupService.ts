/**
 * @fileoverview Markdown cleanup service for post-processing exported content.
 * 
 * Provides comprehensive content cleanup including typography enhancement,
 * whitespace normalization, and formatting consistency. Supports partial
 * failure handling and performance monitoring.
 */

import type { 
  ICleanupService, 
  ICleanupRule, 
  OldCleanupResult, 
  CleanupConfig, 
  MarkdownDocument, 
  RuleResult,
  CleanupError 
} from '../models/markdownCleanup.js';
import { createTypographyRule } from './typographyRule.js';
import { createWhitespaceRule } from './whitespaceRule.js';
import type { PerformanceCollector } from '../core/performanceCollector.js';
import { logger } from '../util/logger.js';
import { validateConfig as validateCleanupConfig } from './configManager.js';

/**
 * Main cleanup service that orchestrates markdown content post-processing.
 * 
 * Provides comprehensive cleanup capabilities including:
 * - Typography enhancement (smart quotes, dashes, ellipses)
 * - Whitespace normalization and formatting consistency
 * - Performance monitoring and error handling
 * - Partial failure recovery for robust processing
 * 
 * @example
 * ```typescript
 * const service = new MarkdownCleanupService(performanceCollector);
 * const result = await service.process(document, {
 *   enabled: true,
 *   intensity: 'medium',
 *   rules: ['typography', 'whitespace']
 * });
 * ```
 */
export class MarkdownCleanupService implements ICleanupService {
  private readonly availableRules: Map<string, ICleanupRule> = new Map();
  private readonly maxCriticalErrors: number = 3;
  private readonly maxWarnings: number = 10;
  private readonly performanceCollector?: PerformanceCollector;

  /**
   * Creates a new cleanup service instance with optional performance monitoring.
   * 
   * @param performanceCollector - Optional collector for tracking cleanup performance metrics
   */
  constructor(performanceCollector?: PerformanceCollector) {
    this.performanceCollector = performanceCollector;
    this.initializeRules();
  }

  /**
   * Processes a markdown document with the specified cleanup configuration.
   * 
   * Applies cleanup rules in priority order with robust error handling.
   * Supports partial failure recovery - if some rules fail, others continue processing.
   * 
   * // COMPLEXITY-JUSTIFICATION: This is the primary orchestration method for the cleanup
   * // pipeline with inherently complex coordination requirements:
   * // 1. Multi-phase rule loading and validation with intensity-based filtering
   * // 2. Sequential rule execution with intermediate error collection
   * // 3. Performance monitoring and resource tracking across rule applications
   * // 4. Partial failure recovery with configurable error thresholds
   * // 5. Comprehensive result aggregation for debugging and reporting
   * // The complexity is necessary to provide robust cleanup behavior while maintaining
   * // detailed observability for rule debugging and performance optimization.
   * 
   * @param document - Markdown document to process including content and metadata
   * @param config - Cleanup configuration specifying rules, intensity, and options
   * @returns Promise resolving to cleanup result with applied rules, errors, and performance data
   * @throws {Error} If configuration validation fails or critical errors exceed threshold
   */
  async process(document: MarkdownDocument, config: CleanupConfig): Promise<OldCleanupResult> {
    const startTime = Date.now();
    const appliedRules: RuleResult[] = [];
    const errors: CleanupError[] = [];
    const warnings: string[] = [];

    logger.debug('Starting cleanup process', {
      documentPath: document.filePath,
      contentLength: document.content.length,
      configEnabled: config.enabled,
      rulesRequested: config.rules?.length || 'all'
    });

    if (!config.enabled) {
      logger.info('Cleanup disabled, skipping processing', { documentPath: document.filePath });
      return this.createDisabledResult(document, startTime);
    }

    try {
      const enabledRules = this.getEnabledRules(config);
      logger.info('Cleanup rules loaded', {
        documentPath: document.filePath,
        totalRules: enabledRules.length,
        ruleNames: enabledRules.map(r => r.name)
      });

      const processingResult = await this.processRules(document, enabledRules, appliedRules, errors, warnings);
      
      const processingTime = Date.now() - startTime;
      
      // Record cleanup performance metrics
      if (this.performanceCollector) {
        this.performanceCollector.recordCleanupFile(processingTime);
      }

      const successfulRules = appliedRules.filter(r => r.success).length;
      const failedRules = appliedRules.filter(r => !r.success).length;

      logger.info('Cleanup completed', {
        documentPath: document.filePath,
        processingTime,
        totalRules: appliedRules.length,
        successfulRules,
        failedRules,
        errors: errors.length,
        warnings: warnings.length,
        success: processingResult.success
      });
      
      return {
        originalContent: document.content,
        cleanedContent: processingResult.content,
        appliedRules,
        processingTime,
        errors,
        warnings,
        success: processingResult.success,
      };
    } catch (error) {
      return this.createErrorResult(document, startTime, appliedRules, warnings, error);
    }
  }

  /**
   * Create result for disabled cleanup.
   */
  private createDisabledResult(document: MarkdownDocument, startTime: number): OldCleanupResult {
    return {
      originalContent: document.content,
      cleanedContent: document.content,
      appliedRules: [],
      processingTime: Date.now() - startTime,
      errors: [],
      warnings: ['Cleanup disabled by configuration'],
      success: true,
    };
  }

  /**
   * Create result for error scenarios.
   */
  private createErrorResult(
    document: MarkdownDocument, 
    startTime: number, 
    appliedRules: RuleResult[], 
    warnings: string[], 
    error: unknown
  ): OldCleanupResult {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    
    return {
      originalContent: document.content,
      cleanedContent: document.content,
      appliedRules,
      processingTime: Date.now() - startTime,
      errors: [{
        ruleName: 'service',
        message: `Service-level failure: ${errorMessage}`,
        severity: 'error',
      }],
      warnings,
      success: false,
    };
  }

  /**
   * Process all rules with partial failure handling.
   * Enhanced with detailed rule execution logging for T134.
   */
  private async processRules(
    document: MarkdownDocument,
    enabledRules: ICleanupRule[],
    appliedRules: RuleResult[],
    errors: CleanupError[],
    warnings: string[]
  ): Promise<{ content: string; success: boolean }> {
    const currentContent = document.content;
    let criticalErrorCount = 0;
    let successfulRules = 0;
    
    logger.debug('Starting rule processing phase', {
      documentPath: document.filePath,
      totalRules: enabledRules.length,
      maxCriticalErrors: this.maxCriticalErrors,
      maxWarnings: this.maxWarnings
    });
    
    for (const rule of enabledRules) {
      // Early termination checks
      if (criticalErrorCount >= this.maxCriticalErrors) {
        const message = `Remaining rules skipped due to ${criticalErrorCount} critical errors`;
        warnings.push(message);
        logger.warn('Early termination due to critical errors', {
          documentPath: document.filePath,
          criticalErrorCount,
          remainingRules: enabledRules.length - appliedRules.length,
          ruleName: rule.name
        });
        break;
      }

      if (warnings.length >= this.maxWarnings) {
        const message = 'Rule processing stopped due to excessive warnings';
        warnings.push(message);
        logger.warn('Early termination due to excessive warnings', {
          documentPath: document.filePath,
          warningCount: warnings.length,
          remainingRules: enabledRules.length - appliedRules.length,
          ruleName: rule.name
        });
        break;
      }

      logger.debug('Processing rule', {
        documentPath: document.filePath,
        ruleName: rule.name,
        ruleIndex: appliedRules.length + 1,
        totalRules: enabledRules.length
      });

      const result = await this.processRule(rule, document, currentContent);
      appliedRules.push(result.ruleResult);

      if (result.ruleResult.success) {
        successfulRules++;
        logger.debug('Rule completed successfully', {
          documentPath: document.filePath,
          ruleName: rule.name,
          changesApplied: result.ruleResult.changesApplied,
          processingTime: result.ruleResult.processingTime,
          preservedBlocks: result.ruleResult.preservedBlocks
        });
      } else {
        const errorHandled = this.handleRuleError(rule, result.ruleResult, errors, warnings);
        if (errorHandled.isCritical) {
          criticalErrorCount++;
          logger.error('Critical rule failure', {
            documentPath: document.filePath,
            ruleName: rule.name,
            errorMessage: result.ruleResult.errorMessage,
            criticalErrorCount,
            processingTime: result.ruleResult.processingTime
          });
        } else {
          logger.warn('Rule failed with warning', {
            documentPath: document.filePath,
            ruleName: rule.name,
            errorMessage: result.ruleResult.errorMessage,
            processingTime: result.ruleResult.processingTime
          });
        }
      }
    }

    const overallSuccess = this.evaluatePartialCleanupSuccess(
      enabledRules.length,
      successfulRules,
      criticalErrorCount,
      warnings.length
    );

    logger.info('Rule processing completed', {
      documentPath: document.filePath,
      totalRules: enabledRules.length,
      successfulRules,
      failedRules: enabledRules.length - successfulRules,
      criticalErrors: criticalErrorCount,
      warnings: warnings.length,
      overallSuccess
    });

    return { content: currentContent, success: overallSuccess };
  }

  /**
   * Process a single rule with error handling.
   */
  private async processRule(
    rule: ICleanupRule, 
    document: MarkdownDocument, 
    currentContent: string
  ): Promise<{ ruleResult: RuleResult }> {
    try {
      const workingDocument = { ...document, content: currentContent };

      if (!rule.canApply(workingDocument)) {
        return {
          ruleResult: {
            ruleName: rule.name,
            success: false,
            changesApplied: 0,
            processingTime: 0,
            errorMessage: 'Rule not applicable to document',
            preservedBlocks: 0
          }
        };
      }

      const ruleResult = await this.applyRuleWithTimeout(rule, workingDocument, {}, 5000);
      return { ruleResult };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        ruleResult: {
          ruleName: rule.name,
          success: false,
          changesApplied: 0,
          processingTime: 0,
          errorMessage,
          preservedBlocks: 0
        }
      };
    }
  }

  /**
   * Handle rule error and classify severity.
   */
  private handleRuleError(
    rule: ICleanupRule,
    ruleResult: RuleResult,
    errors: CleanupError[],
    warnings: string[]
  ): { isCritical: boolean } {
    const errorSeverity = this.classifyRuleError(rule, ruleResult.errorMessage);
    
    if (errorSeverity === 'error') {
      errors.push({
        ruleName: rule.name,
        message: ruleResult.errorMessage || 'Rule execution failed',
        severity: 'error',
      });

      if (rule.priority > 8) {
        warnings.push(`High priority rule '${rule.name}' failed - may affect downstream processing`);
      }
      
      return { isCritical: true };
    } else {
      warnings.push(`Rule '${rule.name}' warning: ${ruleResult.errorMessage || 'Minor issue'}`);
      return { isCritical: false };
    }
  }

  /**
   * Apply rule with timeout protection.
   */
  private async applyRuleWithTimeout(
    rule: ICleanupRule, 
    document: MarkdownDocument, 
    ruleConfig: Record<string, unknown>, 
    timeoutMs: number
  ): Promise<RuleResult> {
    const ruleStartTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const executionTime = Date.now() - ruleStartTime;
        // Record rule performance as failed due to timeout
        if (this.performanceCollector) {
          this.performanceCollector.recordRulePerformance(rule.name, executionTime, false);
        }
        reject(new Error(`Rule '${rule.name}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      rule.apply(document, ruleConfig)
        .then(result => {
          clearTimeout(timeout);
          const executionTime = Date.now() - ruleStartTime;
          
          // Record rule performance
          if (this.performanceCollector) {
            this.performanceCollector.recordRulePerformance(rule.name, executionTime, result.success);
          }
          
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          const executionTime = Date.now() - ruleStartTime;
          
          // Record rule performance as failed
          if (this.performanceCollector) {
            this.performanceCollector.recordRulePerformance(rule.name, executionTime, false);
          }
          
          reject(error);
        });
    });
  }

  /**
   * Classify rule error severity for partial cleanup strategy.
   * Enhanced with logging for T134.
   */
  private classifyRuleError(rule: ICleanupRule, errorMessage?: string): 'warning' | 'error' {
    if (!errorMessage) {
      logger.debug('Rule error classification: warning (no error message)', {
        ruleName: rule.name,
        priority: rule.priority
      });
      return 'warning';
    }

    // Critical errors that should stop processing
    const criticalPatterns = [
      'out of memory',
      'timeout',
      'stack overflow',
      'permission denied',
      'corrupted',
      'fatal'
    ];

    const lowerMessage = errorMessage.toLowerCase();
    const criticalPattern = criticalPatterns.find(pattern => lowerMessage.includes(pattern));
    
    if (criticalPattern) {
      logger.debug('Rule error classification: error (critical pattern detected)', {
        ruleName: rule.name,
        priority: rule.priority,
        criticalPattern,
        errorMessage
      });
      return 'error';
    }

    // High priority rules get escalated severity
    if (rule.priority > 8) {
      logger.debug('Rule error classification: error (high priority rule)', {
        ruleName: rule.name,
        priority: rule.priority,
        errorMessage
      });
      return 'error';
    }

    logger.debug('Rule error classification: warning', {
      ruleName: rule.name,
      priority: rule.priority,
      errorMessage
    });
    return 'warning';
  }

  /**
   * Determine if an error is critical enough to stop all processing.
   */
  private isCriticalError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const criticalTypes = [
      'RangeError',
      'ReferenceError',
      'TypeError'
    ];

    return criticalTypes.includes(error.constructor.name) ||
           error.message.toLowerCase().includes('out of memory') ||
           error.message.toLowerCase().includes('stack overflow');
  }

  /**
   * Evaluate overall success based on partial cleanup strategy.
   */
  private evaluatePartialCleanupSuccess(
    totalRules: number,
    successfulRules: number,
    criticalErrors: number,
    warningCount: number
  ): boolean {
    // Fail if too many critical errors
    if (criticalErrors >= this.maxCriticalErrors) {
      return false;
    }

    // Fail if no rules succeeded and we have critical errors
    if (successfulRules === 0 && criticalErrors > 0) {
      return false;
    }

    // Success if at least 50% of rules succeeded with manageable warnings
    const successRate = totalRules > 0 ? successfulRules / totalRules : 0;
    return successRate >= 0.5 && warningCount < this.maxWarnings;
  }

  /**
   * Get available cleanup rules.
   */
  getAvailableRules(): ICleanupRule[] {
    return Array.from(this.availableRules.values());
  }

  /**
   * Validate cleanup configuration.
   * Enhanced with comprehensive validation from T135.
   */
  validateConfig(config: CleanupConfig): boolean {
    const validationResult = validateCleanupConfig(config);
    
    if (validationResult.warnings.length > 0) {
      logger.warn('Configuration validation warnings', {
        warnings: validationResult.warnings,
        config: config
      });
    }
    
    if (!validationResult.isValid) {
      logger.error('Configuration validation failed', {
        errors: validationResult.errors,
        config: config
      });
    }
    
    return validationResult.isValid;
  }

  /**
   * Initialize available cleanup rules.
   */
  private initializeRules(): void {
    // Register built-in cleanup rules
    const typographyRule = createTypographyRule();
    const whitespaceRule = createWhitespaceRule();

    this.availableRules.set(typographyRule.name, typographyRule);
    this.availableRules.set(whitespaceRule.name, whitespaceRule);
  }

  /**
   * Get enabled rules in priority order.
   */
  private getEnabledRules(config: CleanupConfig): ICleanupRule[] {
    let rulesToUse: ICleanupRule[];

    if (config.rules && config.rules.length > 0) {
      // Use explicitly configured rules
      rulesToUse = config.rules
        .map(name => this.availableRules.get(name))
        .filter((rule): rule is ICleanupRule => rule !== undefined);
    } else {
      // Use all available rules
      rulesToUse = Array.from(this.availableRules.values());
    }

    // Sort by priority (higher priority first)
    return rulesToUse.sort((a, b) => b.priority - a.priority);
  }
}

/**
 * Factory function to create cleanup service instance.
 */
export function createCleanupService(): ICleanupService {
  return new MarkdownCleanupService();
}
