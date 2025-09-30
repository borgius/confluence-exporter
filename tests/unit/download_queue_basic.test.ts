/**
 * Unit tests for download queue basic functionality
 */

import { EnhancedMarkdownTransformer, type IMarkdownTransformer } from '../../src/transform/enhancedMarkdownTransformer.js';
import type { Page } from '../../src/models/entities.js';
import type { TransformContext, MarkdownTransformResult } from '../../src/transform/markdownTransformer.js';

// Mock base transformer
const mockBaseTransformer: IMarkdownTransformer = {
  async transform(_page: Page, _context: TransformContext): Promise<MarkdownTransformResult> {
    return {
      content: 'Transformed content',
      frontMatter: { title: 'Test Page' },
      links: [],
      attachments: [],
      users: [],
      macroExpansions: [],
      discoveredPageIds: []
    };
  }
};

describe('Download Queue Basic Functionality', () => {
  let transformer: EnhancedMarkdownTransformer;
  let context: TransformContext;

  beforeEach(() => {
    transformer = new EnhancedMarkdownTransformer(mockBaseTransformer);
    context = {
      baseUrl: 'https://confluence.example.com',
      spaceKey: 'TEST',
      currentPageId: 'current-page'
    };
  });

  it('should return transformation result with discovery data', async () => {
    const page: Page = {
      id: 'test-page-id',
      title: 'Test Page',
      bodyStorage: '<p>Test content</p>',
      version: 1,
      type: 'page',
      ancestors: []
    };

    const result = await transformer.transform(page, context);

    expect(result.content).toBe('Transformed content');
    expect(result.discoveryResult).toBeDefined();
    expect(result.discoveryResult.totalItemsDiscovered).toBeGreaterThanOrEqual(0);
    expect(result.metrics).toBeDefined();
  });

  it('should handle empty pages', async () => {
    const page: Page = {
      id: 'empty-page',
      title: 'Empty Page',
      bodyStorage: '',
      version: 1,
      type: 'page',
      ancestors: []
    };

    const result = await transformer.transform(page, context);

    expect(result.content).toBe('Transformed content');
    expect(result.discoveryResult.totalItemsDiscovered).toBe(0);
  });

  it('should track transformation metrics', async () => {
    const page: Page = {
      id: 'test-page',
      title: 'Test Page',
      bodyStorage: '<p>Some content</p>',
      version: 1,
      type: 'page',
      ancestors: []
    };

    const result = await transformer.transform(page, context);

    expect(result.metrics.transformTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.discoveryTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
  });
});