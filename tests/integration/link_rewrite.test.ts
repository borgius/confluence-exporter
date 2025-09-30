import { LinkRewriter } from '../../src/transform/linkRewriter';
import { MarkdownTransformer, type TransformContext } from '../../src/transform/markdownTransformer';
import type { Page } from '../../src/models/entities';

describe('Integration: link rewrite', () => {
  it('rewrites internal links to new relative paths in full export scenario', async () => {
    // Create mock pages with hierarchical structure
    const pages: Page[] = [
      {
        id: 'page1',
        title: 'Introduction',
        type: 'page',
        slug: 'introduction',
        path: 'introduction.md',
        bodyStorage: '<p>Welcome! See <a href="https://confluence.test.com/pages/viewpage.action?pageId=page2">Getting Started</a> for setup.</p>',
        version: 1,
        ancestors: []
      },
      {
        id: 'page2',
        title: 'Getting Started',
        type: 'page',
        slug: 'getting-started',
        path: 'guides/getting-started.md',
        bodyStorage: '<p>First read the <a href="https://confluence.test.com/pages/viewpage.action?pageId=page1">Introduction</a>.</p>',
        version: 1,
        ancestors: []
      }
    ];

    // Build link map from pages
    const linkMap = {
      'page1': 'introduction.md',
      'page2': 'guides/getting-started.md'
    };

    const transformer = new MarkdownTransformer();
    const linkRewriter = new LinkRewriter(linkMap, 'https://confluence.test.com');

    const context: TransformContext = {
      currentPageId: 'page1',
      spaceKey: 'TEST',
      baseUrl: 'https://confluence.test.com'
    };

    // Transform page1 content to markdown and extract links
    const page1Result = transformer.transform(pages[0], context);
    
    // Rewrite links in the transformed content
    const rewriteResult = linkRewriter.rewriteLinks(
      page1Result.content,
      page1Result.links,
      'page1'
    );

    // Verify the link was rewritten correctly
    expect(rewriteResult.content).toContain('[Getting Started](guides/getting-started.md)');
    expect(rewriteResult.content).not.toContain('confluence.test.com');
    expect(rewriteResult.deferredLinks).toHaveLength(0);

    // Test bidirectional linking - transform page2
    const page2Context: TransformContext = {
      currentPageId: 'page2',
      spaceKey: 'TEST',
      baseUrl: 'https://confluence.test.com'
    };
    
    const page2Result = transformer.transform(pages[1], page2Context);
    const page2RewriteResult = linkRewriter.rewriteLinks(
      page2Result.content,
      page2Result.links,
      'page2'
    );

    // From guides/ directory, should reference introduction.md with relative path
    expect(page2RewriteResult.content).toContain('[Introduction](../introduction.md)');
    expect(page2RewriteResult.deferredLinks).toHaveLength(0);
  });

  it('handles complex content with multiple link types', async () => {
    const linkMap = {
      'current': 'current-page.md',
      'intro': 'introduction.md',
      'guide': 'guides/setup.md',
      'advanced': 'advanced/configuration.md'
    };

    const transformer = new MarkdownTransformer();
    const linkRewriter = new LinkRewriter(linkMap, 'https://confluence.test.com');

    // Complex page with multiple link types
    const complexPage: Page = {
      id: 'current',
      title: 'Complex Page',
      type: 'page',
      slug: 'complex-page', 
      path: 'current-page.md',
      bodyStorage: `
        <p>Links: 
          <a href="https://confluence.test.com/pages/viewpage.action?pageId=intro">Introduction</a>,
          <a href="https://confluence.test.com/pages/viewpage.action?pageId=guide">Setup Guide</a>,
          <a href="https://confluence.test.com/pages/viewpage.action?pageId=advanced#config">Advanced Config</a>,
          <a href="https://external.com">External Link</a>
        </p>`,
      version: 1,
      ancestors: []
    };

    const context: TransformContext = {
      currentPageId: 'current',
      spaceKey: 'TEST',
      baseUrl: 'https://confluence.test.com'
    };

    const result = transformer.transform(complexPage, context);
    const rewriteResult = linkRewriter.rewriteLinks(result.content, result.links, 'current');

    // Check all internal links were rewritten
    expect(rewriteResult.content).toContain('[Introduction](introduction.md)');
    expect(rewriteResult.content).toContain('[Setup Guide](guides/setup.md)');
    expect(rewriteResult.content).toContain('[Advanced Config](advanced/configuration.md#config)');
    
    // External link should remain unchanged
    expect(rewriteResult.content).toContain('[External Link](https://external.com)');
    
    // No confluence URLs should remain
    expect(rewriteResult.content).not.toContain('confluence.test.com');
    expect(rewriteResult.deferredLinks).toHaveLength(0);
  });

  it('handles deferred links for pages not in export scope', async () => {
    const limitedLinkMap = {
      'current': 'current-page.md',
      'page1': 'page1.md'
    };

    const transformer = new MarkdownTransformer();
    const linkRewriter = new LinkRewriter(limitedLinkMap, 'https://confluence.test.com');

    const pageWithMissingLinks: Page = {
      id: 'current',
      title: 'Page with Missing Links',
      type: 'page',
      slug: 'missing-links',
      path: 'current-page.md',
      bodyStorage: `
        <p>
          <a href="https://confluence.test.com/pages/viewpage.action?pageId=page1">Available Page</a>
          <a href="https://confluence.test.com/pages/viewpage.action?pageId=missing">Missing Page</a>
        </p>`,
      version: 1,
      ancestors: []
    };

    const context: TransformContext = {
      currentPageId: 'current',
      spaceKey: 'TEST',
      baseUrl: 'https://confluence.test.com'
    };

    const result = transformer.transform(pageWithMissingLinks, context);
    const rewriteResult = linkRewriter.rewriteLinks(result.content, result.links, 'current');

    // Available page should be rewritten
    expect(rewriteResult.content).toContain('[Available Page](page1.md)');
    
    // Missing page should remain unchanged
    expect(rewriteResult.content).toContain('pageId=missing');
    
    // Should have one deferred link
    expect(rewriteResult.deferredLinks).toHaveLength(1);
    expect(rewriteResult.deferredLinks[0]).toMatchObject({
      sourcePageId: 'current',
      targetPageId: 'missing',
      deferred: true
    });
  });
});
