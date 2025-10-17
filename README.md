# Confluence Exporter

A robust, enterprise-ready tool to export Atlassian Confluence spaces to local Markdown files while preserving hierarchy, attachments, and cross-references. Designed for ingestion into RAG (Retrieval-Augmented Generation) systems, documentation websites, and knowledge base pipelines.

## Features

- **Complete Space Export**: Export entire Confluence spaces with full hierarchy preservation
- **Incremental Updates**: Intelligent resume mode for efficient incremental exports with state tracking
- **Attachment Support**: Download and organize page attachments with configurable thresholds and deduplication
- **Advanced Markdown Conversion**: Convert Confluence storage format to clean, standardized Markdown with typography rules
- **Markdown Cleanup**: Automatic post-processing to remove malformed markdown patterns from HTML conversion
- **Smart Link Resolution**: Intelligent cross-reference linking between exported pages with user link tracking
- **Robust Error Handling**: Comprehensive retry policies, error classification, and graceful failure recovery
- **Performance Optimized**: Configurable concurrency with memory-efficient processing and queue management
- **Dry Run Mode**: Preview exports without writing files to validate configuration
- **Flexible Configuration**: Environment variables, config files, CLI options, and programmatic API
- **Queue Management**: Advanced FIFO processing with persistence, recovery, and deduplication
- **Comprehensive Monitoring**: Built-in performance metrics, progress tracking, and detailed reporting

## Quick Start

### Installation

```bash
npm install -g confluence-exporter
```

### Basic Usage

```bash
# Export a Confluence space
confluence-exporter \
  --space "MYSPACE" \
  --out "./export" \
  --username "your-email@company.com" \
  --password "your-api-token" \
  --base-url "https://your-domain.atlassian.net/wiki"
```

### Using Environment Variables

```bash
# Set credentials via environment
export CONFLUENCE_USERNAME="your-email@company.com"
export CONFLUENCE_PASSWORD="your-api-token"
export CONFLUENCE_BASE_URL="https://your-domain.atlassian.net/wiki"

# Export with minimal CLI args
confluence-exporter --space "MYSPACE" --out "./export"
```

### Configuration File

Create a `confluence-export.json` config file:

```json
{
  "spaceKey": "MYSPACE",
  "outputDir": "./export",
  "username": "your-email@company.com",
  "password": "your-api-token",
  "baseUrl": "https://your-domain.atlassian.net/wiki",
  "concurrency": 5,
  "logLevel": "info",
  "attachmentThreshold": 20,
  "retry": {
    "maxAttempts": 3,
    "baseDelayMs": 1000,
    "maxDelayMs": 30000,
    "jitterRatio": 0.1
  }
}
```

Then run:

```bash
confluence-exporter --config confluence-export.json
```

## CLI Reference

### Required Arguments

- `--space, -s <space>`: Confluence space key to export
- `--out, -o <directory>`: Output directory for exported files

### Authentication (choose one method)

**Option 1: CLI Arguments**
- `--username <email>`: Confluence username/email
- `--password <token>`: Confluence API token
- `--base-url <url>`: Confluence base URL

**Option 2: Environment Variables**
- `CONFLUENCE_USERNAME`: Username/email
- `CONFLUENCE_PASSWORD`: API token  
- `CONFLUENCE_BASE_URL`: Base URL

**Option 3: Configuration File**
- `--config <path>`: Path to JSON configuration file

### Optional Arguments

- `--dry-run`: Preview export without writing files
- `--concurrency, -c <number>`: Concurrent requests (default: 5)
- `--limit <number>`: Maximum number of pages to fetch (useful for testing)
- `--resume`: Resume previous interrupted export
- `--fresh`: Start fresh export (ignore previous state)
- `--root <pageId>`: Export only pages under specific root page
- `--log-level <level>`: Logging level: debug, info, warn, error (default: info)
- `--attachment-threshold <number>`: Max attachment failures before aborting (default: 20)
- `--cleanup-intensity <level>`: Markdown cleanup intensity: light, medium, heavy (default: medium)
- `--cleanup-disable`: Disable automatic markdown cleanup post-processing

