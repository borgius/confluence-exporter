# Confluence Exporter

Export an Atlassian Confluence space to local Markdown files preserving the hierarchy. Designed for ingestion into RAG (Retrieval-Augmented Generation) and knowledge base pipelines.

## Features

- **Complete Space Export**: Export entire Confluence spaces with full hierarchy preservation
- **Incremental Updates**: Resume mode for efficient incremental exports 
- **Attachment Support**: Download and organize page attachments with configurable thresholds
- **Markdown Conversion**: Convert Confluence storage format to clean, standardized Markdown
- **Link Resolution**: Intelligent cross-reference linking between exported pages
- **Robust Error Handling**: Comprehensive retry policies and error classification
- **Performance Optimized**: Configurable concurrency with memory-efficient processing
- **Dry Run Mode**: Preview exports without writing files
- **Flexible Configuration**: Environment variables, config files, and CLI options

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
- `--resume`: Resume previous interrupted export
- `--fresh`: Start fresh export (ignore previous state)
- `--root <pageId>`: Export only pages under specific root page
- `--log-level <level>`: Logging level: debug, info, warn, error (default: info)
- `--attachment-threshold <number>`: Max attachment failures before aborting (default: 20)

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

```json
{
  "spaceKey": "string (required)",
  "outputDir": "string (required)", 
  "username": "string",
  "password": "string",
  "baseUrl": "string",
  "dryRun": "boolean (default: false)",
  "concurrency": "number (default: 5)",
  "resume": "boolean (default: false)",
  "fresh": "boolean (default: false)",
  "rootPageId": "string (optional)",
  "logLevel": "debug|info|warn|error (default: info)",
  "attachmentThreshold": "number (default: 20)",
  "retry": {
    "maxAttempts": "number (default: 3)",
    "baseDelayMs": "number (default: 1000)",
    "maxDelayMs": "number (default: 30000)",
    "jitterRatio": "number (default: 0.1)"
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
