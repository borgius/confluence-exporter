/**
 * Markdown cleanup utility
 * Cleans up malformed markdown generated during HTML to Markdown conversion
 */

export class MarkdownCleaner {
  /**
   * Clean up malformed markdown patterns
   */
  clean(markdown: string): string {
    let cleaned = markdown;

    // Remove empty headers with just bold/italic markers (no content between them)
    // Match: ## ** or ## * (at end of line)
    cleaned = cleaned.replace(/^#+\s*\*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^#+\s*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^#+\s*__\s*$/gm, '');
    cleaned = cleaned.replace(/^#+\s*_\s*$/gm, '');
    
    // Remove headers that only contain bold/italic markers across multiple lines
    // Example: ## **\n\n** (with only whitespace between)
    cleaned = cleaned.replace(/^(#+)\s*\*\*\s*\n+\s*\*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^(#+)\s*\*\s*\n+\s*\*\s*$/gm, '');
    
    // Remove empty bold markers (no content or only whitespace between)
    cleaned = cleaned.replace(/\*\*\s*\*\*/g, '');
    cleaned = cleaned.replace(/__\s*__/g, '');
    
    // Remove standalone italic markers on their own line
    cleaned = cleaned.replace(/^\s*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^\s*_\s*$/gm, '');
    
    // Remove empty italic markers that span multiple lines (only if truly empty)
    cleaned = cleaned.replace(/\*\s*\n+\s*\*/g, '\n\n');
    
    // Remove empty links
    cleaned = cleaned.replace(/\[\s*\]\(\s*\)/g, '');
    
    // Remove empty list items
    cleaned = cleaned.replace(/^[-*+]\s*$/gm, '');
    
    // Clean up excessive blank lines (more than 3 consecutive)
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    
    // Remove trailing whitespace from each line
    cleaned = cleaned.replace(/[ \t]+$/gm, '');
    
    // Ensure single trailing newline at end of file
    cleaned = cleaned.trim() + '\n';

    return cleaned;
  }

  /**
   * Clean up specific problematic patterns that appear in Confluence exports
   */
  cleanConfluencePatterns(markdown: string): string {
    let cleaned = markdown;

    // Remove standalone bold markers that are not part of content
    // This handles cases like "**\n\n**" or "** **"
    cleaned = cleaned.replace(/\*\*\s*\n\s*\n\s*\*\*/g, '');
    
    // Remove lines that only contain **
    cleaned = cleaned.replace(/^\s*\*\*\s*$/gm, '');
    
    // Remove empty headers (headers with no content)
    cleaned = cleaned.replace(/^#+\s*$/gm, '');
    
    // Remove bold markers around only whitespace
    cleaned = cleaned.replace(/\*\*\s+\*\*/g, ' ');
    
    // Remove italic markers around only whitespace
    cleaned = cleaned.replace(/\*\s+\*/g, ' ');
    
    // Clean up malformed blockquotes
    cleaned = cleaned.replace(/^>\s*$/gm, '');
    
    // Remove empty code blocks
    cleaned = cleaned.replace(/```\s*\n\s*```/g, '');
    
    // Clean up malformed horizontal rules
    cleaned = cleaned.replace(/^[-*_]\s*$/gm, '');

    return cleaned;
  }

  /**
   * Apply all cleaning steps
   */
  cleanAll(markdown: string): string {
    let cleaned = markdown;
    
    // First pass: clean confluence-specific patterns
    cleaned = this.cleanConfluencePatterns(cleaned);
    
    // Second pass: general cleanup
    cleaned = this.clean(cleaned);
    
    // Third pass: another round of confluence patterns to catch any new issues
    cleaned = this.cleanConfluencePatterns(cleaned);
    
    // Final cleanup of excessive whitespace
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    cleaned = cleaned.trim() + '\n';
    
    return cleaned;
  }
}