### Key Flag Behaviors

**Queue and Discovery Flags:**
- `--limit`: Limits only the **initial** page discovery; dynamic discovery via macros and links continues beyond this limit
- `--resume`/`--fresh`: Cannot be used together; resume requires previous export state files

**Cleanup Control Flags:**
- `--cleanup-intensity light`: Basic typography and whitespace cleanup
- `--cleanup-intensity medium`: Adds heading normalization and smart punctuation
- `--cleanup-intensity heavy`: Full cleanup including word wrapping and footnote formatting
- `--cleanup-disable`: Bypasses all markdown post-processing for raw output

### Examples

**Basic Export**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./knowledge-base" \
  --username "user@company.com" \
  --password "api-token-here" \
  --base-url "https://company.atlassian.net/wiki"
```

**High Performance Export**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./export" \
  --concurrency 10 \
  --log-level warn
```

**Partial Export (specific root page)**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./partial-export" \
  --root "123456789"
```

**Resume Interrupted Export**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./export" \
  --resume
```

**Dry Run (preview only)**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./preview" \
  --dry-run
```

**Limited Discovery Testing**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./test-export" \
  --limit 50 \
  --cleanup-intensity light
```

**Raw Export (no cleanup)**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./raw-export" \
  --cleanup-disable
```

**Fresh Start with Heavy Cleanup**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./clean-export" \
  --fresh \
  --cleanup-intensity heavy
```

## Output Structure

The exporter creates a hierarchical directory structure mirroring your Confluence space:

```
export/
├── manifest.json                 # Export metadata and page mapping
├── README.md                     # Export summary and statistics
├── _attachments/                 # Centralized attachment storage
│   ├── images/
│   ├── documents/ 
│   └── other/
└── pages/                        # Hierarchical page structure
    ├── Parent Page.md
    ├── parent-page/               # Child pages in subdirectory
    │   ├── Child Page 1.md
    │   └── Child Page 2.md
    └── Another Parent.md
```

### Markdown Cleanup

The exporter automatically cleans up malformed markdown that can result from HTML-to-Markdown conversion. This includes:

- **Empty headers**: Headers with no content or only formatting markers (e.g., `## **`)
- **Empty formatting**: Bold/italic markers with no content (e.g., `** **`)
- **Standalone markers**: Formatting markers on their own lines
- **Empty structures**: Empty links, list items, blockquotes, and code blocks
- **Excessive whitespace**: Multiple consecutive blank lines and trailing spaces

For more details, see [docs/markdown-cleanup.md](docs/markdown-cleanup.md).

Example cleanup:

**Before:**
```markdown
## **

**

Some content here
```

**After:**
```markdown
Some content here
```

### Page Format

Each exported page includes:

```markdown
---
title: "Page Title"
confluence:
  id: "123456789"
  url: "https://company.atlassian.net/wiki/spaces/DOCS/pages/123456789"
  version: 5
  parentId: "987654321"
  lastModified: "2024-01-15T10:30:00Z"
attachments:
  - name: "diagram.png"
    path: "_attachments/images/diagram.png"
    size: 45678
---

# Page Title

Page content in clean Markdown format with resolved links...
```

## Configuration

### Configuration File Schema

Complete configuration file reference:

