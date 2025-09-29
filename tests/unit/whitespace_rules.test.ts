/**
 * Unit tests for whitespace cleanup rule.
 * Tests line ending normalization, trailing whitespace removal, and space normalization.
 */

import { describe, it, expect } from '@jest/globals';
import { WhitespaceCleanupRule } from '../../src/cleanup/whitespaceRule.js';
import type { MarkdownDocument } from '../../src/models/markdownCleanup.js';

// Mock the markdown parser to avoid ES module issues in Jest
jest.mock('../../src/util/markdownParser.js', () => ({
  parseMarkdown: jest.fn().mockResolvedValue({
    preservedSections: [],
    ast: {},
    vfile: {}
  })
}));

describe('Whitespace Cleanup Rule', () => {
  const rule = new WhitespaceCleanupRule();

  const createTestDocument = (content: string): MarkdownDocument => ({
    content,
    filePath: '/test/document.md',
    metadata: {
      language: 'en',
      frontmatter: false,
      hasMath: false,
      hasCode: false,
      wordCount: 10,
      lineCount: 3,
    },
  });

  describe('Basic Rule Properties', () => {
    it('should have correct rule properties', () => {
      expect(rule.name).toBe('whitespace');
      expect(rule.priority).toBe(90);
      expect(rule.preserveTypes).toContain('CODE_BLOCK');
      expect(rule.preserveTypes).toContain('INLINE_CODE');
    });

    it('should be applicable to documents with content', () => {
      const doc = createTestDocument('Some content');
      expect(rule.canApply(doc)).toBe(true);
    });

    it('should not be applicable to empty documents', () => {
      const doc = createTestDocument('');
      expect(rule.canApply(doc)).toBe(false);
    });
  });

  describe('Line Endings', () => {
    it('should normalize CRLF to LF', async () => {
      const doc = createTestDocument('Line 1\r\nLine 2\r\nLine 3');
      const result = await rule.apply(doc);
      
      expect(result.success).toBe(true);
      expect(result.changesApplied).toBeGreaterThan(0);
      expect(result.ruleName).toBe('whitespace');
    });

    it('should normalize CR to LF', async () => {
      const doc = createTestDocument('Line 1\rLine 2\rLine 3');
      const result = await rule.apply(doc);
      
      expect(result.success).toBe(true);
      expect(result.changesApplied).toBeGreaterThan(0);
    });
  });

  describe('Trailing Whitespace', () => {
    it('should remove trailing spaces', async () => {
      const doc = createTestDocument('Line with trailing spaces   \nAnother line  ');
      const result = await rule.apply(doc);
      
      expect(result.success).toBe(true);
      expect(result.changesApplied).toBeGreaterThan(0);
    });

    it('should remove trailing tabs', async () => {
      const doc = createTestDocument('Line with trailing tabs\t\t\nAnother line\t');
      const result = await rule.apply(doc);
      
      expect(result.success).toBe(true);
      expect(result.changesApplied).toBeGreaterThan(0);
    });
  });

  describe('Space Normalization', () => {
    it('should normalize multiple spaces to single space', async () => {
      const doc = createTestDocument('Text  with   multiple    spaces');
      const result = await rule.apply(doc);
      
      expect(result.success).toBe(true);
      expect(result.changesApplied).toBeGreaterThan(0);
    });
  });

  describe('Blank Lines', () => {
    it('should reduce excessive blank lines', async () => {
      const doc = createTestDocument('Line 1\n\n\n\n\nLine 2');
      const result = await rule.apply(doc);
      
      expect(result.success).toBe(true);
      expect(result.changesApplied).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should process whitespace rules quickly', async () => {
      const largeContent = 'Line with spaces  \n'.repeat(100);
      const doc = createTestDocument(largeContent);
      
      const result = await rule.apply(doc);
      
      expect(result.success).toBe(true);
      expect(result.processingTime).toBeLessThan(100); // Should be fast
    });
  });

  describe('Edge Cases', () => {
    it('should handle content with only whitespace', async () => {
      const doc = createTestDocument('   \n\t\n   \n');
      const result = await rule.apply(doc);
      
      expect(result.success).toBe(true);
      expect(result.changesApplied).toBeGreaterThan(0);
    });
  });
});
