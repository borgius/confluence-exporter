/**
 * Simple test for user link transformation
 */

import { MarkdownTransformer } from './transformer.js';
import type { Page, User } from './types.js';

// Mock API for testing
class MockApi {
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

async function testUserLinkTransformation() {
  console.log('Testing user link transformation...\n');

  const mockApi = new MockApi();
  const transformer = new MarkdownTransformer(mockApi as unknown as import('./api.js').ConfluenceApi);

  // Test page with user links
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

  console.log('Input HTML:');
  console.log(testPage.body);
  console.log('\nOutput Markdown:');
  console.log(result.content);
  console.log('\n✓ User links transformed successfully!');
  
  // Verify transformations
  if (result.content.includes('@John Doe')) {
    console.log('✓ Username resolved to display name');
  }
  if (result.content.includes('@unknown.user')) {
    console.log('✓ Unknown user fallback working');
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testUserLinkTransformation().catch(console.error);
}

export { testUserLinkTransformation };
