# Agents Guide: Confluence to Markdown Exporter

This document provides comprehensive guidance for AI agents (like GitHub Copilot) working on this project. It includes architecture, patterns, conventions, and implementation details.

> **⚠️ IMPORTANT: Keep This Document Updated**  
> When making changes to project structure, architecture, CLI commands, API methods, or core logic, **ALWAYS update this agents.md file** to reflect those changes. This ensures AI agents have accurate context for future development work.

---

## Project Overview

**Name:** Confluence to Markdown Exporter  
**Type:** CLI Tool  
**Language:** TypeScript 5.x  
**Runtime:** Node.js 18+  
**Purpose:** Export Confluence spaces to Markdown files with metadata preservation

### Key Features
- Minimal dependencies (uses native Node.js fetch)
- Command-based CLI: separate `index` and `download` phases
- Two-phase export: indexing, downloading (can run independently)
- HTML to Markdown transformation with macro support
- User link resolution with caching
- Image/attachment downloading
- YAML-based page indexing with resume support
- Prettier formatting for output files

---

## Architecture

### Core Components

```
src/
├── index.ts          # CLI entry point (arg parsing, config validation)
├── types.ts          # TypeScript type definitions
├── api.ts            # Confluence REST API client
├── transformer.ts    # HTML → Markdown conversion
├── cleaner.ts        # Post-processing cleanup
└── runner.ts         # Export orchestration
```

### Data Flow

```
CLI Args/Env → Config → Runner
                          ↓
              Phase 1: Create index.yaml
                          ↓
        API.listPages → index.yaml (YAML array)
                          ↓
              Phase 2: Download pages
                          ↓
         Read index.yaml → foreach page:
                          ↓
                  API.getPage(id)
                          ↓
              Transformer.transform()
                          ↓
         Download attachments/images
                          ↓
              Apply markdown cleanup
                          ↓
              Format with Prettier
                          ↓
                Save .md and .html files
```

### Key Design Patterns

1. **Two-Phase Export**
   - Phase 1: Create index.yaml with all page metadata
   - Phase 2: Download full page content from index
   - Benefits: Resumable, transparent progress, easy debugging

2. **Async Generators**
   - Used in `api.getAllPages()` for memory-efficient pagination
   - Yields pages one at a time instead of loading all into memory

3. **Caching**
   - User lookups cached in `Map<string, User>`
   - Reduces API calls for repeated user references

4. **Error Handling**
   - Non-fatal errors logged as warnings (e.g., failed image downloads)
   - Fatal errors throw and exit with status code 1

---

## Type System

### Configuration
```typescript
interface ConfluenceConfig {
  baseUrl: string;         // Confluence instance URL
  username: string;        // Email/username
  password: string;        // API token
  spaceKey: string;        // Space identifier
  outputDir: string;       // Export destination
  pageId?: string;         // Optional: single page export
  pageSize?: number;       // Optional: pagination size (default: 25)
}
```

### Core Domain
```typescript
interface Page {
  id: string;
  title: string;
  body: string;            // HTML storage format
  version?: number;
  parentId?: string;
  modifiedDate?: string;
}

interface PageIndexEntry {
  id: string;
  title: string;
  version?: number;
  parentId?: string;
  modifiedDate?: string;
  indexedDate: string;     // When indexed
  pageNumber: number;      // API page number
}
```

### Transformation
```typescript
interface MarkdownResult {
  content: string;         // Markdown body
  frontMatter: {           // YAML front matter
    title: string;
    id: string;
    version?: number;
    parentId?: string;
  };
  images: Array<{          // Downloaded images
    filename: string;
    data: Buffer;
  }>;
}
```

---

## API Client (api.ts)

### Authentication
- Uses HTTP Basic Auth with base64-encoded credentials
- Token stored in `authHeader` property

### Key Methods

#### `getPage(pageId: string): Promise<Page>`
Fetches a single page with full content.
- Expands: `body.storage`, `version`, `history.lastUpdated`
- Returns: Normalized `Page` object

#### `listPages(spaceKey, start, limit): Promise<PaginatedResponse<Page>>`
Fetches paginated page list from a space.
- Includes body content (use for small exports only)
- Returns: Results + pagination metadata

