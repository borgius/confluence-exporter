/**
 * Cleanup entities for markdown post-processing.
 * Defines types for cleanup rules, results, and document processing.
 */

export type ContentType = 
  | 'TEXT'
  | 'CODE_BLOCK'
  | 'INLINE_CODE'
  | 'MATH_BLOCK'
  | 'MATH_INLINE'
  | 'FRONTMATTER'
  | 'HTML'
  | 'LINK'
  | 'IMAGE';

export type CleanupIntensity = 'light' | 'medium' | 'heavy';

export type ErrorSeverity = 'warning' | 'error';

export interface DocumentMetadata {
  language: string;
  frontmatter: boolean;
  hasMath: boolean;
  hasCode: boolean;
  wordCount: number;
  lineCount: number;
}

export interface PreservedSection {
  type: ContentType;
  startLine: number;
  endLine: number;
  marker: string;
}

export interface MarkdownDocument {
  content: string;
  filePath: string;
  sourcePageId?: string;
  metadata: DocumentMetadata;
  preservedSections?: PreservedSection[];
}

export interface RuleConfig {
  [key: string]: unknown;
}

// New interfaces for transform/cleanupRules pattern
export interface CleanupContext {
  fileName: string;
  spaceKey: string;
  pageId: string;
  filePath?: string;
}

export interface CleanupIssue {
  severity: ErrorSeverity;
  message: string;
  line: number;
  column: number;
  rule: string;
}

export interface CleanupMetrics {
  changesApplied: number;
  charactersProcessed: number;
  processingTimeMs: number;
  issues: CleanupIssue[];
}

export interface CleanupResultMetadata {
  ruleApplied: string;
  version: string;
  timestamp: string;
  context: CleanupContext;
}

export interface CleanupResult {
  content: string;
  metadata: CleanupResultMetadata;
  metrics: CleanupMetrics;
  changed: boolean;
}

// Interface for transform/cleanupRules pattern
export interface CleanupRule {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  process(content: string, context: CleanupContext): Promise<CleanupResult>;
}

// Original interfaces for cleanup service pattern
export interface OldCleanupRule {
  name: string;
  priority: number;
  enabled: boolean;
  config: RuleConfig;
  preserveTypes?: ContentType[];
}

export interface CleanupError {
  ruleName: string;
  line?: number;
  message: string;
  severity: ErrorSeverity;
}

export interface RuleResult {
  ruleName: string;
  success: boolean;
  changesApplied: number;
  processingTime: number;
  errorMessage?: string;
  preservedBlocks: number;
}

export interface OldCleanupResult {
  originalContent: string;
  cleanedContent: string;
  appliedRules: RuleResult[];
  processingTime: number;
  errors: CleanupError[];
  warnings: string[];
  success: boolean;
}

export interface CleanupStats {
  documentsProcessed: number;
  totalProcessingTime: number;
  rulesApplied: number;
  errorsEncountered: number;
  averageProcessingTime: number;
}

export interface CleanupConfig {
  enabled: boolean;
  intensity: CleanupIntensity;
  rules?: string[];
  lineLength: number;
  locale: string;
  preserveFormatting: boolean;
}

// Rule interface for implementing individual cleanup rules
export interface ICleanupRule {
  readonly name: string;
  readonly priority: number;
  readonly preserveTypes: ContentType[];
  
  apply(document: MarkdownDocument, config: RuleConfig): Promise<RuleResult>;
  canApply(document: MarkdownDocument): boolean;
}

// Service interface for cleanup orchestration
export interface ICleanupService {
  process(document: MarkdownDocument, config: CleanupConfig): Promise<OldCleanupResult>;
  getAvailableRules(): ICleanupRule[];
  validateConfig(config: CleanupConfig): boolean;
}

// Default configurations for different intensity levels
export const DEFAULT_CLEANUP_CONFIGS: Record<CleanupIntensity, Partial<CleanupConfig>> = {
  light: {
    intensity: 'light',
    rules: ['typography'],
    preserveFormatting: true,
  },
  medium: {
    intensity: 'medium',
    rules: ['typography', 'headings', 'spacing'],
    preserveFormatting: true,
  },
  heavy: {
    intensity: 'heavy',
    rules: ['typography', 'headings', 'spacing', 'wordWrap', 'artifacts', 'footnotes'],
    preserveFormatting: false,
  },
};

// Default configuration
export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  enabled: true,
  intensity: 'heavy',
  lineLength: 92,
  locale: 'en-us',
  preserveFormatting: false,
};

// Utility functions for working with cleanup types
export function createDocumentMetadata(content: string, _filePath: string): DocumentMetadata {
  const lines = content.split('\n');
  const words = content.split(/\s+/).filter(word => word.length > 0);
  
  return {
    language: 'en-us',
    frontmatter: content.startsWith('---'),
    hasMath: /\$\$|\$[^$]+\$/.test(content),
    hasCode: /```|`[^`]+`/.test(content),
    wordCount: words.length,
    lineCount: lines.length,
  };
}

export function createMarkdownDocument(
  content: string, 
  filePath: string, 
  sourcePageId?: string
): MarkdownDocument {
  return {
    content,
    filePath,
    sourcePageId,
    metadata: createDocumentMetadata(content, filePath),
    preservedSections: [],
  };
}

export function createRuleResult(
  ruleName: string, 
  success: boolean = true, 
  changesApplied: number = 0,
  processingTime: number = 0
): RuleResult {
  return {
    ruleName,
    success,
    changesApplied,
    processingTime,
    preservedBlocks: 0,
  };
}

export function createCleanupError(
  ruleName: string, 
  message: string, 
  severity: ErrorSeverity = 'error',
  line?: number
): CleanupError {
  return {
    ruleName,
    message,
    severity,
    line,
  };
}
