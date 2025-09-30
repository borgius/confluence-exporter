/**
 * T031 Integration: Cleanup performance validation (<1s target per file)
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createCleanupService } from '../../src/cleanup/cleanupService';

describe('Cleanup Performance Integration', () => {
  let tempDir: string;
  let cleanupService: ReturnType<typeof createCleanupService>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(__dirname, 'temp-perf-'));
    cleanupService = createCleanupService();
  });

  afterEach(async () => {
    await fs.rmdir(tempDir, { recursive: true });
  });

  test('processes small document under 100ms', async () => {
    const smallContent = `# Small Document

This is a simple markdown document with basic content.

- List item 1
- List item 2

Some text with "quotes" and basic formatting.`;

    const config = {
      enabled: true,
      intensity: 'medium' as const,
      rules: [],
      lineLength: 92,
      locale: 'en-us',
      preserveFormatting: false
    };

    const startTime = performance.now();
    const result = await cleanupService.process({
      content: smallContent,
      filePath: 'test-small.md',
      metadata: {
        language: 'en-us',
        frontmatter: false,
        hasMath: false,
        hasCode: false,
        wordCount: 20,
        lineCount: 8
      },
      preservedSections: []
    }, config);
    const endTime = performance.now();

    expect(result.success).toBe(true);
    expect(endTime - startTime).toBeLessThan(100);
  });

  test('processes medium document under 500ms', async () => {
    // Generate medium-sized document (~1000 words)
    const sections = Array.from({ length: 10 }, (_, i) => `
## Section ${i + 1}

This is section ${i + 1} with some content. Lorem ipsum dolor sit amet, 
consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et 
dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.

\`\`\`javascript
function example${i}() {
  return "code block example";
}
\`\`\`

- Bullet point 1
- Bullet point 2  
- Bullet point 3

Text with "smart quotes" and -- dashes that need cleanup.`);

    const mediumContent = `# Medium Document\n${sections.join('\n')}`;

    const config = {
      enabled: true,
      intensity: 'medium' as const,
      rules: [],
      lineLength: 92,
      locale: 'en-us',
      preserveFormatting: false
    };

    const startTime = performance.now();
    const result = await cleanupService.process({
      content: mediumContent,
      filePath: 'test-medium.md',
      metadata: {
        language: 'en-us',
        frontmatter: false,
        hasMath: false,
        hasCode: true,
        wordCount: 1000,
        lineCount: 60
      },
      preservedSections: []
    }, config);
    const endTime = performance.now();

    expect(result.success).toBe(true);
    expect(endTime - startTime).toBeLessThan(500);
  });

  test('processes large document under 1000ms target', async () => {
    // Generate large document (~5000 words)
    const sections = Array.from({ length: 50 }, (_, i) => `
## Section ${i + 1}

This is section ${i + 1} with extensive content. Lorem ipsum dolor sit amet, 
consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et 
dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation 
ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore 
eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, 
sunt in culpa qui officia deserunt mollit anim id est laborum.

\`\`\`python
def complex_function_${i}(param1, param2):
    """Complex function with documentation."""
    result = param1 * param2
    return result + ${i}
\`\`\`

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data ${i}A | Data ${i}B | Data ${i}C |
| Value 1  | Value 2  | Value 3  |

- Complex bullet point with "quoted text" and -- em dashes
- Another point with *emphasis* and **bold** formatting
- Third point with [link text](http://example.com) references`);

    const largeContent = `# Large Document\n${sections.join('\n')}`;

    const config = {
      enabled: true,
      intensity: 'heavy' as const,
      rules: [],
      lineLength: 92,
      locale: 'en-us',
      preserveFormatting: false
    };

    const startTime = performance.now();
    const result = await cleanupService.process({
      content: largeContent,
      filePath: 'test-large.md',
      metadata: {
        language: 'en-us',
        frontmatter: false,
        hasMath: false,
        hasCode: true,
        wordCount: 5000,
        lineCount: 300
      },
      preservedSections: []
    }, config);
    const endTime = performance.now();

    expect(result.success).toBe(true);
    expect(endTime - startTime).toBeLessThan(1000); // 1s target
  });

  test('maintains performance across multiple documents', async () => {
    const config = {
      enabled: true,
      intensity: 'light' as const,
      rules: [],
      lineLength: 92,
      locale: 'en-us',
      preserveFormatting: false
    };

    const documents = Array.from({ length: 10 }, (_, i) => ({
      content: `# Document ${i}\n\nContent with "quotes" and -- dashes.\n\n- List item\n- Another item`,
      filePath: `test-${i}.md`,
      metadata: {
        language: 'en-us',
        frontmatter: false,
        hasMath: false,
        hasCode: false,
        wordCount: 15,
        lineCount: 6
      },
      preservedSections: []
    }));

    const startTime = performance.now();
    
    for (const doc of documents) {
      const result = await cleanupService.process(doc, config);
      expect(result.success).toBe(true);
    }
    
    const endTime = performance.now();
    const averageTime = (endTime - startTime) / documents.length;

    expect(averageTime).toBeLessThan(50); // 50ms average per small document
  });

  test('performance degrades gracefully with complex content', async () => {
    // Document with many preserved sections that require careful processing
    const complexContent = `# Complex Document

\`\`\`javascript
// This code block should be preserved exactly
function complex() {
  const data = "quotes and -- dashes in code";
  return data;
}
\`\`\`

$$
\\text{Math blocks should be preserved: } E = mc^2
$$

<div class="custom-html">
  Raw HTML with "quotes" and -- formatting
</div>

Regular text with "smart quotes" and -- em dashes that should be cleaned up.

\`\`\`python
# Another code block
def another_function():
    return "more -- content -- here"
\`\`\`

More text that needs cleanup but code blocks and math should remain untouched.`;

    const config = {
      enabled: true,
      intensity: 'heavy' as const,
      rules: [],
      lineLength: 92,
      locale: 'en-us',
      preserveFormatting: false
    };

    const startTime = performance.now();
    const result = await cleanupService.process({
      content: complexContent,
      filePath: 'test-complex.md',
      metadata: {
        language: 'en-us',
        frontmatter: false,
        hasMath: true,
        hasCode: true,
        wordCount: 100,
        lineCount: 25
      },
      preservedSections: []
    }, config);
    const endTime = performance.now();

    expect(result.success).toBe(true);
    expect(endTime - startTime).toBeLessThan(200); // Reasonable time for complex content
  });
});
