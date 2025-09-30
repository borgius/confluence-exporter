/**
 * Cleanup service orchestrator implementation.
 * Coordinates rule execution with partial failure handling and performance tracking.
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

export class MarkdownCleanupService implements ICleanupService {
  private readonly availableRules: Map<string, ICleanupRule> = new Map();

  constructor() {
    this.initializeRules();
  }

  /**
   * Process markdown document with cleanup rules.
   */
  async process(document: MarkdownDocument, config: CleanupConfig): Promise<OldCleanupResult> {
    const startTime = Date.now();
    const appliedRules: RuleResult[] = [];
    const errors: CleanupError[] = [];
    const warnings: string[] = [];

    if (!config.enabled) {
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

    try {
      // Get enabled rules in priority order
      const enabledRules = this.getEnabledRules(config);
      
      // Apply rules sequentially to current document
      const currentDocument = { ...document };
      
      for (const rule of enabledRules) {
        try {
          // Check if rule can be applied to current document
          if (!rule.canApply(currentDocument)) {
            warnings.push(`Rule '${rule.name}' skipped - not applicable to document`);
            continue;
          }

          // Apply rule with empty config for now
          const ruleResult = await rule.apply(currentDocument, {});
          appliedRules.push(ruleResult);

          // If rule succeeded and we're processing sequentially, 
          // we would update the document content here.
          // For now, we're just tracking the results.

          if (!ruleResult.success && ruleResult.errorMessage) {
            errors.push({
              ruleName: rule.name,
              message: ruleResult.errorMessage,
              severity: 'error',
            });
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            ruleName: rule.name,
            message: `Rule execution failed: ${errorMessage}`,
            severity: 'error',
          });
        }
      }

      // For MVP, return original content since we're not yet modifying it
      // In full implementation, this would return the processed content
      const hasErrors = errors.length > 0;
      return {
        originalContent: document.content,
        cleanedContent: document.content, // TODO: Apply actual transformations
        appliedRules,
        processingTime: Date.now() - startTime,
        errors,
        warnings,
        success: !hasErrors,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      
      return {
        originalContent: document.content,
        cleanedContent: document.content,
        appliedRules,
        processingTime: Date.now() - startTime,
        errors: [{
          ruleName: 'service',
          message: errorMessage,
          severity: 'error',
        }],
        warnings,
        success: false,
      };
    }
  }

  /**
   * Get available cleanup rules.
   */
  getAvailableRules(): ICleanupRule[] {
    return Array.from(this.availableRules.values());
  }

  /**
   * Validate cleanup configuration.
   */
  validateConfig(config: CleanupConfig): boolean {
    try {
      // Basic validation
      if (typeof config.enabled !== 'boolean') {
        return false;
      }

      if (!['light', 'medium', 'heavy'].includes(config.intensity)) {
        return false;
      }

      if (config.lineLength && (config.lineLength < 40 || config.lineLength > 200)) {
        return false;
      }

      // Validate rule names if specified
      if (config.rules) {
        const availableRuleNames = new Set(this.availableRules.keys());
        for (const ruleName of config.rules) {
          if (!availableRuleNames.has(ruleName)) {
            return false;
          }
        }
      }

      return true;
    } catch {
      return false;
    }
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
