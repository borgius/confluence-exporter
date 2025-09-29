import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { MarkdownTransformer, type TransformContext } from '../../src/transform/markdownTransformer.js';
import type { Page } from '../../src/models/entities.js';

describe('Unit: markdown transformer basic constructs', () => {
  let transformer: MarkdownTransformer;
  let fixtures: Page[];
  
  beforeAll(() => {
    transformer = new MarkdownTransformer();
    fixtures = loadTestFixtures();
  });

  describe('fixture validation', () => {
    it('should load HTML fixtures successfully', () => {
      expect(fixtures).toBeDefined();
      expect(fixtures.length).toBeGreaterThan(0);
      expect(fixtures.length).toBeLessThanOrEqual(10);
    });

    it('should have valid page structure in fixtures', () => {
      fixtures.forEach((page, _index) => {
        expect(page.id).toBeDefined();
        expect(page.title).toBeDefined();
        expect(page.bodyStorage).toBeDefined();
        expect(typeof page.bodyStorage).toBe('string');
        // Some pages might have minimal content, so just check it's defined
        expect(page.bodyStorage).not.toBeNull();
      });
    });
  });

  describe('heading transformations', () => {
    it('should transform h1-h6 tags to markdown headers', () => {
      const htmlWithHeadings = `
        <h1>Main Title</h1>
        <h2>Section Title</h2>
        <h3>Subsection</h3>
        <h4>Sub-subsection</h4>
        <h5>Minor heading</h5>
        <h6>Smallest heading</h6>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithHeadings
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('# Main Title');
      expect(result.content).toContain('## Section Title');
      expect(result.content).toContain('### Subsection');
      expect(result.content).toContain('#### Sub-subsection');
      expect(result.content).toContain('##### Minor heading');
      expect(result.content).toContain('###### Smallest heading');
    });
  });

  describe('basic formatting transformations', () => {
    it('should transform bold, italic, and other basic formatting', () => {
      const htmlWithFormatting = `
        <p><strong>Bold text</strong> and <b>also bold</b></p>
        <p><em>Italic text</em> and <i>also italic</i></p>
        <p><u>Underlined text</u></p>
        <p><s>Strikethrough</s> and <del>deleted text</del></p>
        <p>Regular paragraph</p>
        <br>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithFormatting
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('**Bold text**');
      expect(result.content).toContain('**also bold**');
      expect(result.content).toContain('*Italic text*');
      expect(result.content).toContain('*also italic*');
      expect(result.content).toContain('*Underlined text*');
      expect(result.content).toContain('~~Strikethrough~~');
      expect(result.content).toContain('~~deleted text~~');
      expect(result.content).toContain('Regular paragraph');
    });
  });

  describe('list transformations', () => {
    it('should transform unordered lists', () => {
      const htmlWithUList = `
        <ul>
          <li>First item</li>
          <li>Second item</li>
          <li>Third item</li>
        </ul>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithUList
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('- First item');
      expect(result.content).toContain('- Second item');
      expect(result.content).toContain('- Third item');
    });

    it('should transform ordered lists', () => {
      const htmlWithOList = `
        <ol>
          <li>First step</li>
          <li>Second step</li>
          <li>Third step</li>
        </ol>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithOList
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('1. First step');
      expect(result.content).toContain('2. Second step');
      expect(result.content).toContain('3. Third step');
    });
  });

  describe('code block transformations', () => {
    it('should transform code blocks with language', () => {
      const htmlWithCode = `
        <ac:structured-macro ac:name="code">
          <ac:parameter ac:name="language">javascript</ac:parameter>
          <ac:plain-text-body><![CDATA[
function hello() {
  console.log('Hello, world!');
}
          ]]></ac:plain-text-body>
        </ac:structured-macro>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithCode
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('```javascript');
      expect(result.content).toContain('function hello()');
      expect(result.content).toContain("console.log('Hello, world!');");
      expect(result.content).toContain('```');
    });

    it('should transform inline code', () => {
      const htmlWithInlineCode = `
        <p>Use <code>console.log()</code> to debug your code.</p>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithInlineCode
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('Use `console.log()` to debug');
    });
  });

  describe('table transformations', () => {
    it('should transform tables to markdown format', () => {
      const htmlWithTable = `
        <table>
          <tr>
            <th>Header 1</th>
            <th>Header 2</th>
          </tr>
          <tr>
            <td>Cell 1</td>
            <td>Cell 2</td>
          </tr>
          <tr>
            <td>Cell 3</td>
            <td>Cell 4</td>
          </tr>
        </table>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithTable
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('| Header 1 | Header 2 |');
      expect(result.content).toContain('| --- | --- |');
      expect(result.content).toContain('| Cell 1 | Cell 2 |');
      expect(result.content).toContain('| Cell 3 | Cell 4 |');
    });
  });

  describe('confluence macro transformations', () => {
    it('should transform info macros to blockquotes', () => {
      const htmlWithInfoMacro = `
        <ac:structured-macro ac:name="info">
          <ac:rich-text-body>
            <p>This is important information.</p>
          </ac:rich-text-body>
        </ac:structured-macro>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithInfoMacro
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('> **Info:**');
      expect(result.content).toContain('This is important information');
    });

    it('should transform warning macros to blockquotes', () => {
      const htmlWithWarningMacro = `
        <ac:structured-macro ac:name="warning">
          <ac:rich-text-body>
            <p>Be careful with this operation!</p>
          </ac:rich-text-body>
        </ac:structured-macro>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithWarningMacro
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('> **Warning:**');
      expect(result.content).toContain('Be careful with this operation');
    });
  });

  describe('link transformations', () => {
    it('should preserve links and extract link information', () => {
      const htmlWithLinks = `
        <p>Visit <a href="https://example.com">our website</a> for more info.</p>
        <p>See also <a href="/internal-page">this internal page</a>.</p>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithLinks
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('[our website](https://example.com)');
      expect(result.content).toContain('[this internal page](/internal-page)');
      expect(result.links).toHaveLength(2);
      expect(result.links[0].originalHref).toBe('https://example.com');
      expect(result.links[0].isInternal).toBe(false);
      expect(result.links[1].originalHref).toBe('/internal-page');
      expect(result.links[1].isInternal).toBe(true);
    });
  });

  describe('user link transformations', () => {
    it('should transform user links and extract user information', () => {
      const htmlWithUserLinks = `
        <p>Contact the team lead <ac:link><ri:user ri:userkey="ff8080817a854a2c017a9b5dc5490034" /></ac:link> for more info.</p>
        <p>Also reach out to <ac:link><ri:user ri:userkey="ff808081758e360e0175d1951c860088" /></ac:link> if needed.</p>
      `;
      
      const mockPage: Page = {
        id: 'test',
        title: 'Test Page',
        type: 'page',
        bodyStorage: htmlWithUserLinks
      };
      
      const context: TransformContext = {
        currentPageId: 'test',
        spaceKey: 'TEST',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.content).toContain('[@user:c5490034](https://test.com/display/~c5490034)');
      expect(result.content).toContain('[@user:1c860088](https://test.com/display/~1c860088)');
      expect(result.users).toHaveLength(2);
      expect(result.users[0].userKey).toBe('ff8080817a854a2c017a9b5dc5490034');
      expect(result.users[1].userKey).toBe('ff808081758e360e0175d1951c860088');
    });
  });

  describe('front matter generation', () => {
    it('should generate proper front matter for pages', () => {
      const mockPage: Page = {
        id: 'test123',
        title: 'Test Page Title',
        type: 'page',
        version: 42,
        parentId: 'parent123',
        bodyStorage: '<p>Simple content</p>'
      };
      
      const context: TransformContext = {
        currentPageId: 'test123',
        spaceKey: 'TESTSPACE',
        baseUrl: 'https://test.com'
      };
      
      const result = transformer.transform(mockPage, context);
      
      expect(result.frontMatter.id).toBe('test123');
      expect(result.frontMatter.title).toBe('Test Page Title');
      expect(result.frontMatter.type).toBe('page');
      expect(result.frontMatter.version).toBe(42);
      expect(result.frontMatter.parentId).toBe('parent123');
      expect(result.frontMatter.url).toContain('test123');
      expect(result.frontMatter.url).toContain('TESTSPACE');
    });
  });

  describe('integration tests with real fixtures', () => {
    it('should transform all fixture pages without errors', () => {
      const context: TransformContext = {
        currentPageId: 'fixture',
        spaceKey: 'PR000299',
        baseUrl: 'https://confluence.fmr.com'
      };

      fixtures.forEach((page, index) => {
        expect(() => {
          const result = transformer.transform(page, context);
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          expect(result.frontMatter).toBeDefined();
          expect(result.links).toBeDefined();
          expect(result.attachments).toBeDefined();
          expect(result.users).toBeDefined();
        }).not.toThrow(`Failed to transform fixture ${index + 1}: ${page.title}`);
      });
    });

    it('should produce meaningful markdown output for fixture pages', () => {
      const context: TransformContext = {
        currentPageId: 'fixture',
        spaceKey: 'PR000299',
        baseUrl: 'https://confluence.fmr.com'
      };

      // Only test fixtures that have substantial content
      const significantFixtures = fixtures.filter(page => 
        page.bodyStorage && page.bodyStorage.length > 50
      );

      expect(significantFixtures.length).toBeGreaterThan(0);

      significantFixtures.slice(0, 3).forEach((page, _index) => {
        const result = transformer.transform(page, context);
        
        // Basic content validation
        expect(result.content.length).toBeGreaterThan(10);
        expect(result.content).not.toContain('<ac:structured-macro');
        expect(result.content).not.toContain('<ac:layout>');
        
        // Front matter validation
        expect(result.frontMatter.id).toBe(page.id);
        expect(result.frontMatter.title).toBe(page.title);
        
        // Should have some recognizable markdown features if content is substantial
        if (result.content.length > 50) {
          const hasMarkdownFeatures = 
            result.content.includes('#') || 
            result.content.includes('**') || 
            result.content.includes('*') ||
            result.content.includes('-') ||
            result.content.includes('|') ||
            result.content.includes('[') ||
            result.content.includes('`');
            
          expect(hasMarkdownFeatures).toBe(true);
        }
      });
    });
  });
});

function loadTestFixtures(): Page[] {
  const fixturesDir = join(__dirname, '..', 'fixtures', 'html');
  const fixtures: Page[] = [];
  
  try {
    const fixtureFiles = readdirSync(fixturesDir)
      .filter(file => file.endsWith('.json'))
      .sort();
    
    for (const file of fixtureFiles) {
      const filePath = join(fixturesDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const page = JSON.parse(content) as Page;
      fixtures.push(page);
    }
  } catch (error) {
    console.warn('Failed to load test fixtures:', error);
  }
  
  return fixtures;
}
