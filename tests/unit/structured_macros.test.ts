import { MarkdownTransformer, type TransformContext } from '../../src/transform/markdownTransformer.js';
import type { Page } from '../../src/models/entities.js';

describe('MarkdownTransformer - Structured Macros', () => {
  let transformer: MarkdownTransformer;
  let context: TransformContext;

  beforeEach(() => {
    transformer = new MarkdownTransformer();
    context = {
      currentPageId: 'test-page-id',
      spaceKey: 'TEST',
      baseUrl: 'https://confluence.example.com'
    };
  });

  describe('list-children macro', () => {
    it('should convert list-children macro to expansion placeholder', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: '<p><ac:structured-macro ac:name="list-children" ac:schema-version="1" ac:macro-id="f4455f7f-a505-4bde-90e9-29f09be5f9ce" /></p>'
      };

      const result = transformer.transform(page, context);
      expect(result.content).toMatch(/<!-- MACRO_EXPANSION:list-children:\d+:[\w.]+ -->/);
      expect(result.macroExpansions).toHaveLength(1);
      expect(result.macroExpansions[0].type).toBe('list-children');
      expect(result.macroExpansions[0].pageId).toBe('test-page-id');
    });
  });

  describe('contentbylabel macro', () => {
    it('should convert contentbylabel macro with parameters to expansion placeholder', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `<ac:structured-macro ac:name="contentbylabel">
          <ac:parameter ac:name="labels">documentation, api</ac:parameter>
        </ac:structured-macro>`
      };

      const result = transformer.transform(page, context);
      expect(result.content).toMatch(/<!-- MACRO_EXPANSION:contentbylabel:\d+:[\w.]+ -->/);
      expect(result.macroExpansions).toHaveLength(1);
      expect(result.macroExpansions[0].type).toBe('contentbylabel');
      expect(result.macroExpansions[0].parameters.labels).toBe('documentation, api');
    });

    it('should handle contentbylabel macro without parameters', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: '<ac:structured-macro ac:name="contentbylabel" />'
      };

      const result = transformer.transform(page, context);
      expect(result.content).toMatch(/<!-- MACRO_EXPANSION:contentbylabel:\d+:[\w.]+ -->/);
      expect(result.macroExpansions).toHaveLength(1);
    });
  });

  describe('code macro', () => {
    it('should convert code macro with language and title', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `<ac:structured-macro ac:name="code">
          <ac:parameter ac:name="language">javascript</ac:parameter>
          <ac:parameter ac:name="title">Example Function</ac:parameter>
          <ac:plain-text-body>function hello() {
  console.log('Hello, World!');
}</ac:plain-text-body>
        </ac:structured-macro>`
      };

      const result = transformer.transform(page, context);
      expect(result.content).toContain('**Example Function**');
      expect(result.content).toContain('```javascript');
      expect(result.content).toContain("function hello() {\n  console.log('Hello, World!');\n}");
      expect(result.content).toContain('```');
    });

    it('should convert code macro without title', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `<ac:structured-macro ac:name="code">
          <ac:parameter ac:name="language">python</ac:parameter>
          <ac:plain-text-body>print("Hello, Python!")</ac:plain-text-body>
        </ac:structured-macro>`
      };

      const result = transformer.transform(page, context);
      expect(result.content).toContain('```python');
      expect(result.content).toContain('print("Hello, Python!")');
      expect(result.content).not.toContain('**');
    });
  });

  describe('excerpt macro', () => {
    it('should extract content from excerpt macro', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `<ac:structured-macro ac:name="excerpt">
          <ac:rich-text-body>
            <p>This is an important excerpt that can be reused.</p>
          </ac:rich-text-body>
        </ac:structured-macro>`
      };

      const result = transformer.transform(page, context);
      expect(result.content).toContain('This is an important excerpt that can be reused.');
    });
  });

  describe('excerpt-include macro', () => {
    it('should convert excerpt-include to expansion placeholder', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `<ac:structured-macro ac:name="excerpt-include">
          <ac:parameter ac:name="pageTitle">API Documentation</ac:parameter>
        </ac:structured-macro>`
      };

      const result = transformer.transform(page, context);
      expect(result.content).toMatch(/<!-- MACRO_EXPANSION:excerpt-include:\d+:[\w.]+ -->/);
      expect(result.macroExpansions).toHaveLength(1);
      expect(result.macroExpansions[0].parameters.pageTitle).toBe('API Documentation');
    });

    it('should handle excerpt-include without page title', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: '<ac:structured-macro ac:name="excerpt-include" />'
      };

      const result = transformer.transform(page, context);
      expect(result.content).toMatch(/<!-- MACRO_EXPANSION:excerpt-include:\d+:[\w.]+ -->/);
    });
  });

  describe('parameter extraction', () => {
    it('should handle complex parameter values', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `<ac:structured-macro ac:name="contentbylabel">
          <ac:parameter ac:name="labels">tag1, tag2, "complex tag"</ac:parameter>
          <ac:parameter ac:name="spaces">SPACE1, SPACE2</ac:parameter>
        </ac:structured-macro>`
      };

      const result = transformer.transform(page, context);
      expect(result.content).toMatch(/<!-- MACRO_EXPANSION:contentbylabel:\d+:[\w.]+ -->/);
      expect(result.macroExpansions[0].parameters.labels).toBe('tag1, tag2, "complex tag"');
    });
  });

  describe('existing macro handling', () => {
    it('should still handle info, warning, and note macros', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: `
          <ac:structured-macro ac:name="info">
            <ac:rich-text-body><p>This is info content</p></ac:rich-text-body>
          </ac:structured-macro>
          <ac:structured-macro ac:name="warning">
            <ac:rich-text-body><p>This is warning content</p></ac:rich-text-body>
          </ac:structured-macro>
          <ac:structured-macro ac:name="note">
            <ac:rich-text-body><p>This is note content</p></ac:rich-text-body>
          </ac:structured-macro>
        `
      };

      const result = transformer.transform(page, context);
      expect(result.content).toContain('> **Info:** This is info content');
      expect(result.content).toContain('> **Warning:** This is warning content');
      expect(result.content).toContain('> **Note:** This is note content');
    });

    it('should convert unknown macros to comments', () => {
      const page: Page = {
        id: 'test-id',
        title: 'Test Page',
        type: 'page',
        bodyStorage: '<ac:structured-macro ac:name="unknown-macro">content</ac:structured-macro>'
      };

      const result = transformer.transform(page, context);
      expect(result.content).toContain('<!-- Confluence Macro: unknown-macro -->');
    });
  });
});
