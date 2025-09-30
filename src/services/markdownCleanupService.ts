/**
 * T113: Markdown cleanup service orchestrator
 * Coordinates execution of all cleanup rules for markdown post-processing
 * Supports FR-025, FR-026, FR-027, FR-028, FR-029, FR-030, FR-031, FR-032
 */

import type { CleanupRule, CleanupContext, CleanupResult, CleanupMetrics, CleanupIssue } from '../models/markdownCleanup.js';
import { TypographyRule } from '../transform/cleanupRules/typography.js';
import { FootnoteRule } from '../transform/cleanupRules/footnotes.js';
import { BoldfaceRule } from '../transform/cleanupRules/boldface.js';
import { ArtifactRule } from '../transform/cleanupRules/artifacts.js';
import { HeadingRule } from '../transform/cleanupRules/headings.js';
import { WordWrapRule } from '../transform/cleanupRules/wordWrap.js';
import { logger } from '../util/logger.js';

export type CleanupIntensity = 'light' | 'standard' | 'heavy';

export interface CleanupServiceConfig {
  intensity: CleanupIntensity;
  enabledRules: string[];
  disabledRules: string[];
  failFast: boolean;
  logProgress: boolean;
  preserveCodeBlocks: boolean;
  preserveInlineCode: boolean;
}

export interface CleanupServiceResult {
  content: string;
  rulesApplied: string[];
  rulesFailed: string[];
  totalMetrics: CleanupMetrics;
  success: boolean;
  partialSuccess: boolean;
}

export interface RuleExecution {
  rule: CleanupRule;
  result: CleanupResult;
  success: boolean;
  executionTimeMs: number;
}

export class MarkdownCleanupService {
  private readonly config: CleanupServiceConfig;
  private readonly availableRules: Map<string, CleanupRule>;

  constructor(config: Partial<CleanupServiceConfig> = {}) {
    this.config = {
      intensity: 'heavy',
      enabledRules: [],
      disabledRules: [],
      failFast: false,
      logProgress: true,
      preserveCodeBlocks: true,
      preserveInlineCode: true,
      ...config,
    };

    this.availableRules = this.initializeRules();
  }

  /**
   * Apply cleanup rules to markdown content
   */
  async cleanup(content: string, context: CleanupContext): Promise<CleanupServiceResult> {
    const startTime = Date.now();
    const processedContent = content;
    const totalMetrics: CleanupMetrics = {
      changesApplied: 0,
      charactersProcessed: content.length,
      processingTimeMs: 0,
      issues: [],
    };

    try {
      const rulesToExecute = this.getRulesToExecute();
      
      if (this.config.logProgress) {
        logger.info(`Starting cleanup with ${rulesToExecute.length} rules (intensity: ${this.config.intensity})`);
      }

      const executionResult = await this.executeRules(rulesToExecute, processedContent, context);
      
      totalMetrics.processingTimeMs = Date.now() - startTime;
      totalMetrics.changesApplied = executionResult.totalChanges;
      totalMetrics.issues.push(...executionResult.allIssues);

      if (this.config.logProgress) {
        logger.info(`Cleanup completed: ${executionResult.rulesApplied.length} rules applied, ${executionResult.rulesFailed.length} failed`);
      }

      return {
        content: executionResult.finalContent,
        rulesApplied: executionResult.rulesApplied,
        rulesFailed: executionResult.rulesFailed,
        totalMetrics,
        success: executionResult.rulesFailed.length === 0,
        partialSuccess: executionResult.rulesApplied.length > 0 && executionResult.rulesFailed.length > 0,
      };

    } catch (error) {
      return this.handleCleanupError(error, content, startTime, totalMetrics);
    }
  }

  /**
   * Get list of available rules
   */
  getAvailableRules(): CleanupRule[] {
    return Array.from(this.availableRules.values());
  }

  /**
   * Check if cleanup is disabled entirely
   */
  isCleanupDisabled(): boolean {
    return this.config.enabledRules.includes('none') || 
           this.config.disabledRules.includes('all');
  }

  private async executeRules(
    rulesToExecute: CleanupRule[], 
    content: string, 
    context: CleanupContext
  ): Promise<{
    finalContent: string;
    rulesApplied: string[];
    rulesFailed: string[];
    totalChanges: number;
    allIssues: CleanupIssue[];
  }> {
    const rulesApplied: string[] = [];
    const rulesFailed: string[] = [];
    const allIssues: CleanupIssue[] = [];
    let finalContent = content;
    let totalChanges = 0;

    for (const rule of rulesToExecute) {
      const ruleResult = await this.executeRule(rule, finalContent, context);
      
      if (ruleResult.success) {
        finalContent = ruleResult.content;
        rulesApplied.push(rule.name);
        totalChanges += ruleResult.changesApplied;
        allIssues.push(...ruleResult.issues);
      } else {
        rulesFailed.push(rule.name);
        allIssues.push(...ruleResult.issues);
        
        if (this.config.failFast) {
          break;
        }
      }
    }

    return { finalContent, rulesApplied, rulesFailed, totalChanges, allIssues };
  }

