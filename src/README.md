# Minimal Confluence to Markdown Exporter

A lightweight, standalone CLI tool to export Confluence spaces to Markdown files.

## Features

- 🚀 Minimal dependencies (uses native Node.js fetch)
- 📄 Fetches all pages from a Confluence space
- 🔄 Basic HTML to Markdown transformation
- 📝 Generates front matter with page metadata
- 💾 Saves pages as `.md` files with safe filenames
- 👤 Resolves user links to display names (with caching)
- 📦 Saves original HTML alongside markdown files

## Prerequisites

- Node.js 18+ (for native fetch support)

## Usage

### Option 1: Command Line Arguments

```bash
node index.js <baseUrl> <username> <password> <spaceKey> [outputDir]
```

Example:
```bash
node index.js https://mysite.atlassian.net user@example.com mypassword MYSPACE ./output
```

### Option 2: Environment Variables

```bash
export CONFLUENCE_BASE_URL="https://mysite.atlassian.net"
export CONFLUENCE_USERNAME="user@example.com"
export CONFLUENCE_PASSWORD="mypassword"
export CONFLUENCE_SPACE_KEY="MYSPACE"
export OUTPUT_DIR="./output"  # optional

node index.js
```

## Output

The tool will create markdown files in the output directory with:

- **Markdown file** (`.md`) - Front matter + converted markdown content
- **HTML file** (`.html`) - Original Confluence storage format for reference
- **Safe filenames** generated from page titles

Example output files:
```
output/
├── my-page-title.md
├── my-page-title.html
├── another-page.md
└── another-page.html
```

Example markdown file:
```markdown
---
title: "My Page Title"
id: "123456"
version: 5
parentId: "789012"
---

# My Page Title

This is the page content converted to Markdown...
```

The HTML file contains the original Confluence storage format (XML/HTML) which can be useful for:
- Debugging transformation issues
- Preserving the original content
- Manual inspection of complex macros

## Structure

```
src2/
├── types.ts          # TypeScript type definitions
├── api.ts            # Confluence API client
├── transformer.ts    # HTML to Markdown converter
├── runner.ts         # Export orchestration logic
├── index.ts          # CLI entry point
└── README.md         # This file
```

## User Link Resolution

The exporter automatically resolves Confluence user links to display names:

```html
<!-- Confluence HTML -->
<ac:link><ri:user ri:username="john.doe"/></ac:link>
<ac:link><ri:user ri:userkey="ff8080817b0a1234"/></ac:link>
```

Becomes:

```markdown
@John Doe
@John Doe
```

Features:
- ✓ Resolves by username or userkey
- ✓ Caches user lookups to minimize API calls
- ✓ Falls back to username if API fails
- ✓ Handles unknown users gracefully

## Limitations

This is a minimal implementation and has the following limitations:

- Basic HTML to Markdown conversion (may not handle all Confluence macros)
- No attachment download support
- No link rewriting for internal page references
- No incremental export (always exports all pages)
- No error recovery or retry logic
- No post-processing cleanup

For a full-featured exporter, see the main `src` directory.

## Development

Compile TypeScript:
```bash
npx tsc src2/*.ts --outDir dist --module es2022 --target es2022
```

Run:
```bash
node dist/index.js [arguments]
```

## License

Same as parent project.
