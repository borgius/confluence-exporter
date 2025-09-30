import { LinkRewriter, type LinkMap } from '../../src/transform/linkRewriter';
import type { LinkExtraction } from '../../src/transform/markdownTransformer';

describe('Unit: link rewrite map', () => {
  describe('LinkRewriter', () => {
    const linkMap: LinkMap = {
      '12345': 'introduction.md',
      '67890': 'getting-started/setup.md',
      '11111': 'advanced/configuration.md',
      'current-page': 'current-page.md',
      'getting-started/setup': 'getting-started/setup.md'
    };

    const baseUrl = 'https://test.atlassian.net';
    const rewriter = new LinkRewriter(linkMap, baseUrl);

    it('builds mapping from page IDs to relative markdown paths', () => {
      expect(linkMap['12345']).toBe('introduction.md');
      expect(linkMap['67890']).toBe('getting-started/setup.md');
      expect(linkMap['11111']).toBe('advanced/configuration.md');
    });

    it('rewrites internal links to relative paths', () => {
      const content = '[See introduction](https://test.atlassian.net/pages/viewpage.action?pageId=12345)';
      const links: LinkExtraction[] = [
        {
          originalHref: 'https://test.atlassian.net/pages/viewpage.action?pageId=12345',
          isInternal: true,
          pageId: '12345'
        }
      ];

      const result = rewriter.rewriteLinks(content, links, 'current-page');
      
      expect(result.content).toBe('[See introduction](introduction.md)');
      expect(result.deferredLinks).toHaveLength(0);
    });

    it('handles links to non-exported pages by deferring them', () => {
      const content = '[External page](https://test.atlassian.net/pages/viewpage.action?pageId=99999)';
      const links: LinkExtraction[] = [
        {
          originalHref: 'https://test.atlassian.net/pages/viewpage.action?pageId=99999',
          isInternal: true,
          pageId: '99999'
        }
      ];

      const result = rewriter.rewriteLinks(content, links, 'current-page');
      
      expect(result.content).toBe(content); // Should remain unchanged
      expect(result.deferredLinks).toHaveLength(1);
      expect(result.deferredLinks[0]).toMatchObject({
        targetPageId: '99999',
        sourcePageId: 'current-page'
      });
    });

    it('handles relative path calculation for nested directories', () => {
      const content = '[Configuration](https://test.atlassian.net/pages/viewpage.action?pageId=11111)';
      const links: LinkExtraction[] = [
        {
          originalHref: 'https://test.atlassian.net/pages/viewpage.action?pageId=11111',
          isInternal: true,
          pageId: '11111'
        }
      ];

      const result = rewriter.rewriteLinks(content, links, 'getting-started/setup');
      
      // Should calculate relative path from getting-started/ to advanced/
      expect(result.content).toContain('../advanced/configuration.md');
    });

    it('preserves external links unchanged', () => {
      const content = '[Google](https://google.com)';
      const links: LinkExtraction[] = [
        {
          originalHref: 'https://google.com',
          isInternal: false
        }
      ];

      const result = rewriter.rewriteLinks(content, links, 'current-page');
      
      expect(result.content).toBe('[Google](https://google.com)');
      expect(result.deferredLinks).toHaveLength(0);
    });

    it('handles links with anchors', () => {
      const content = '[Section](https://test.atlassian.net/pages/viewpage.action?pageId=12345#section)';
      const links: LinkExtraction[] = [
        {
          originalHref: 'https://test.atlassian.net/pages/viewpage.action?pageId=12345#section',
          isInternal: true,
          pageId: '12345',
          anchor: 'section'
        }
      ];

      const result = rewriter.rewriteLinks(content, links, 'current-page');
      
      expect(result.content).toBe('[Section](introduction.md#section)');
      expect(result.deferredLinks).toHaveLength(0);
    });

    it('handles multiple links in same content', () => {
      const content = 'See [intro](https://test.atlassian.net/pages/viewpage.action?pageId=12345) and [setup](https://test.atlassian.net/pages/viewpage.action?pageId=67890).';
      const links: LinkExtraction[] = [
        {
          originalHref: 'https://test.atlassian.net/pages/viewpage.action?pageId=12345',
          isInternal: true,
          pageId: '12345'
        },
        {
          originalHref: 'https://test.atlassian.net/pages/viewpage.action?pageId=67890',
          isInternal: true,
          pageId: '67890'
        }
      ];

      const result = rewriter.rewriteLinks(content, links, 'current-page');
      
      expect(result.content).toBe('See [intro](introduction.md) and [setup](getting-started/setup.md).');
      expect(result.deferredLinks).toHaveLength(0);
    });
  });
});