#### `getAllPages(spaceKey, pageSize): AsyncGenerator<Page & {apiPageNumber}>`
Memory-efficient async generator for all pages.
- Handles pagination automatically
- Yields pages one at a time
- Tracks API page number for logging

#### `getChildPages(pageId): Promise<Page[]>`
Fetches child pages for hierarchy resolution.
- Used by `list-children` macro transformation
- Returns page IDs and titles only (no body)

#### `downloadAttachment(pageId, filename): Promise<Buffer | null>`
Downloads binary attachment data.
- Returns null on failure (non-fatal)
- Used for image downloads

#### `getUserByUsername(username): Promise<User | null>`
#### `getUserByKey(userKey): Promise<User | null>`
Resolve user links to display names.
- Results cached in `userCache` Map
- Returns null on failure (falls back to username)

---

## Transformer (transformer.ts)

### Transformation Pipeline

```
HTML (Confluence Storage Format)
    ↓
1. Transform user links → @DisplayName
    ↓
2. Transform images → ![alt](images/file.png)
    ↓
3. Transform macros → Markdown equivalents
    ↓
4. Remove <ac:link> tags
    ↓
5. Convert basic HTML → Markdown
    ↓
6. Clean up entities & whitespace
    ↓
7. Apply cleaner.cleanAll()
    ↓
Markdown output
```

### HTML → Markdown Mappings

| HTML | Markdown |
|------|----------|
| `<h1>` ... `<h6>` | `#` ... `######` |
| `<strong>`, `<b>` | `**text**` |
| `<em>`, `<i>` | `*text*` |
| `<a href="...">` | `[text](url)` |
| `<ul><li>` | `- item` |
| `<pre><code>` | ` ```code``` ` |
| `<code>` | `` `inline` `` |
| `<br>` | `\n` |

### Confluence Macro Transformations

| Macro | Output |
|-------|--------|
| `code` (with language) | ` ```lang\ncode\n``` ` |
| `code` (no language) | ` ```\ncode\n``` ` |
| `info` | `> **Info:** content` |
| `warning` | `> **Warning:** content` |
| `note` | `> **Note:** content` |
| `panel` | Extract content |
| `excerpt` | Extract content |
| `toc` | `<!-- Table of Contents -->` |
| `list-children` | Fetch + render child page links |
| Others | `<!-- Confluence Macro: name -->` |

### User Link Resolution

```html
<!-- Input -->
<ac:link><ri:user ri:username="john.doe"/></ac:link>
<ac:link><ri:user ri:userkey="ff8080817b0a1234"/></ac:link>

<!-- Output -->
@John Doe
@John Doe
```

### Image Handling

1. Parse `<ac:image><ri:attachment ri:filename="..."/>` 
2. Slugify filename (preserve extension)
3. Download via API
4. Save to `images/` subdirectory
5. Replace with `![alt](images/slugified-name.ext)`

---

## Cleaner (cleaner.ts)

### Purpose
Post-process markdown to remove malformed patterns introduced during HTML conversion.

### Cleanup Operations

1. **Empty Markers**
   - Remove `**` or `*` with no content
   - Remove empty headers (`## **`)
   - Remove empty links `[]()`

2. **Confluence Artifacts**
   - Remove standalone bold markers across lines
   - Remove empty blockquotes
   - Remove empty code blocks

3. **Whitespace**
   - Limit consecutive blank lines to 3
   - Remove trailing line whitespace
   - Ensure single trailing newline

### Usage
```typescript
const cleaner = new MarkdownCleaner();
markdown = cleaner.cleanAll(markdown); // Apply all passes
```

---

## Runner (runner.ts)

### Public Methods

#### `runIndex(): Promise<void>`
Executes Phase 1 only: Creates index.yaml with page metadata.
- Creates output directory
- Streams pages via `api.getAllPages()`
- Appends each page to index.yaml as YAML array entry
- Supports resume functionality (skips already indexed pages)
- Logs: `[N] Indexed: Title (ID) [API Page N]`

#### `runDownload(): Promise<void>`
Executes Phase 2 only: Downloads pages from index or single page.
- If `config.pageId` is set: Downloads single page
- Otherwise: Reads index.yaml and downloads all pages
- Transforms HTML to Markdown
- Downloads images
- Formats with Prettier
- Saves .md and .html files
- Logs: `[N/Total] Processing: Title (ID)`

