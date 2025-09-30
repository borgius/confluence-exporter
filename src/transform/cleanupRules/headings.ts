/**
 * T102: Heading normalization rule
 * Implements heading structure cleanup and standardization
 * Supports FR-035 for markdown cleanup and quality enhancement
 */

import type { CleanupRule, CleanupContext, CleanupResult, CleanupMetrics, RuleConfig } from '../../models/markdownCleanup.js';

export interface HeadingConfig extends RuleConfig {
  normalizeWhitespace: boolean;
  enforceAtxStyle: boolean;
  limitMaxLevel: number;
  addSpacingAfter: boolean;
  removeTrailingMarks: boolean;
  preserveCodeBlocks: boolean;
  enforceHierarchy: boolean;
}

interface HeadingInfo {
  level: number;
  text: string;
  line: number;
  originalLine: string;
  hasSpacingIssues: boolean;
  hasTrailingMarks: boolean;
  isSetextStyle: boolean;
}

export class HeadingRule implements CleanupRule {
  readonly name = 'headings';
  readonly description = 'Normalizes heading structure and formatting';
  readonly version = '1.0.0';

  private readonly config: HeadingConfig;

  constructor(config: Partial<HeadingConfig> = {}) {
    this.config = {
      normalizeWhitespace: true,
      enforceAtxStyle: true,
      limitMaxLevel: 6,
      addSpacingAfter: true,
      removeTrailingMarks: true,
      preserveCodeBlocks: true,
      enforceHierarchy: false, // Off by default as it can be aggressive
      ...config,
    };
  }

  async process(content: string, context: CleanupContext): Promise<CleanupResult> {
    const startTime = Date.now();
    const metrics: CleanupMetrics = {
      changesApplied: 0,
      charactersProcessed: content.length,
      processingTimeMs: 0,
      issues: [],
    };

    try {
      let processedContent = content;
      
      // Extract code blocks to preserve them
      const codeExtractions = this.extractCodeSections(processedContent);
      processedContent = codeExtractions.content;

      // Apply heading normalizations in sequence
      processedContent = this.applyHeadingNormalizations(processedContent, metrics);

      // Restore code sections
      processedContent = this.restoreCodeSections(processedContent, codeExtractions.sections);

      return this.createSuccessResult(processedContent, context, metrics, startTime);

    } catch (error) {
      return this.createErrorResult(content, context, error, metrics, startTime);
    }
  }

  private applyHeadingNormalizations(content: string, metrics: CleanupMetrics): string {
    let processedContent = content;
    
    // Parse headings once
    const headings = this.parseHeadings(processedContent);
    
    // Apply each normalization
    if (this.config.enforceAtxStyle) {
      const result = this.enforceAtxStyle(processedContent, headings);
      processedContent = result.content;
      metrics.changesApplied += result.changes;
    }

    if (this.config.normalizeWhitespace) {
      const result = this.normalizeHeadingWhitespace(processedContent);
      processedContent = result.content;
      metrics.changesApplied += result.changes;
    }

    if (this.config.removeTrailingMarks) {
      const result = this.removeTrailingMarks(processedContent);
      processedContent = result.content;
      metrics.changesApplied += result.changes;
    }

    if (this.config.limitMaxLevel > 0) {
      const result = this.limitHeadingLevels(processedContent);
      processedContent = result.content;
      metrics.changesApplied += result.changes;
      this.addLevelWarnings(result.warnings, metrics);
    }

    if (this.config.addSpacingAfter) {
      const result = this.addHeadingSpacing(processedContent);
      processedContent = result.content;
      metrics.changesApplied += result.changes;
    }

    if (this.config.enforceHierarchy) {
      const result = this.enforceHeadingHierarchy(processedContent);
      processedContent = result.content;
      metrics.changesApplied += result.changes;
      this.addHierarchyWarnings(result.warnings, metrics);
    }

    return processedContent;
  }

  private createSuccessResult(
    content: string, 
    context: CleanupContext, 
    metrics: CleanupMetrics, 
    startTime: number
  ): CleanupResult {
    metrics.processingTimeMs = Date.now() - startTime;

    return {
      content,
      metadata: {
        ruleApplied: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        context,
      },
      metrics,
      changed: metrics.changesApplied > 0,
    };
  }

