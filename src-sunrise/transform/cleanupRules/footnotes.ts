/**
 * T104: Footnote positioning rule
 * Repositions footnotes to follow punctuation marks according to typographic conventions
 * Supports FR-027 for markdown cleanup and quality enhancement
 */

import type { CleanupRule, CleanupContext, CleanupResult, CleanupMetrics } from '../../models/markdownCleanup.js';

export interface FootnoteConfig {
  collectAtDocumentEnd: boolean;
  preserveInlineReferences: boolean;
  sortDefinitions: boolean;
  removeOrphaned: boolean;
}

interface FootnoteReference {
  id: string;
  position: number;
  line: number;
  originalText: string;
}

interface FootnoteDefinition {
  id: string;
  content: string;
  line: number;
  originalText: string;
}

interface FootnoteContext {
  references: FootnoteReference[];
  definitions: FootnoteDefinition[];
  usedReferences: Set<string>;
}

export class FootnoteRule implements CleanupRule {
  readonly name = 'footnotes';
  readonly description = 'Repositions footnotes and organizes footnote definitions';
  readonly version = '1.0.0';

  private readonly config: FootnoteConfig;

  constructor(config: Partial<FootnoteConfig> = {}) {
    this.config = {
      collectAtDocumentEnd: true,
      preserveInlineReferences: true,
      sortDefinitions: true,
      removeOrphaned: true,
      ...config,
    };
  }

  async process(content: string, _context: CleanupContext): Promise<CleanupResult> {
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

      // Analyze footnotes in the content
      const footnoteContext = this.analyzeFootnotes(processedContent);
      
      // Reposition footnote references and organize definitions
      if (footnoteContext.references.length > 0 || footnoteContext.definitions.length > 0) {
        processedContent = this.repositionFootnotes(processedContent, footnoteContext);
        metrics.changesApplied += footnoteContext.references.length + footnoteContext.definitions.length;
      }

      // Restore code sections
      processedContent = this.restoreCodeSections(processedContent, codeExtractions.replacements);

      metrics.processingTimeMs = Date.now() - startTime;

      return {
        content: processedContent,
        metadata: {
          ruleApplied: this.name,
          version: this.version,
          timestamp: new Date().toISOString(),
          context: _context,
        },
        metrics,
        changed: processedContent !== content,
      };
    } catch (error) {
      metrics.processingTimeMs = Date.now() - startTime;
      metrics.issues.push({
        severity: 'error',
        message: `Footnote positioning failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        line: 0,
        column: 0,
        rule: this.name,
      });

      return {
        content,
        metadata: {
          ruleApplied: this.name,
          version: this.version,
          timestamp: new Date().toISOString(),
          context: _context,
        },
        metrics,
        changed: false,
      };
    }
  }

  private extractCodeSections(content: string): { content: string; replacements: Map<string, string> } {
    const replacements = new Map<string, string>();
    let processedContent = content;
    let counter = 0;

    // Extract fenced code blocks
    if (this.config.preserveInlineReferences) {
      processedContent = processedContent.replace(/```[\s\S]*?```/g, (match) => {
        const placeholder = `__FOOTNOTE_CODE_BLOCK_${counter++}__`;
        replacements.set(placeholder, match);
        return placeholder;
      });

      // Extract inline code
      processedContent = processedContent.replace(/`[^`]+`/g, (match) => {
        const placeholder = `__FOOTNOTE_INLINE_CODE_${counter++}__`;
        replacements.set(placeholder, match);
        return placeholder;
      });
    }

    return { content: processedContent, replacements };
  }

  private restoreCodeSections(content: string, replacements: Map<string, string>): string {
    let restoredContent = content;
    
    for (const [placeholder, original] of replacements) {
      restoredContent = restoredContent.replace(placeholder, original);
    }
    
    return restoredContent;
  }

  private analyzeFootnotes(content: string): FootnoteContext {
    const lines = content.split('\n');
    const references: FootnoteReference[] = [];
    const definitions: FootnoteDefinition[] = [];
    const usedReferences = new Set<string>();

    // Find footnote references: [^id] or [^1]
    lines.forEach((line, lineIndex) => {
      const referenceMatches = [...line.matchAll(/\[\^([^\]]+)\]/g)];
      referenceMatches.forEach((match) => {
        if (match.index !== undefined) {
          const id = match[1];
          references.push({
            id,
            position: match.index,
            line: lineIndex,
            originalText: match[0],
          });
          usedReferences.add(id);
        }
      });
    });

    // Find footnote definitions: [^id]: content
    lines.forEach((line, lineIndex) => {
      const definitionMatch = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
      if (definitionMatch) {
        const id = definitionMatch[1];
        const content = definitionMatch[2];
        definitions.push({
          id,
          content,
          line: lineIndex,
          originalText: line,
        });
      }
    });

    return { references, definitions, usedReferences };
  }

  private repositionFootnotes(content: string, footnoteContext: FootnoteContext): string {
    const lines = content.split('\n');
    
    // Remove existing footnote definitions from their current positions
    const nonFootnoteLines = lines.filter((_, index) => 
      !footnoteContext.definitions.some(def => def.line === index)
    );

    // Position footnote references after punctuation if needed
    const repositionedLines = this.repositionReferences(nonFootnoteLines, footnoteContext);

    // Add footnote definitions at the end if configured
    if (this.config.collectAtDocumentEnd) {
      const organizedDefinitions = this.organizeDefinitions(footnoteContext);
      if (organizedDefinitions.length > 0) {
        repositionedLines.push(''); // Empty line before footnotes
        repositionedLines.push(...organizedDefinitions);
      }
    }

    return repositionedLines.join('\n');
  }

  private repositionReferences(lines: string[], footnoteContext: FootnoteContext): string[] {
    const result = [...lines];

    // For each footnote reference, check if it needs repositioning after punctuation
    footnoteContext.references.forEach((ref) => {
      const line = result[ref.line];
      if (!line) return;

      // Check if footnote is before punctuation and should be moved after
      const beforePunctuation = /\[\^[^\]]+\][.!?;:,]/;

      if (beforePunctuation.test(line)) {
        // Move footnote after punctuation
        result[ref.line] = line.replace(
          /\[\^([^\]]+)\]([.!?;:,])/g,
          '$2[^$1]'
        );
      }
    });

    return result;
  }

  private organizeDefinitions(footnoteContext: FootnoteContext): string[] {
    let activeDefinitions = footnoteContext.definitions;

    // Remove orphaned definitions if configured
    if (this.config.removeOrphaned) {
      activeDefinitions = activeDefinitions.filter(def => 
        footnoteContext.usedReferences.has(def.id)
      );
    }

    // Sort definitions if configured
    if (this.config.sortDefinitions) {
      activeDefinitions = activeDefinitions.sort((a, b) => {
        // Try to sort numerically first
        const aNum = parseInt(a.id, 10);
        const bNum = parseInt(b.id, 10);
        
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          return aNum - bNum;
        }
        
        // Fall back to alphabetical sorting
        return a.id.localeCompare(b.id);
      });
    }

    return activeDefinitions.map(def => def.originalText);
  }
}

export const createFootnoteRule = (config?: Partial<FootnoteConfig>): FootnoteRule => {
  return new FootnoteRule(config);
};