```json
{
  // Required settings
  "spaceKey": "string (required)",
  "outputDir": "string (required)", 
  
  // Authentication (required)
  "username": "string",
  "password": "string",
  "baseUrl": "string",
  
  // Export behavior
  "dryRun": "boolean (default: false)",
  "resume": "boolean (default: false)",
  "fresh": "boolean (default: false)",
  "rootPageId": "string (optional)",
  
  // Performance tuning
  "concurrency": "number (default: 5, max: 20)",
  "limit": "number (optional, max pages to export)",
  
  // Logging and monitoring
  "logLevel": "debug|info|warn|error (default: info)",
  
  // Error handling
  "attachmentThreshold": "number (default: 20)",
  "retry": {
    "maxAttempts": "number (default: 3, max: 10)",
    "baseDelayMs": "number (default: 1000)",
    "maxDelayMs": "number (default: 30000)",
    "jitterRatio": "number (default: 0.1, range: 0-1)"
  },
  
  // Content processing
  "cleanup": {
    "enabled": "boolean (default: true)",
    "typography": {
      "enabled": "boolean (default: true)",
      "quotes": "boolean (default: true)",
      "dashes": "boolean (default: true)",
      "ellipses": "boolean (default: true)"
    },
    "whitespace": {
      "enabled": "boolean (default: true)",
      "normalizeSpaces": "boolean (default: true)",
      "trimLines": "boolean (default: true)",
      "removeEmptyLines": "boolean (default: false)"
    }
  }
}
```

### Environment Variables

