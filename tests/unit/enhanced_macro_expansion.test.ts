import { EnhancedMarkdownTransformer, type EnhancedTransformContext } from '../../src/transform/enhancedMarkdownTransformer.js';
import type { ConfluenceApi } from '../../src/confluence/api.js';
import type { Page } from '../../src/models/entities.js';

// Mock ConfluenceApi
const mockApi = {
  getChildPages: jest.fn(),
  getUser: jest.fn(),
  getUserByUsername: jest.fn()
} as unknown as ConfluenceApi;

describe('EnhancedMarkdownTransformer - API-driven Macro Expansion', () => {
  let transformer: EnhancedMarkdownTransformer;
  let context: EnhancedTransformContext;

  beforeEach(() => {
    transformer = new EnhancedMarkdownTransformer();
    context = {
      currentPageId: 'test-page-id',
      spaceKey: 'TEST',
      baseUrl: 'https://confluence.example.com',
      api: mockApi
    };
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('list-children macro expansion', () => {
    it('should fetch child pages and create markdown list', async () => {
      // Mock child pages response
      (mockApi.getChildPages as jest.Mock).mockResolvedValue({
        results: [
          { id: 'child1', title: 'Child Page One', type: 'page' },
          { id: 'child2', title: 'Child Page Two', type: 'page' },
          { id: 'child3', title: 'Another Child', type: 'page' }
        ],
        start: 0,
        limit: 50,
        size: 3
      });

      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: '<p><ac:structured-macro ac:name="list-children" /></p>'
      };

      const result = await transformer.transformWithEnhancements(page, context);
      
      // Verify API was called
      expect(mockApi.getChildPages).toHaveBeenCalledWith('test-page-id', {
        expand: ['version'],
        limit: 50
      });

      // Verify markdown list was created
      expect(result.content).toContain('- [Child Page One](child-page-one.md)');
      expect(result.content).toContain('- [Child Page Two](child-page-two.md)');
      expect(result.content).toContain('- [Another Child](another-child.md)');
    });

    it('should handle pages with no children', async () => {
      (mockApi.getChildPages as jest.Mock).mockResolvedValue({
        results: [],
        start: 0,
        limit: 50,
        size: 0
      });

      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: '<ac:structured-macro ac:name="list-children" />'
      };

      const result = await transformer.transformWithEnhancements(page, context);
      
      expect(mockApi.getChildPages).toHaveBeenCalled();
      expect(result.content).toContain('<!-- No child pages found -->');
    });

    it('should handle API errors gracefully', async () => {
      (mockApi.getChildPages as jest.Mock).mockRejectedValue(new Error('API Error'));

      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: '<ac:structured-macro ac:name="list-children" />'
      };

      const result = await transformer.transformWithEnhancements(page, context);
      
      expect(result.content).toContain('<!-- Failed to expand list-children macro -->');
    });

    it('should handle special characters in page titles', async () => {
      (mockApi.getChildPages as jest.Mock).mockResolvedValue({
        results: [
          { id: 'child1', title: 'Page with Spaces & Special!', type: 'page' },
          { id: 'child2', title: 'UPPERCASE Page', type: 'page' }
        ],
        start: 0,
        limit: 50,
        size: 2
      });

      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: '<ac:structured-macro ac:name="list-children" />'
      };

      const result = await transformer.transformWithEnhancements(page, context);
      
      expect(result.content).toContain('- [Page with Spaces & Special!](page-with-spaces-special.md)');
      expect(result.content).toContain('- [UPPERCASE Page](uppercase-page.md)');
    });
  });

  describe('content-by-label macro expansion', () => {
    it('should create placeholder for content-by-label macro', async () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `<ac:structured-macro ac:name="contentbylabel">
          <ac:parameter ac:name="labels">api, documentation</ac:parameter>
        </ac:structured-macro>`
      };

      const result = await transformer.transformWithEnhancements(page, context);
      
      expect(result.content).toContain('<!-- content-by-label: {"labels":"api, documentation"} -->');
    });
  });

  describe('excerpt-include macro expansion', () => {
    it('should create placeholder for excerpt-include macro', async () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `<ac:structured-macro ac:name="excerpt-include">
          <ac:parameter ac:name="pageTitle">API Documentation</ac:parameter>
        </ac:structured-macro>`
      };

      const result = await transformer.transformWithEnhancements(page, context);
      
      expect(result.content).toContain('<!-- Excerpt from: API Documentation (expansion not yet implemented) -->');
    });
  });

  describe('backward compatibility', () => {
    it('should still work without API', async () => {
      const contextWithoutApi: EnhancedTransformContext = {
        currentPageId: 'test-page-id',
        spaceKey: 'TEST',
        baseUrl: 'https://confluence.example.com'
        // No api property
      };

      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: '<ac:structured-macro ac:name="list-children" />'
      };

      const result = await transformer.transformWithEnhancements(page, contextWithoutApi);
      
      // Should contain the placeholder since API is not available
      expect(result.content).toMatch(/<!-- MACRO_EXPANSION:list-children:\d+:[\w.]+/);
    });

    it('should support legacy transformWithUserResolution method', async () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: 'Simple content'
      };

      const result = await transformer.transformWithUserResolution(page, context);
      
      expect(result.content).toContain('Simple content');
    });
  });

  describe('mixed functionality', () => {
    it('should handle both user resolution and macro expansion', async () => {
      (mockApi.getChildPages as jest.Mock).mockResolvedValue({
        results: [
          { id: 'child1', title: 'Child Page', type: 'page' }
        ],
        start: 0,
        limit: 50,
        size: 1
      });

      (mockApi.getUser as jest.Mock).mockResolvedValue({
        userKey: 'testUserKey123',
        username: 'testuser',
        displayName: 'Test User'
      });

      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `
          <p><ac:structured-macro ac:name="list-children" /></p>
          <p><ac:link><ri:user ri:userkey="testUserKey123" /></ac:link></p>
        `
      };

      const result = await transformer.transformWithEnhancements(page, context);
      
      expect(result.content).toContain('- [Child Page](child-page.md)');
      // Should contain either the resolved user or the fallback
      expect(result.content).toMatch(/\[@(Test User|user:.*?)\]/);
      expect(result.discoveredPageIds).toContain('child1');
    });
  });
});
