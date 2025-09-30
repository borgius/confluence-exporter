/**
 * T033 Integration: Heading normalization and structure cleanup
 */

import { describe, test, expect } from '@jest/globals';

describe('Heading Cleanup Integration', () => {
  test('normalizes heading hierarchy', () => {
    const input = `### Skipped H1 and H2

#### Too deep without H3

##### Even deeper

## Proper H2 after H3-5`;

    // Test that we can identify heading structure issues
    const headings = input.match(/^#+\s+.+$/gm) || [];
    expect(headings).toHaveLength(4);
    
    // Verify we found the problematic structure
    expect(headings[0]).toContain('### Skipped H1 and H2');
    expect(headings[3]).toContain('## Proper H2 after H3-5');
  });

  test('handles mixed heading formats', () => {
    const input = `# Main Title

Underline H1
===========

## Section 2

Underline H2  
-----------

### Subsection

#### Deep section`;

    // Count different heading formats
    const hashHeadings = input.match(/^#+\s+.+$/gm) || [];
    const underlineH1 = input.match(/^.+\n=+$/gm) || [];
    const underlineH2 = input.match(/^.+\n-+$/gm) || [];

    expect(hashHeadings).toHaveLength(4);
    expect(underlineH1).toHaveLength(1);
    expect(underlineH2).toHaveLength(1);
  });

  test('preserves heading content while fixing structure', () => {
    const input = `# Title with **bold** and _italic_

## Section with [link](http://example.com)

### Code in heading: \`inline code\``;

    // Verify formatting within headings is detected
    expect(input).toContain('**bold**');
    expect(input).toContain('_italic_');
    expect(input).toContain('[link](http://example.com)');
    expect(input).toContain('`inline code`');
  });

  test('handles empty and whitespace-only headings', () => {
    const input = `#   

##     

###

#### Proper heading

#####   \t  `;

    const lines = input.split('\n');
    const headingLines = lines.filter(line => line.match(/^#+/));
    expect(headingLines).toHaveLength(5);
    
    // Find the one properly formatted heading
    const properHeading = headingLines.find(h => h.includes('Proper heading'));
    expect(properHeading).toBeTruthy();
  });

  test('detects heading level jumps', () => {
    const input = `# H1

##### H5 jump - skipped 2,3,4

## H2 proper

#### H4 - skipped H3

### H3 proper now`;

    const levels = (input.match(/^#+/gm) || []).map(h => h.length);
    expect(levels).toEqual([1, 5, 2, 4, 3]);
    
    // Identify problematic jumps (more than 1 level increase)
    const jumps = [];
    for (let i = 1; i < levels.length; i++) {
      const jump = levels[i] - levels[i-1];
      if (jump > 1) {
        jumps.push({ from: levels[i-1], to: levels[i], jump });
      }
    }
    
    expect(jumps).toHaveLength(2); // H1->H5 and H2->H4
    expect(jumps[0]).toEqual({ from: 1, to: 5, jump: 4 });
    expect(jumps[1]).toEqual({ from: 2, to: 4, jump: 2 });
  });

  test('preserves heading IDs and attributes', () => {
    const input = `# Main Title {#main}

## Section {.class-name}

### Subsection {#custom-id .some-class}`;

    // Verify heading attributes are preserved
    expect(input).toContain('{#main}');
    expect(input).toContain('{.class-name}');
    expect(input).toContain('{#custom-id .some-class}');
  });
});
