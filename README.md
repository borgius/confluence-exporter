# Minimal Confluence to Markdown Exporter

A lightweight, standalone CLI tool to export Confluence spaces to Markdown files with hierarchical folder structure.

## Features

- 🚀 Minimal dependencies (uses native Node.js fetch)
- 📄 Command-based CLI with five commands: `help`, `index`, `update`, `plan`, `download`, `transform`
- 🔄 Four-phase export workflow (indexing → planning → downloading → transforming)
- 📁 Hierarchical folder structure based on page tree (mirrors Confluence hierarchy)
- 📝 Separate HTML download and Markdown transformation for flexibility
- 🔗 HTML to Markdown transformation with Confluence macro support
- 👤 User link resolution with intelligent caching
- 📎 Image/attachment downloading with automatic slugification
- 💾 YAML-based indexing with resume capability
- ✨ Prettier formatting for consistent output

## Prerequisites

- Node.js 18+ (for native fetch support)

## Usage

```bash
node index.js <command> [options]
```

### Commands

- `help` - Display usage information
- `index` - Create page inventory (`_index.yaml`)
- `update` - Check for new/updated pages and update `_index.yaml`
- `plan` - Create download queue and tree structure (`_queue.yaml` + `_tree.yaml`)
- `download` - Download HTML pages from queue
- `transform` - Transform HTML files to Markdown (skips existing MD files, creates links structure)

Commands can be chained to run in sequence:
```bash
node index.js index plan download transform [options]
```

### Options

| Flag | Long Form | Description | Default |
|------|-----------|-------------|---------|
| `-u` | `--url` | Confluence base URL | env: `CONFLUENCE_BASE_URL` |
| `-n` | `--username` | Username/email | env: `CONFLUENCE_USERNAME` |
| `-p` | `--password` | API token | env: `CONFLUENCE_PASSWORD` |
| `-s` | `--space` | Space key | env: `CONFLUENCE_SPACE_KEY` |
| `-o` | `--output` | Output directory | `./output` or env: `OUTPUT_DIR` |
| `-i` | `--pageId` | Single page ID (optional) | none |
| `-l` | `--limit` | Limit number of pages to process | none |
| `-f` | `--force` | Force re-download of all pages (skip version check) | false |
| | `--clear` | Clear existing MD files and images before transforming | false |
| | `--pageSize` | API page size | `25` |
| `-h` | `--help` | Show help message | |

### Environment Variables

- `CONFLUENCE_BASE_URL`
- `CONFLUENCE_USERNAME`
- `CONFLUENCE_PASSWORD`
- `CONFLUENCE_SPACE_KEY`
- `OUTPUT_DIR`

## Examples

### Full Space Export (4-phase workflow)
```bash
node index.js index plan download transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE -o ./output
```

### Full Space Export with Limit (process first 10 pages only)
```bash
node index.js index plan download transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE -o ./output -l 10
```

### Create Index Only (Phase 1)
```bash
node index.js index -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

### Check for New/Updated Pages and Update Existing Index
```bash
node index.js update -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

### Create Download Queue from Existing Index (Phase 2)
```bash
node index.js plan -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

### Create Download Queue for Specific Page and All Children
```bash
node index.js plan -i 123456789 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

### Force Re-download All Pages (ignore version check)
```bash
node index.js plan --force -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

### Download HTML Pages from Existing Queue (Phase 3)
```bash
node index.js download -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

### Transform HTML to Markdown (Phase 4)
```bash
node index.js transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

### Transform HTML to Markdown with Clear (remove existing MD files first)
```bash
node index.js transform --clear -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