  private async executeRule(
    rule: CleanupRule, 
    content: string, 
    context: CleanupContext
  ): Promise<{
    success: boolean;
    content: string;
    changesApplied: number;
    issues: CleanupIssue[];
  }> {
    try {
      if (this.config.logProgress) {
        logger.debug(`Applying rule: ${rule.name}`);
      }

      const result = await rule.process(content, context);
      
      if (result.changed !== false) {
        if (this.config.logProgress) {
          logger.debug(`Rule ${rule.name} applied ${result.metrics.changesApplied} changes`);
        }

        return {
          success: true,
          content: result.content,
          changesApplied: result.metrics.changesApplied,
          issues: result.metrics.issues,
        };
      } else {
        return {
          success: false,
          content,
          changesApplied: 0,
          issues: [{
            severity: 'error',
            message: `Rule ${rule.name} failed to execute`,
            line: 0,
            column: 0,
            rule: rule.name,
          }],
        };
      }
    } catch (error) {
      return {
        success: false,
        content,
        changesApplied: 0,
        issues: [{
          severity: 'error',
          message: `Rule ${rule.name} threw exception: ${error instanceof Error ? error.message : 'Unknown error'}`,
          line: 0,
          column: 0,
          rule: rule.name,
        }],
      };
    }
  }

  private handleCleanupError(
    error: unknown, 
    originalContent: string, 
    startTime: number, 
    metrics: CleanupMetrics
  ): CleanupServiceResult {
    metrics.processingTimeMs = Date.now() - startTime;
    metrics.issues.push({
      severity: 'error',
      message: `Cleanup service failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      line: 0,
      column: 0,
      rule: 'orchestrator',
    });

    return {
      content: originalContent,
      rulesApplied: [],
      rulesFailed: ['orchestrator'],
      totalMetrics: metrics,
      success: false,
      partialSuccess: false,
    };
  }

  private initializeRules(): Map<string, CleanupRule> {
    const rules = new Map<string, CleanupRule>();

    // Initialize all available cleanup rules
    rules.set('typography', new TypographyRule({
      preserveCodeBlocks: this.config.preserveCodeBlocks,
      preserveInlineCode: this.config.preserveInlineCode,
    }));

    rules.set('headings', new HeadingRule({
      enforceATXStyle: true,
      normalizeWhitespace: true,
    }));

    rules.set('wordWrap', new WordWrapRule({
      targetLineLength: 92,
      wrapLists: this.config.intensity !== 'light',
      preserveCodeBlocks: this.config.preserveCodeBlocks,
    }));

    rules.set('footnotes', new FootnoteRule({
      collectAtDocumentEnd: this.config.intensity === 'heavy',
      preserveInlineReferences: true,
      sortDefinitions: this.config.intensity !== 'light',
    }));

    rules.set('boldface', new BoldfaceRule({
      movePunctuationOutside: true,
      preserveCodeWithinBold: this.config.preserveCodeBlocks,
    }));

    rules.set('artifacts', new ArtifactRule({
      removeConfluenceMacros: this.config.intensity !== 'light',
      removeHTMLComments: true,
      cleanupHTMLEscapes: true,
      removeEmptyContainers: this.config.intensity === 'heavy',
    }));

    return rules;
  }

  private getRulesToExecute(): CleanupRule[] {
    if (this.isCleanupDisabled()) {
      return [];
    }

    const intensityRules = this.getRulesForIntensity();
    const availableRuleNames = new Set(this.availableRules.keys());

    // Start with rules for the current intensity
    let ruleNames = new Set(intensityRules);

    // Apply enabled rules filter
    if (this.config.enabledRules.length > 0) {
      const enabledSet = new Set(this.config.enabledRules.filter(name => availableRuleNames.has(name)));
      ruleNames = enabledSet;
    }

    // Apply disabled rules filter
    for (const disabledRule of this.config.disabledRules) {
      if (availableRuleNames.has(disabledRule)) {
        ruleNames.delete(disabledRule);
      }
    }

    // Convert to ordered array of rules
    const executionOrder = ['artifacts', 'typography', 'headings', 'boldface', 'footnotes', 'wordWrap'];
    const orderedRules: CleanupRule[] = [];

    for (const ruleName of executionOrder) {
      if (ruleNames.has(ruleName)) {
        const rule = this.availableRules.get(ruleName);
        if (rule) {
          orderedRules.push(rule);
        }
      }
    }

    return orderedRules;
  }

  private getRulesForIntensity(): string[] {
    switch (this.config.intensity) {
      case 'light':
        return ['typography', 'boldface'];
      
      case 'standard':
        return ['typography', 'headings', 'boldface', 'footnotes'];
      
      case 'heavy':
        return ['artifacts', 'typography', 'headings', 'boldface', 'footnotes', 'wordWrap'];
      
      default:
        return ['typography', 'headings', 'boldface', 'footnotes'];
    }
  }
}

export const createMarkdownCleanupService = (config?: Partial<CleanupServiceConfig>): MarkdownCleanupService => {
  return new MarkdownCleanupService(config);
};