- `CONFLUENCE_USERNAME`: Confluence username/email
- `CONFLUENCE_PASSWORD`: Confluence API token
- `CONFLUENCE_BASE_URL`: Confluence base URL (e.g., https://company.atlassian.net/wiki)
- `CONFLUENCE_SPACE`: Default space key
- `CONFLUENCE_OUTPUT_DIR`: Default output directory
- `CONFLUENCE_LOG_LEVEL`: Default log level
- `CONFLUENCE_CONCURRENCY`: Default concurrency level

## Authentication

### API Token Setup

1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a label (e.g., "Confluence Exporter")
4. Copy the generated token
5. Use your email as username and the token as password

### Permissions Required

Your account needs the following permissions:
- **Space**: View space and pages
- **Pages**: View page content and properties
- **Attachments**: Download attachments

## Performance and Scaling

### Performance Guidelines

**Small Spaces (< 100 pages)**
```bash
confluence-exporter \
  --space "SMALL" \
  --out "./export" \
  --concurrency 3
```

**Medium Spaces (100-1000 pages)**
```bash
confluence-exporter \
  --space "MEDIUM" \
  --out "./export" \
  --concurrency 8 \
  --attachment-threshold 50
```

**Large Spaces (1000+ pages)**
```bash
confluence-exporter \
  --space "LARGE" \
  --out "./export" \
  --concurrency 12 \
  --attachment-threshold 100 \
  --log-level warn
```

### Memory Optimization

For memory-constrained environments:

```bash
confluence-exporter \
  --space "DOCS" \
  --out "./export" \
  --concurrency 1 \
  --attachment-threshold 10
```

### Network Optimization

For slow or unreliable networks:

```bash
confluence-exporter \
  --space "DOCS" \
  --out "./export" \
  --concurrency 2 \
  --retry.maxAttempts 5 \
  --retry.maxDelayMs 60000
```

## Quality and Testing

### Test Coverage

The project uses Jest for testing with comprehensive coverage:

- **Unit Tests**: Core functionality (MarkdownCleaner, MarkdownTransformer)
- **100% coverage** on MarkdownCleaner
- **70%+ coverage** on MarkdownTransformer
- **16 tests** across 2 test suites

Run tests:
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

Test files are located in the `tests/` directory:
- `tests/cleaner.test.ts` - MarkdownCleaner tests
- `tests/transformer.test.ts` - MarkdownTransformer tests

### Quality Assurance

- **Testing Framework**: Jest with TypeScript support
- **Linting**: ESLint with TypeScript rules
- **Type Safety**: Full TypeScript coverage
- **Code Formatting**: Prettier integration
- **Dependency Security**: npm audit and vulnerability scanning

## Advanced Usage

### Resume Mode

The exporter supports resuming interrupted exports:

```bash
# Start export
confluence-exporter --space "DOCS" --out "./export"

# If interrupted, resume from where it left off
confluence-exporter --space "DOCS" --out "./export" --resume
```

Resume mode uses a `.confluence-export` directory to track progress.

### Fresh Export

Force a complete re-export ignoring previous state:

```bash
confluence-exporter --space "DOCS" --out "./export" --fresh
```

### Root Page Filtering

Export only pages under a specific parent:

```bash
# Get page ID from Confluence URL
# https://company.atlassian.net/wiki/spaces/DOCS/pages/123456789/Page+Title
confluence-exporter --space "DOCS" --out "./export" --root "123456789"
```

### Performance Tuning

**High Throughput**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./export" \
  --concurrency 15 \
  --log-level warn
```

**Memory Constrained**
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./export" \
  --concurrency 2 \
  --attachment-threshold 5
```

### Error Handling

The exporter includes robust error handling:

- **Automatic Retry**: Network errors automatically retry with exponential backoff
- **Error Classification**: Different handling for temporary vs permanent errors  
- **Partial Success**: Export continues even if some pages fail
- **Error Reporting**: Detailed error logs and final summary

## Troubleshooting

### Common Issues

**Authentication Errors**
```
Error: 401 Unauthorized
```
- Check your API token is valid
- Ensure you're using email as username, not username
- Verify base URL format: `https://domain.atlassian.net/wiki`

**Permission Errors**
```
Error: 403 Forbidden
```
- Check space permissions in Confluence
- Ensure your account can view the space and pages

**Network Timeouts**
```
Error: ECONNRESET, ETIMEDOUT
```
- Reduce concurrency: `--concurrency 2`
- Check network connectivity
- Verify base URL accessibility

**Memory Issues**
```
Error: JavaScript heap out of memory
```
- Reduce concurrency: `--concurrency 1`
- Lower attachment threshold: `--attachment-threshold 5`
- Export in smaller batches using `--root`

### Debug Mode

Enable detailed logging:

```bash
confluence-exporter \
  --space "DOCS" \
  --out "./export" \
  --log-level debug
```

### Getting Help

1. Check the error logs in your output directory
2. Try with `--dry-run` to test configuration
3. Use `--log-level debug` for detailed diagnostics
4. Reduce `--concurrency` if experiencing timeouts

## Development

### Prerequisites

- Node.js 18+ 
- npm 8+

### Setup

```bash
# Clone repository
git clone https://github.com/your-org/confluence-exporter.git
cd confluence-exporter

# Install dependencies
npm install

# Run development version
npm run dev -- --help

# Run tests
npm test

# Build for production
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:performance

# Run with coverage
npm run test:coverage
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## API Reference

### Programmatic Usage

```typescript
import { ExportRunner } from 'confluence-exporter';

const config = {
  spaceKey: 'DOCS',
  outputDir: './export',
  username: 'user@company.com',
  password: 'api-token',
  baseUrl: 'https://company.atlassian.net/wiki',
  concurrency: 5,
  dryRun: false,
  resume: false,
  fresh: false,
  logLevel: 'info' as const,
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterRatio: 0.1,
  },
};

const runner = new ExportRunner(config);
const result = await runner.run();

console.log(`Exported ${result.processedPages} pages`);
```

## Documentation Artifacts

- Specification: `specs/001-confluence-exporter/spec.md`
- Implementation Plan: `specs/001-confluence-exporter/plan.md`
- Task Breakdown: `specs/001-confluence-exporter/tasks.md`
- Data Model: `specs/001-confluence-exporter/data-model.md`
- API Contracts: `specs/001-confluence-exporter/contracts/confluence-api.md`

## License

MIT License - see [LICENSE](LICENSE) for details.

## Changelog

### v1.0.0
- Initial release
- Complete space export functionality
- Hierarchical Markdown conversion
- Attachment support
- Resume mode
- Comprehensive error handling
- Performance optimization