### Download and Transform Together
```bash
node index.js download transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

### Download Single Page HTML Only (no index/plan needed)
```bash
node index.js download -i 123456789 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE
```

## Transform Command Details

The `transform` command converts downloaded HTML files from Confluence into Markdown format with the following features:

### Key Features
- **HTML to Markdown Conversion**: Handles Confluence-specific elements like macros (code blocks, panels, user links), images, headers, lists, and links
- **Image Handling**: Downloads attachments referenced in Confluence image tags and saves them in `images/` subdirectories
- **Macro Support**: Transforms Confluence macros (e.g., `list-children` fetches child pages, `code` blocks become fenced code, panels become blockquotes)
- **User Link Resolution**: Converts Confluence user links to `@displayName` format using API calls
- **Cleanup and Formatting**: Removes HTML tags, entities, and malformed Markdown patterns; formats output with Prettier
- **Links Structure**: Creates a `links/` folder with symlinks to all MD files and a `_links.md` file showing a hierarchical tree
- **Resume Capability**: Skips existing Markdown files to allow incremental runs
- **Error Handling**: Non-fatal errors (e.g., failed image downloads) are logged as warnings

### Options
- `--clear`: Remove existing MD files and images folders before transforming (useful for re-processing)
- `--limit <number>`: Process only the first N HTML files

### Output
- Markdown files with YAML front matter (title, ID, URL, version, parentId)
- Downloaded images in `images/` subdirectories per page
- `links/` folder with symlinks and hierarchical index (`_links.md`)

## Output Structure

### Hierarchical Structure (when `_tree.yaml` exists)
```
outputDir/
├── _index.yaml                    # Page index (YAML array)
├── _queue.yaml                    # Download queue (YAML array)
├── _tree.yaml                     # Hierarchical page tree structure
└── MYSPACE/                       # Root folder (space key)
    ├── 123456-page-title.html
    ├── 123456-page-title.md
    └── 123456-page-title/         # Folder for children
        ├── images/                # Images for child pages
        │   └── logo.png
        ├── 789012-child-page.html
        ├── 789012-child-page.md
        └── 789012-child-page/      # Nested children
            ├── 345678-grandchild.html
            └── 345678-grandchild.md
```

### Flat Structure (fallback when only `_queue.yaml` exists)
```
outputDir/
├── _index.yaml         # Page index (YAML array)
├── _queue.yaml         # Download queue (YAML array)
├── page-title-1.md     # Formatted markdown
├── page-title-1.html   # Original HTML (formatted)
├── page-title-2.md
├── page-title-2.html
└── images/             # Shared images folder
    ├── image-1.png
    └── image-2.jpg
```

## Front Matter Format

```yaml
---
title: "Page Title"
id: "123456789"
url: "https://mysite.atlassian.net/pages/viewpage.action?pageId=123456789"
version: 5
parentId: "987654321"
---
```

## Prettier Formatting

**Markdown:**
- `printWidth: 120`
- `proseWrap: 'preserve'` (don't reflow text)
- `tabWidth: 2`

**HTML:**
- `printWidth: 120`
- `htmlWhitespaceSensitivity: 'ignore'`
- Consistent 2-space indentation

Formatting failures are non-fatal (saves unformatted with warning).

## Project Structure

```
src/
├── index.ts          # CLI entry point (arg parsing, config validation)
├── types.ts          # TypeScript type definitions
├── api.ts            # Confluence REST API client
├── transformer.ts    # HTML → Markdown conversion
├── cleaner.ts        # Post-processing cleanup
└── commands/         # Command handlers (modular architecture)
    ├── types.ts      # Command-related type definitions
    ├── help.command.ts      # Help command handler
    ├── index.command.ts     # Index command handler
    ├── update.command.ts    # Update command handler
    ├── plan.command.ts      # Plan command handler
    ├── download.command.ts  # Download command handler (HTML only)
    ├── transform.command.ts # Transform command handler (HTML → MD)
    ├── registry.ts   # Command registry (maps commands to handlers)
    ├── executor.ts   # Command executor (orchestrates execution)
    └── index.ts      # Exports for easy importing
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

## Development

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

## License

Same as parent project.
