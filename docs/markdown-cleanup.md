# Markdown Cleanup

## Overview

The Confluence to Markdown exporter includes a **Markdown Cleanup** step that runs after HTML-to-Markdown conversion but before Prettier formatting. This step removes malformed markdown patterns that can result from the conversion process.

## Problem

During HTML to Markdown conversion, certain HTML patterns can produce invalid or meaningless markdown. For example:

### Example 1: Empty Headers with Bold Markers

**HTML Input:**
```html
<h2>
  <strong><br /></strong>
</h2>
```

**Naive Markdown Output:**
```markdown
## **

**
```

This produces a header with no content, which is meaningless in markdown.

### Example 2: Empty Bold Markers

**HTML Input:**
```html
<p>Some text <strong>   </strong> more text</p>
```

**Naive Markdown Output:**
```markdown
Some text **   ** more text
```

Bold markers with only whitespace serve no purpose.

## Solution

The `MarkdownCleaner` class provides a multi-pass cleanup process:

1. **First Pass**: Remove Confluence-specific patterns
   - Standalone bold/italic markers across multiple lines
   - Bold/italic markers around only whitespace
   - Empty headers, blockquotes, code blocks

2. **Second Pass**: General markdown cleanup
   - Empty headers with formatting markers
   - Empty bold/italic markers
   - Empty links and list items
   - Excessive blank lines
   - Trailing whitespace

3. **Third Pass**: Another Confluence pattern cleanup to catch any new issues

4. **Final Pass**: Whitespace normalization

## Usage

The cleaner is automatically integrated into the transformation pipeline:

```typescript
import { MarkdownTransformer } from './transformer.js';
import { MarkdownCleaner } from './cleaner.js';

const transformer = new MarkdownTransformer(api);
const result = await transformer.transform(page);
// Markdown is automatically cleaned during transformation
```

The cleaner is applied at the end of the `htmlToMarkdown()` method in `MarkdownTransformer`.

## Patterns Cleaned

### Empty Headers
- `## **` → removed
- `## *` → removed
- `##` (empty header) → removed
- `## **\n\n**` → removed

### Empty Formatting
- `** **` (empty bold) → removed
- `* *` (empty italic) → removed
- `**   **` (bold with only spaces) → ` ` (spaces preserved)
- Lines containing only `**` → removed

### Empty Structures
- `[]()` (empty links) → removed
- `-  ` (empty list items) → removed
- `>  ` (empty blockquotes) → removed
- ` ``` \n ``` ` (empty code blocks) → removed

### Whitespace
- Trailing spaces/tabs on lines → removed
- More than 3 consecutive newlines → normalized to 3
- File ends with single newline

## Testing

Run the cleaner tests:

```bash
npx tsx src/cleaner.test.ts
```

The test suite includes:
- Basic pattern removal tests
- Confluence-specific pattern tests
- Preservation of valid markdown
- End-to-end transformation tests

## Implementation Details

The cleaner uses regular expressions to identify and remove malformed patterns. Key design principles:

1. **Conservative**: Only removes patterns that are clearly malformed
2. **Preservative**: Never removes valid markdown content
3. **Multi-pass**: Runs multiple passes to handle cascading issues
4. **Tested**: Comprehensive test coverage ensures correctness

## Files

- `src/cleaner.ts` - Main cleaner implementation
- `src/cleaner.test.ts` - Test suite
- `src/transformer.ts` - Integration point (calls cleaner in `htmlToMarkdown()`)