#### `run(): Promise<void>` (deprecated)
Legacy method that runs both `runIndex()` and `runDownload()` sequentially.
Use the individual methods via CLI commands instead.

### Export Modes

#### Mode 1: Single Page Export
When `config.pageId` is set (via `download` command):
1. Fetch single page via `api.getPage(pageId)`
2. Transform to markdown
3. Save .md and .html files

#### Mode 2: Full Space Export
When `config.pageId` is undefined (via `index` and `download` commands):

**Phase 1: Create Index** (`runIndex()`)
1. Check if `index.yaml` exists (resume if found)
2. Stream pages via `api.getAllPages()`
3. Append each page as YAML array entry
4. Log: `[N] Indexed: Title (ID) [API Page N]`

**Phase 2: Download Pages** (`runDownload()`)
1. Parse `index.yaml` as array
2. For each entry:
   - Fetch full page via `api.getPage(id)`
   - Transform to markdown
   - Download images
   - Format with Prettier
   - Save .md and .html files
3. Log: `[N/Total] Processing: Title (ID)`

### File Structure

```
outputDir/
├── index.yaml          # Page index (YAML array)
├── page-title-1.md     # Formatted markdown
├── page-title-1.html   # Original HTML (formatted)
├── page-title-2.md
├── page-title-2.html
└── images/
    ├── image-1.png
    └── image-2.jpg
```

### Filename Slugification
```typescript
slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')      // Spaces → hyphens
    .replace(/-+/g, '-')       // Collapse hyphens
    .trim();
}
```

### Front Matter Format
```yaml
---
title: "Page Title"
id: "123456789"
url: "https://site.atlassian.net/pages/viewpage.action?pageId=123456789"
version: 5
parentId: "987654321"
---
```

### Prettier Formatting

