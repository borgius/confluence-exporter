/**
 * Unit tests for cleanup service orchestrator.
 * Tests rule coordination, configuration validation, and error handling.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MarkdownCleanupService } from '../../src/cleanup/cleanupService.js';
import type { MarkdownDocument, CleanupConfig } from '../../src/models/markdownCleanup.js';

// Mock the cleanup rules to avoid dependency issues
jest.mock('../../src/cleanup/typographyRule.js', () => ({
  createTypographyRule: () => ({
    name: 'typography',
    priority: 100,
    preserveTypes: ['CODE_BLOCK'],
    canApply: () => true,
    apply: async () => ({
      ruleName: 'typography',
      success: true,
      changesApplied: 3,
      processingTime: 10,
      preservedBlocks: 0,
    }),
  }),
}));

jest.mock('../../src/cleanup/whitespaceRule.js', () => ({
  createWhitespaceRule: () => ({
    name: 'whitespace',
    priority: 90,
    preserveTypes: ['CODE_BLOCK'],
    canApply: () => true,
    apply: async () => ({
      ruleName: 'whitespace',
      success: true,
      changesApplied: 2,
      processingTime: 5,
      preservedBlocks: 0,
    }),
  }),
}));

describe('MarkdownCleanupService', () => {
  const service = new MarkdownCleanupService();

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

  const createTestConfig = (overrides: Partial<CleanupConfig> = {}): CleanupConfig => ({
    enabled: true,
    intensity: 'medium',
    lineLength: 80,
    locale: 'en-us',
    preserveFormatting: true,
    ...overrides,
  });

  describe('Service Initialization', () => {
    it('should initialize with available rules', () => {
      const rules = service.getAvailableRules();
      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.name)).toContain('typography');
      expect(rules.map(r => r.name)).toContain('whitespace');
    });

    it('should return rules sorted by priority', () => {
      const rules = service.getAvailableRules();
      const priorities = rules.map(r => r.priority);
      expect(priorities).toEqual([100, 90]); // typography (100), whitespace (90)
    });
  });

  describe('Configuration Validation', () => {
    it('should validate correct configuration', () => {
      const config = createTestConfig();
      expect(service.validateConfig(config)).toBe(true);
    });

    it('should reject invalid intensity', () => {
      const config = createTestConfig({ intensity: 'invalid' as 'light' });
      expect(service.validateConfig(config)).toBe(false);
    });

    it('should reject invalid line length', () => {
      const config = createTestConfig({ lineLength: 300 });
      expect(service.validateConfig(config)).toBe(false);
    });

    it('should reject unknown rule names', () => {
      const config = createTestConfig({ rules: ['unknown-rule'] });
      expect(service.validateConfig(config)).toBe(false);
    });

    it('should accept valid rule names', () => {
      const config = createTestConfig({ rules: ['typography', 'whitespace'] });
      expect(service.validateConfig(config)).toBe(true);
    });
  });

  describe('Document Processing', () => {
    it('should process document with all rules when enabled', async () => {
      const document = createTestDocument('Test content with "quotes" and  spaces');
      const config = createTestConfig();

      const result = await service.process(document, config);

      expect(result.originalContent).toBe(document.content);
      expect(result.appliedRules).toHaveLength(2);
      expect(result.appliedRules[0].ruleName).toBe('typography'); // Higher priority first
      expect(result.appliedRules[1].ruleName).toBe('whitespace');
      expect(result.errors).toHaveLength(0);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should skip processing when disabled', async () => {
      const document = createTestDocument('Test content');
      const config = createTestConfig({ enabled: false });

      const result = await service.process(document, config);

      expect(result.appliedRules).toHaveLength(0);
      expect(result.warnings).toContain('Cleanup disabled by configuration');
    });

    it('should process only specified rules', async () => {
      const document = createTestDocument('Test content');
      const config = createTestConfig({ rules: ['typography'] });

      const result = await service.process(document, config);

      expect(result.appliedRules).toHaveLength(1);
      expect(result.appliedRules[0].ruleName).toBe('typography');
    });
  });

  describe('Performance', () => {
    it('should process document quickly', async () => {
      const document = createTestDocument('Simple test content');
      const config = createTestConfig();

      const startTime = Date.now();
      const result = await service.process(document, config);
      const totalTime = Date.now() - startTime;

      expect(result.processingTime).toBeLessThan(100);
      expect(totalTime).toBeLessThan(200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty document', async () => {
      const document = createTestDocument('');
      const config = createTestConfig();

      const result = await service.process(document, config);

      expect(result.originalContent).toBe('');
      expect(result.cleanedContent).toBe('');
      expect(result.errors).toHaveLength(0);
    });

    it('should handle configuration validation edge cases', () => {
      // Test with invalid enabled type
      expect(service.validateConfig({ enabled: 'true' } as unknown as CleanupConfig)).toBe(false);
      
      // Test with minimum line length
      expect(service.validateConfig(createTestConfig({ lineLength: 40 }))).toBe(true);
      expect(service.validateConfig(createTestConfig({ lineLength: 39 }))).toBe(false);
      
      // Test with maximum line length
      expect(service.validateConfig(createTestConfig({ lineLength: 200 }))).toBe(true);
      expect(service.validateConfig(createTestConfig({ lineLength: 201 }))).toBe(false);
    });
  });
});