  private createErrorResult(
    content: string, 
    context: CleanupContext, 
    error: unknown,
    metrics: CleanupMetrics, 
    startTime: number
  ): CleanupResult {
    metrics.issues.push({
      severity: 'error',
      message: `Heading rule failed: ${error}`,
      line: 0,
      column: 0,
      rule: this.name,
    });

    metrics.processingTimeMs = Date.now() - startTime;

    return {
      content,
      metadata: {
        ruleApplied: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        context,
      },
      metrics,
      changed: false,
    };
  }

  private addLevelWarnings(warnings: number, metrics: CleanupMetrics): void {
    if (warnings > 0) {
      metrics.issues.push({
        severity: 'warning',
        message: `${warnings} headings exceeded maximum level (${this.config.limitMaxLevel}) and were capped`,
        line: 0,
        column: 0,
        rule: this.name,
      });
    }
  }

  private addHierarchyWarnings(warnings: number, metrics: CleanupMetrics): void {
    if (warnings > 0) {
      metrics.issues.push({
        severity: 'warning',
        message: `${warnings} heading hierarchy violations were fixed`,
        line: 0,
        column: 0,
        rule: this.name,
      });
    }
  }

  private extractCodeSections(content: string): { content: string; sections: Map<string, string> } {
    const sections = new Map<string, string>();
    let processed = content;
    const placeholderIndex = 0;

    if (this.config.preserveCodeBlocks) {
      processed = this.extractFencedCodeBlocks(processed, sections, placeholderIndex);
      processed = this.extractIndentedCodeBlocks(processed, sections, placeholderIndex);
    }

    return { content: processed, sections };
  }

  private extractFencedCodeBlocks(
    content: string, 
    sections: Map<string, string>, 
    placeholderIndex: number
  ): string {
    return content.replace(/```[\s\S]*?```/g, (match) => {
      const placeholder = `__CODEBLOCK_${placeholderIndex++}__`;
      sections.set(placeholder, match);
      return placeholder;
    });
  }

  private extractIndentedCodeBlocks(
    content: string, 
    sections: Map<string, string>, 
    placeholderIndex: number
  ): string {
    const lines = content.split('\n');
    const processedLines: string[] = [];
    const state = { inCodeBlock: false, codeBlockLines: [] as string[], index: placeholderIndex };

    for (const line of lines) {
      this.processCodeLine(line, processedLines, sections, state);
    }

    // Handle case where file ends with code block
    if (state.inCodeBlock && state.codeBlockLines.length > 0) {
      this.addCodeBlockPlaceholder(processedLines, state.codeBlockLines, sections, state.index);
    }

    return processedLines.join('\n');
  }

  private processCodeLine(
    line: string, 
    processedLines: string[], 
    sections: Map<string, string>, 
    state: { inCodeBlock: boolean; codeBlockLines: string[]; index: number }
  ): void {
    const isCodeLine = line.startsWith('    ') && line.trim() !== '';
    
    if (isCodeLine && !state.inCodeBlock) {
      state.inCodeBlock = true;
      state.codeBlockLines = [line];
    } else if (isCodeLine && state.inCodeBlock) {
      state.codeBlockLines.push(line);
    } else if (!isCodeLine && state.inCodeBlock) {
      this.addCodeBlockPlaceholder(processedLines, state.codeBlockLines, sections, state.index++);
      processedLines.push(line);
      state.inCodeBlock = false;
      state.codeBlockLines = [];
    } else {
      processedLines.push(line);
    }
  }

  private addCodeBlockPlaceholder(
    processedLines: string[], 
    codeBlockLines: string[], 
    sections: Map<string, string>, 
    placeholderIndex: number
  ): void {
    const placeholder = `__INDENTEDCODE_${placeholderIndex}__`;
    sections.set(placeholder, codeBlockLines.join('\n'));
    processedLines.push(placeholder);
  }

  private restoreCodeSections(content: string, sections: Map<string, string>): string {
    let restored = content;
    
    for (const [placeholder, original] of sections) {
      restored = restored.replace(placeholder, original);
    }
    
    return restored;
  }

  private parseHeadings(content: string): HeadingInfo[] {
    const headings: HeadingInfo[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

      // Check ATX-style headings (# ## ### etc.)
      const atxHeading = this.parseAtxHeading(line, i);
      if (atxHeading) {
        headings.push(atxHeading);
        continue;
      }

      // Check Setext-style headings (underlined)
      const setextHeading = this.parseSetextHeading(line, nextLine, i);
      if (setextHeading) {
        headings.push(setextHeading);
      }
    }

    return headings;
  }

