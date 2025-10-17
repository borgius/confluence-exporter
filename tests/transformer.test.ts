/**
 * Tests for MarkdownTransformer - User Link Transformation
 */

import { MarkdownTransformer } from '../src/transformer.js';
import type { Page, User } from '../src/types.js';
import type { ConfluenceApi } from '../src/api.js';

// Mock API for testing
class MockApi implements Partial<ConfluenceApi> {
  private users: Map<string, User> = new Map([
    ['john.doe', {
      userKey: 'ff8080817b0a1234',
      username: 'john.doe',
      displayName: 'John Doe',
      email: 'john.doe@example.com'
    }],
    ['key:ff8080817b0a1234', {
      userKey: 'ff8080817b0a1234',
      username: 'john.doe',
      displayName: 'John Doe',
      email: 'john.doe@example.com'
    }]
  ]);

  async getUserByUsername(username: string): Promise<User | null> {
    return this.users.get(username) || null;
  }

  async getUserByKey(userKey: string): Promise<User | null> {
    return this.users.get(`key:${userKey}`) || null;
  }
}

describe('MarkdownTransformer', () => {
  let transformer: MarkdownTransformer;
  let mockApi: MockApi;

  beforeEach(() => {
    mockApi = new MockApi();
    transformer = new MarkdownTransformer(mockApi as unknown as ConfluenceApi);
  });

  describe('User Link Transformation', () => {
    it('should transform user links by username to display names', async () => {
      const testPage: Page = {
        id: '12345',
        title: 'Test Page',
        body: `<p>Hello <ac:link><ri:user ri:username="john.doe"/></ac:link>, welcome!</p>`
      };

      const result = await transformer.transform(testPage);

      expect(result.content).toContain('@John Doe');
    });

    it('should transform user links by userkey to display names', async () => {
      const testPage: Page = {
        id: '12345',
        title: 'Test Page',
        body: `<p>User by key: <ac:link><ri:user ri:userkey="ff8080817b0a1234"/></ac:link></p>`
      };

      const result = await transformer.transform(testPage);

      expect(result.content).toContain('@John Doe');
    });

    it('should handle unknown users gracefully', async () => {
      const testPage: Page = {
        id: '12345',
        title: 'Test Page',
        body: `<p>Unknown user: <ac:link><ri:user ri:username="unknown.user"/></ac:link></p>`
      };

      const result = await transformer.transform(testPage);

      expect(result.content).toContain('@unknown.user');
    });

    it('should transform multiple user links in one page', async () => {
      const testPage: Page = {
        id: '12345',
        title: 'Test Page',
        body: `
          <p>Hello <ac:link><ri:user ri:username="john.doe"/></ac:link>, welcome!</p>
          <p>User by key: <ac:link><ri:user ri:userkey="ff8080817b0a1234"/></ac:link></p>
          <p>Unknown user: <ac:link><ri:user ri:username="unknown.user"/></ac:link></p>
        `
      };

      const result = await transformer.transform(testPage);

      // Should have two instances of John Doe (username and userkey)
      const johnDoeMatches = result.content.match(/@John Doe/g);
      expect(johnDoeMatches).toHaveLength(2);
      
      // Should have one unknown user
      expect(result.content).toContain('@unknown.user');
    });
  });

  describe('Markdown Conversion', () => {
    it('should convert basic HTML to Markdown', async () => {
      const testPage: Page = {
        id: '12345',
        title: 'Test Page',
        body: `
          <h1>Main Title</h1>
          <p>This is a <strong>bold</strong> and <em>italic</em> text.</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        `
      };

      const result = await transformer.transform(testPage);

      expect(result.content).toContain('# Main Title');
      expect(result.content).toContain('**bold**');
      expect(result.content).toContain('*italic*');
      expect(result.content).toContain('- Item 1');
      expect(result.content).toContain('- Item 2');
    });

    it('should clean up malformed markdown patterns', async () => {
      const testPage: Page = {
        id: '12345',
        title: 'Test Page',
        body: `
          <h2><strong><br /></strong></h2>
          <p>Some content</p>
        `
      };

      const result = await transformer.transform(testPage);

      // Should not contain the malformed header pattern
      expect(result.content).not.toContain('## **');
      expect(result.content).toContain('Some content');
    });
  });

  describe('Front Matter', () => {
    it('should include correct front matter metadata', async () => {
      const testPage: Page = {
        id: '12345',
        title: 'Test Page',
        body: '<p>Content</p>',
        version: 5,
        parentId: '67890'
      };

      const result = await transformer.transform(testPage);

      expect(result.frontMatter.title).toBe('Test Page');
      expect(result.frontMatter.id).toBe('12345');
      expect(result.frontMatter.version).toBe(5);
      expect(result.frontMatter.parentId).toBe('67890');
    });
  });
});