**Markdown:**
- `printWidth: 120`
- `proseWrap: 'preserve'` (don't reflow text)
- `tabWidth: 2`

**HTML:**
- `printWidth: 120`
- `htmlWhitespaceSensitivity: 'ignore'`
- Consistent 2-space indentation

Formatting failures are non-fatal (saves unformatted with warning).

---

## CLI (index.ts)

### Command Structure
The CLI uses a command-based architecture with three commands:

- **`help`** - Display help information
- **`index`** - Create index.yaml with page metadata (Phase 1 only)
- **`download`** - Download pages from index or single page (Phase 2 only)

Commands can be chained: `node index.js index download` runs both in sequence.

### Argument Parsing
Uses `minimist` for flexible CLI arguments.

```bash
# Show help (no commands or --help flag)
node index.js
node index.js help
node index.js --help

# Create index only (Phase 1)
node index.js index -u https://site.atlassian.net \
              -n user@example.com \
              -p token123 \
              -s MYSPACE \
              -o ./export

# Download from existing index (Phase 2)
node index.js download -u https://site.atlassian.net \
              -n user@example.com \
              -p token123 \
              -s MYSPACE \
              -o ./export

# Run both phases in sequence
node index.js index download -u URL -n USER -p PASS -s SPACE

# Download single page (no index needed)
node index.js download -i 123456789 -u URL -n USER -p PASS -s SPACE

# Short flags
node index.js download -u URL -n USER -p PASS -s SPACE -o DIR -i ID
```

### Command Behavior

1. **No commands provided**: Shows help and exits
2. **Invalid command**: Shows error + help and exits with code 1
3. **Multiple commands**: Executes in sequence with visual separators
4. **`help` command**: Shows help and exits (other commands ignored)

### Options

| Flag | Long Form | Description | Default |
|------|-----------|-------------|---------|
| `-u` | `--url` | Confluence base URL | env: `CONFLUENCE_BASE_URL` |
| `-n` | `--username` | Username/email | env: `CONFLUENCE_USERNAME` |
| `-p` | `--password` | API token | env: `CONFLUENCE_PASSWORD` |
| `-s` | `--space` | Space key | env: `CONFLUENCE_SPACE_KEY` |
| `-o` | `--output` | Output directory | `./output` or env: `OUTPUT_DIR` |
| `-i` | `--pageId` | Single page ID (optional) | none |
| | `--pageSize` | API page size | `25` |
| `-h` | `--help` | Show help | |

### Environment Variables
Fallback if CLI args not provided:
- `CONFLUENCE_BASE_URL`
- `CONFLUENCE_USERNAME`
- `CONFLUENCE_PASSWORD`
- `CONFLUENCE_SPACE_KEY`
- `OUTPUT_DIR`

### Validation
Required fields (for `index` and `download` commands):
- `baseUrl`
- `username`
- `password`
- `spaceKey`

Exits with code 1 and error message if missing.

### Help Text
```bash
node index.js
node index.js help
node index.js --help
```
Shows usage, commands, options, environment variables, and examples.

---

## Development Workflow

### Build & Run

```bash
# Build TypeScript
npm run build          # Uses Vite
npm run build:tsc      # Uses tsc directly

# Run compiled
npm start -- [args]

# Development mode
npm run dev -- [args]           # Run once
npm run dev:watch -- [args]     # Watch mode
```

### Testing

```bash
npm test                        # Run all tests
npm run test:watch              # Watch mode
npm run test:coverage           # With coverage
```

### Linting & Type Checking

```bash
npm run lint                    # ESLint
npm run typecheck               # TypeScript --noEmit
```

### Cleaning

```bash
npm run clean                   # Remove dist/
npm run rebuild                 # Clean + build
```

---

## Coding Conventions

### TypeScript Style

1. **Explicit Types**
   - Always type function parameters
   - Always type function return values
   - Use interfaces for objects, type aliases for unions

2. **Imports**
   - Use `.js` extension in imports (ES modules)
   - Import types with `import type {}`
   - Order: types, then classes, then functions

3. **Async/Await**
   - Prefer async/await over Promises
   - Use `for await...of` for async generators
   - Handle errors with try/catch

4. **Error Handling**
   - Throw `Error` objects with descriptive messages
   - Log warnings to console for non-fatal errors
   - Return null for optional operations that fail

5. **Naming**
   - Classes: PascalCase (e.g., `ConfluenceApi`)
   - Functions/methods: camelCase (e.g., `getPage`)
   - Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_PAGE_SIZE`)
   - Interfaces: PascalCase (e.g., `ConfluenceConfig`)

### Documentation

```typescript
/**
 * Brief description of function/class
 * 
 * Detailed explanation if needed.
 * 
 * @param paramName - Description
 * @returns Description
 * @throws ErrorType - When error occurs
 */
```

### File Organization

```typescript
// 1. Imports
import type { TypeA, TypeB } from './types.js';
import { ClassA } from './class-a.js';

// 2. Constants
const DEFAULT_VALUE = 42;

// 3. Interfaces (if not in types.ts)
interface LocalType { ... }

// 4. Class/function implementation
export class MyClass { ... }

// 5. Helper functions (private)
function helperFunction() { ... }
```

---

## Common Tasks

### Adding a New Macro Transformation

1. Identify macro pattern in Confluence HTML:
   ```html
   <ac:structured-macro ac:name="macro-name">
     <!-- content -->
   </ac:structured-macro>
   ```

2. Add regex replacement in `transformer.ts` → `transformMacros()`:
   ```typescript
   result = result.replace(
     /<ac:structured-macro[^>]*ac:name="macro-name"[^>]*>(.*?)<\/ac:structured-macro>/gis,
     '<!-- Macro: macro-name -->\n$1\n'
   );
   ```

3. Test with sample page containing macro

### Adding a New CLI Option

1. Add to `minimist` config in `index.ts`:
   ```typescript
   const args = minimist(process.argv.slice(2), {
     string: ['url', 'username', ..., 'newOption'],
     alias: { o: 'newOption' }
   });
   ```

2. Add to config building:
   ```typescript
   const config: ConfluenceConfig = {
     // ...
     newOption: args.newOption || process.env.NEW_OPTION || 'default'
   };
   ```

3. Update help text
4. Update type definition in `types.ts`

### Adding a New API Endpoint

1. Add response interface to `types.ts`:
   ```typescript
   export interface NewEndpointResponse {
     // fields
   }
   ```

2. Add method to `api.ts`:
   ```typescript
   async newEndpoint(param: string): Promise<Result> {
     const url = `${this.baseUrl}/rest/api/endpoint/${param}`;
     const response = await fetch(url, {
       headers: {
         'Authorization': this.authHeader,
         'Accept': 'application/json'
       }
     });
     // ... error handling, parsing
     return data;
   }
   ```

3. Call from transformer or runner as needed

### Adding a Cleanup Pattern

1. Add pattern to `cleaner.ts`:
   ```typescript
   // In clean() or cleanConfluencePatterns()
   cleaned = cleaned.replace(/pattern/g, 'replacement');
   ```

2. Add comment explaining what it fixes
3. Test with malformed markdown sample

---

## Testing Guidelines

### Unit Tests
- Located in `tests/` directory
- Use Jest framework
- Mock API calls with jest.fn()
- Test transformations with fixtures

### Example Test Structure
```typescript
describe('MarkdownTransformer', () => {
  it('should transform bold text', () => {
    const input = '<strong>bold</strong>';
    const expected = '**bold**';
    const result = transformer.htmlToMarkdown(input);
    expect(result).toBe(expected);
  });
});
```

### Running Tests
```bash
npm test                    # All tests
npm test -- --testNamePattern="transform"  # Specific tests
npm run test:coverage       # With coverage report
```

---

## Troubleshooting

### Common Issues

**Issue: "Failed to fetch page: 401 Unauthorized"**
- Solution: Check API token validity, ensure username is correct email

**Issue: Empty markdown files**
- Solution: Check if page body is in storage format (not view/export format)

**Issue: Images not downloading**
- Solution: Verify attachment exists on page, check filename encoding

**Issue: Malformed markdown (e.g., `## **`)**
- Solution: Run through cleaner, add new pattern if needed

**Issue: Index.yaml incomplete**
- Solution: Delete index.yaml and restart (resumable from any point)

### Debug Mode

Enable verbose logging:
```typescript
// In runner.ts or api.ts
console.log('[DEBUG]', detailedInfo);
```

### API Rate Limiting

Confluence Cloud has rate limits:
- Consider adding delays: `await new Promise(r => setTimeout(r, 100));`
- Use smaller `pageSize` if hitting limits

---

## Dependencies

### Runtime
- `minimist`: ^1.2.8 - CLI argument parsing
- `dotenv`: ^17.2.3 - Environment variable loading
- `prettier`: ^3.6.2 - Code formatting
- `yaml`: ^2.8.1 - YAML parsing/stringifying

### Development
- `typescript`: ^5.0.0 - TypeScript compiler
- `vite`: ^7.1.10 - Build tool
- `vite-node`: ^3.2.4 - Development runner
- `jest`: ^30.2.0 - Testing framework
- `ts-jest`: ^29.4.5 - TypeScript Jest support
- `@types/node`: ^20.0.0 - Node.js type definitions
- `@types/jest`: ^30.0.0 - Jest type definitions
- `@types/minimist`: ^1.2.5 - Minimist type definitions

---

## Future Enhancements

### Potential Features
- [ ] Incremental exports (only changed pages)
- [ ] Link rewriting (internal page references)
- [ ] Attachment downloads (all file types)
- [ ] Custom macro handlers (plugin system)
- [ ] Multi-space exports
- [ ] Parallel downloads (with concurrency limit)
- [ ] Export to other formats (HTML, PDF)
- [ ] Page hierarchy preservation in directory structure
- [ ] Git integration (commit per page)

### Known Limitations
- Basic HTML conversion (may miss edge cases)
- No retry logic for failed API calls
- No progress persistence within a single page
- Limited macro support (only common ones)
- No table formatting improvements

---

## Resources

### Confluence REST API
- [Confluence Cloud REST API](https://developer.atlassian.com/cloud/confluence/rest/v1/intro/)
- [Storage Format Reference](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html)

### TypeScript
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [ES Modules in Node.js](https://nodejs.org/api/esm.html)

### Markdown
- [CommonMark Spec](https://commonmark.org/)
- [GitHub Flavored Markdown](https://github.github.com/gfm/)

---

## License

MIT - Same as parent project

---

## Maintainer Notes

**Last Updated:** October 17, 2025  
**Agent Compatibility:** Optimized for GitHub Copilot, Claude, GPT-4  
**Document Version:** 1.0.0

This document should be updated when:
- Architecture changes significantly
- New major features are added
- API patterns change
- New conventions are established