  private parseAtxHeading(line: string, lineIndex: number): HeadingInfo | null {
    const atxMatch = line.match(/^(\s*)(#{1,6})\s*(.+?)(\s*#*\s*)$/);
    if (!atxMatch) return null;

    const [, leadingSpace, hashes, text, trailing] = atxMatch;
    return {
      level: hashes.length,
      text: text.trim(),
      line: lineIndex + 1,
      originalLine: line,
      hasSpacingIssues: leadingSpace.length > 0 || trailing.trim() !== '',
      hasTrailingMarks: trailing.includes('#'),
      isSetextStyle: false,
    };
  }

  private parseSetextHeading(line: string, nextLine: string, lineIndex: number): HeadingInfo | null {
    if (!nextLine || line.trim() === '') return null;

    if (/^[=]{3,}/.test(nextLine)) {
      return {
        level: 1,
        text: line.trim(),
        line: lineIndex + 1,
        originalLine: line,
        hasSpacingIssues: false,
        hasTrailingMarks: false,
        isSetextStyle: true,
      };
    }

    if (/^[-]{3,}/.test(nextLine)) {
      return {
        level: 2,
        text: line.trim(),
        line: lineIndex + 1,
        originalLine: line,
        hasSpacingIssues: false,
        hasTrailingMarks: false,
        isSetextStyle: true,
      };
    }

    return null;
  }

  private enforceAtxStyle(content: string, headings: HeadingInfo[]): { content: string; changes: number } {
    let changes = 0;
    const processed = content;
    const lines = processed.split('\n');

    // Convert Setext-style to ATX-style
    for (const heading of headings) {
      if (heading.isSetextStyle) {
        const headingLineIndex = heading.line - 1;
        const underlineIndex = headingLineIndex + 1;
        
        if (underlineIndex < lines.length) {
          const hashes = '#'.repeat(heading.level);
          lines[headingLineIndex] = `${hashes} ${heading.text}`;
          lines[underlineIndex] = ''; // Remove underline
          changes += 2;
        }
      }
    }

    return { content: lines.join('\n'), changes };
  }

  private normalizeHeadingWhitespace(content: string): { content: string; changes: number } {
    let changes = 0;
    const processed = content;

    // Normalize ATX headings: remove leading/trailing spaces, ensure one space after #
    const result = processed.replace(/^(\s*)(#{1,6})\s*(.+?)(\s*#*\s*)$/gm, (_match, _leadingSpace, hashes, text, _trailing) => {
      const normalized = `${hashes} ${text.trim()}`;
      
      // Only count as change if something actually changed
      if (_match !== normalized) {
        changes++;
      }
      
      return normalized;
    });

    return { content: result, changes };
  }

  private removeTrailingMarks(content: string): { content: string; changes: number } {
    let changes = 0;

    // Remove trailing # marks from ATX headings
    const processed = content.replace(/^(#{1,6}\s+.+?)\s*#+\s*$/gm, (_match, cleanContent) => {
      changes++;
      return cleanContent.trim();
    });

    return { content: processed, changes };
  }

  private limitHeadingLevels(content: string): { content: string; changes: number; warnings: number } {
    let changes = 0;
    let warnings = 0;
    let processed = content;
    const maxLevel = this.config.limitMaxLevel;

    processed = processed.replace(/^(#{1,})\s+(.+)$/gm, (match, hashes, text) => {
      if (hashes.length > maxLevel) {
        warnings++;
        changes++;
        return `${'#'.repeat(maxLevel)} ${text}`;
      }
      return match;
    });

    return { content: processed, changes, warnings };
  }

  private addHeadingSpacing(content: string): { content: string; changes: number } {
    let changes = 0;
    const lines = content.split('\n');
    const processedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isHeading = /^#{1,6}\s+/.test(line);
      
      processedLines.push(line);
      
      if (isHeading) {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        
        // Add blank line after heading if next line isn't empty and isn't another heading
        if (nextLine && nextLine.trim() !== '' && !/^#{1,6}\s+/.test(nextLine)) {
          processedLines.push('');
          changes++;
          i++; // Skip the next line since we're handling it here
          processedLines.push(nextLine);
        }
      }
    }

    return { content: processedLines.join('\n'), changes };
  }

  private enforceHeadingHierarchy(content: string): { content: string; changes: number; warnings: number } {
    let changes = 0;
    let warnings = 0;
    const lines = content.split('\n');
    let lastHeadingLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headingMatch) {
        const [, hashes, text] = headingMatch;
        const currentLevel = hashes.length;
        
        // Check if we've skipped levels (e.g., going from H1 to H3)
        if (lastHeadingLevel > 0 && currentLevel > lastHeadingLevel + 1) {
          const adjustedLevel = lastHeadingLevel + 1;
          lines[i] = `${'#'.repeat(adjustedLevel)} ${text}`;
          changes++;
          warnings++;
          lastHeadingLevel = adjustedLevel;
        } else {
          lastHeadingLevel = currentLevel;
        }
      }
    }

