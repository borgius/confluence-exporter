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

  it('should return discovered page IDs from basic transformation', async () => {
        { id: 'child2', title: 'Child Page 2', type: 'page' },
        { id: 'child3', title: 'Child Page 3', type: 'page' }
      ],
      start: 0,
      limit: 50,
      size: 3
    });

    const page: Page = {
      id: 'parent-page',
      title: 'Parent Page',
      type: 'page',
      bodyStorage: `
        <p>This page lists its children:</p>
        <ac:structured-macro ac:name="list-children" />
        <p>End of content</p>
      `
    };

    const result = await transformer.transformWithEnhancements(page, context);

    // Verify the content contains the child page links
    expect(result.content).toContain('- [Child Page 1](child-page-1.md)');
    expect(result.content).toContain('- [Child Page 2](child-page-2.md)');
    expect(result.content).toContain('- [Child Page 3](child-page-3.md)');

    // Verify discovered page IDs are returned
    expect(result.discoveredPageIds).toHaveLength(3);
    expect(result.discoveredPageIds).toContain('child1');
    expect(result.discoveredPageIds).toContain('child2');
    expect(result.discoveredPageIds).toContain('child3');
  });

  it('should handle multiple list-children macros and collect all page IDs', async () => {
    // Mock different responses for different parent pages
    (mockApi.getChildPages as jest.Mock)
      .mockResolvedValueOnce({
        results: [
          { id: 'section1-child1', title: 'Section 1 Child', type: 'page' }
        ],
        start: 0,
        limit: 50,
        size: 1
      })
      .mockResolvedValueOnce({
        results: [
          { id: 'section2-child1', title: 'Section 2 Child 1', type: 'page' },
          { id: 'section2-child2', title: 'Section 2 Child 2', type: 'page' }
        ],
        start: 0,
        limit: 50,
        size: 2
      });

    const page: Page = {
      id: 'overview-page',
      title: 'Overview Page',
      type: 'page',
      bodyStorage: `
        <h2>Section 1</h2>
        <ac:structured-macro ac:name="list-children">
          <ac:parameter ac:name="page">section1-parent</ac:parameter>
        </ac:structured-macro>
        
        <h2>Section 2</h2>
        <ac:structured-macro ac:name="list-children">
          <ac:parameter ac:name="page">section2-parent</ac:parameter>
        </ac:structured-macro>
      `
    };

    const result = await transformer.transformWithEnhancements(page, context);

    // Should discover all child pages from both macros
    expect(result.discoveredPageIds).toHaveLength(3);
    expect(result.discoveredPageIds).toContain('section1-child1');
    expect(result.discoveredPageIds).toContain('section2-child1');
    expect(result.discoveredPageIds).toContain('section2-child2');
  });

  it('should not duplicate page IDs if same page is referenced multiple times', async () => {
    (mockApi.getChildPages as jest.Mock).mockResolvedValue({
      results: [
        { id: 'duplicate-child', title: 'Shared Child', type: 'page' }
      ],
      start: 0,
      limit: 50,
      size: 1
    });

    const page: Page = {
      id: 'duplicate-refs',
      title: 'Page with Duplicate References',
      type: 'page',
      bodyStorage: `
        <p>First reference:</p>
        <ac:structured-macro ac:name="list-children" />
        
        <p>Second reference to same parent:</p>
        <ac:structured-macro ac:name="list-children" />
      `
    };

    const result = await transformer.transformWithEnhancements(page, context);

    // Should only return unique page IDs
    expect(result.discoveredPageIds).toHaveLength(1);
    expect(result.discoveredPageIds).toContain('duplicate-child');
  });
});
