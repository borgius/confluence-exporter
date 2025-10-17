/**
 * Tests for MarkdownCleaner
 */

import { MarkdownCleaner } from '../src/cleaner.js';

describe('MarkdownCleaner', () => {
  const cleaner = new MarkdownCleaner();

  describe('clean', () => {
    it('should remove empty headers with bold markers', () => {
      const input = '## **\n\n**';
      const result = cleaner.cleanAll(input); // Use cleanAll instead of clean for multi-pass
      // After cleaning, should only have minimal whitespace
      const trimmed = result.trim();
      expect(trimmed).toBe('');
    });

    it('should remove empty headers with just **', () => {
      const input = '## **';
      const result = cleaner.clean(input);
      expect(result).toBe('\n');
    });

    it('should remove empty bold markers', () => {
      const input = 'Some text ** ** more text';
      const result = cleaner.clean(input);
      expect(result).toBe('Some text  more text\n');
    });

    it('should remove trailing whitespace from lines', () => {
      const input = 'Line 1   \nLine 2\t\t\nLine 3';
      const result = cleaner.clean(input);
      expect(result).toBe('Line 1\nLine 2\nLine 3\n');
    });

    it('should preserve valid markdown', () => {
      const input = '# Header\n\n**Bold text** and *italic text*\n\n- List item 1\n- List item 2';
      const result = cleaner.clean(input);
      expect(result).toContain('# Header');
      expect(result).toContain('**Bold text**');
      expect(result).toContain('*italic text*');
      expect(result).toContain('- List item 1');
    });
  });

  describe('cleanConfluencePatterns', () => {
    it('should remove standalone bold markers across lines', () => {
      const input = '**\n\n**';
      const result = cleaner.cleanConfluencePatterns(input);
      expect(result).toBe('');
    });
  });

  describe('cleanAll', () => {
    it('should handle the confluence header issue', () => {
      const input = 'Some content\n\n## **\n\n**\n\nMore content';
      const result = cleaner.cleanAll(input);
      expect(result).not.toContain('## **');
      expect(result).toContain('Some content');
      expect(result).toContain('More content');
    });

    it('should handle complex malformed markdown', () => {
      const input = `# Valid Header

## **

**

Some **valid bold** text

**   **

* 

More content`;
      const result = cleaner.cleanAll(input);
      expect(result).toContain('# Valid Header');
      expect(result).toContain('**valid bold**');
      expect(result).toContain('More content');
      expect(result).not.toContain('## **');
    });

    it('should preserve well-formed markdown', () => {
      const input = `# Main Title

## Subtitle

This is **bold** and this is *italic*.

- List item 1
- List item 2

[Link text](https://example.com)

\`\`\`javascript
const code = "example";
\`\`\`

> A quote

Regular paragraph.`;
      const result = cleaner.cleanAll(input);
      expect(result).toContain('# Main Title');
      expect(result).toContain('## Subtitle');
      expect(result).toContain('**bold**');
      expect(result).toContain('*italic*');
      expect(result).toContain('[Link text](https://example.com)');
      expect(result).toContain('```javascript');
      expect(result).toContain('> A quote');
    });
  });
});