    return { content: lines.join('\n'), changes, warnings };
  }
}

/**
 * Create a heading rule with default configuration.
 */
export function createHeadingRule(config?: Partial<HeadingConfig>): HeadingRule {
  return new HeadingRule(config);
}

/**
 * Heading normalization patterns for different contexts.
 */
export const headingPatterns = {
  atxHeading: /^(\s*)(#{1,6})\s*(.+?)(\s*#*\s*)$/gm,
  setextH1: /^(.+)\n[=]{3,}/gm,
  setextH2: /^(.+)\n[-]{3,}/gm,
  headingWithTrailing: /^(#{1,6}\s+.+?)\s*#+\s*$/gm,
  leadingWhitespace: /^\s+(#{1,6})/gm,
};

/**
 * Check if heading normalization can be applied safely.
 */
export function canApplyHeadingNormalization(content: string): boolean {
  // Don't apply to content without any headings
  const hasHeadings = /^#{1,6}\s+/.test(content) || /^.+\n[=-]{3,}/.test(content);
  return hasHeadings;
}

/**
 * Analyze heading structure in content (simplified version).
 */
export function analyzeHeadingStructure(content: string): {
  totalHeadings: number;
  levelDistribution: Record<number, number>;
  hasHierarchyIssues: boolean;
  hasFormattingIssues: boolean;
  setextStyleCount: number;
  atxStyleCount: number;
} {
  const analysis = {
    totalHeadings: 0,
    levelDistribution: {} as Record<number, number>,
    hasHierarchyIssues: false,
    hasFormattingIssues: false,
    setextStyleCount: 0,
    atxStyleCount: 0,
  };

  const atxMatches = content.match(/^(\s*)(#{1,6})\s*(.+?)(\s*#*\s*)$/gm) || [];
  const setextH1Matches = content.match(/^.+\n[=]{3,}/gm) || [];
  const setextH2Matches = content.match(/^.+\n[-]{3,}/gm) || [];

  analysis.atxStyleCount = atxMatches.length;
  analysis.setextStyleCount = setextH1Matches.length + setextH2Matches.length;
  analysis.totalHeadings = analysis.atxStyleCount + analysis.setextStyleCount;

  // Simple heuristics for issues
  analysis.hasFormattingIssues = atxMatches.some(match => 
    match.trim().startsWith(' #') || match.includes('# ')
  );

  // Count level distribution
  for (const match of atxMatches) {
    const hashes = match.match(/#{1,6}/)?.[0];
    if (hashes) {
      const level = hashes.length;
      analysis.levelDistribution[level] = (analysis.levelDistribution[level] || 0) + 1;
    }
  }

  return analysis;
}

/**
 * Preview heading changes without applying them.
 */
export function previewHeadingChanges(content: string, config?: Partial<HeadingConfig>): {
  changes: Array<{
    type: 'format' | 'style' | 'hierarchy' | 'spacing';
    line: number;
    original: string;
    fixed: string;
    description: string;
  }>;
  estimatedChanges: number;
} {
  const changes: Array<{
    type: 'format' | 'style' | 'hierarchy' | 'spacing';
    line: number;
    original: string;
    fixed: string;
    description: string;
  }> = [];

  const analysis = analyzeHeadingStructure(content);
  let estimatedChanges = 0;

  // Estimate based on detected issues
  if (analysis.hasFormattingIssues) {
    estimatedChanges += analysis.atxStyleCount;
  }
  
  if (analysis.setextStyleCount > 0 && config?.enforceAtxStyle !== false) {
    estimatedChanges += analysis.setextStyleCount * 2; // Convert + remove underline
  }
  
  if (analysis.hasHierarchyIssues && config?.enforceHierarchy) {
    estimatedChanges += Math.floor(analysis.totalHeadings * 0.1); // Estimate 10% need fixes
  }

  return { changes, estimatedChanges };
}
