# Quickstart Guide: Confluence Space Export

This guide walks you through exporting your first Confluence space in 10 minutes.

## Prerequisites

- Node.js 18 or higher
- Confluence Cloud or Server access
- API token or username/password

## Step 1: Installation

### Option A: Global Installation (Recommended)
```bash
npm install -g confluence-exporter
```

### Option B: Development Setup
```bash
git clone https://github.com/your-org/confluence-exporter.git
cd confluence-exporter
npm install
npm run build
```

## Step 2: Get Your Confluence API Token

### For Confluence Cloud:
1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **"Create API token"**
3. Give it a name: `"Confluence Exporter"`
4. Copy the generated token
5. Save it securely - you'll need it in the next step

### For Confluence Server:
Use your regular username and password.

## Step 3: Set Up Authentication

### Option A: Environment Variables (Recommended)
```bash
export CONFLUENCE_BASE_URL="https://your-domain.atlassian.net/wiki"
export CONFLUENCE_USERNAME="your-email@company.com"  
export CONFLUENCE_PASSWORD="your-api-token-here"
```

### Option B: Configuration File
Create `confluence-config.json`:
```json
{
  "baseUrl": "https://your-domain.atlassian.net/wiki",
  "username": "your-email@company.com",
  "password": "your-api-token-here"
}
```

### Option C: CLI Arguments (Less Secure)
You can also pass credentials directly via CLI (not recommended for production).

## Step 4: Find Your Space Key

1. Go to your Confluence space
2. Look at the URL: `https://company.atlassian.net/wiki/spaces/DOCS/overview`
3. The space key is `DOCS` (after `/spaces/`)

## Step 5: Run a Test Export (Dry Run)

Test your configuration without actually downloading files:

```bash
confluence-exporter \
  --space "DOCS" \
  --out "./test-export" \
  --dry-run
```

You should see output like:
```
[INFO] Confluence Export Starting
[INFO] Space: DOCS
[INFO] Pages found: 47
[INFO] Attachments found: 12
[INFO] Dry run mode - no files will be written
[INFO] Export would create:
  - 47 markdown files
  - 12 attachment files
  - 1 manifest file
[INFO] Estimated size: 2.3 MB
```

## Step 6: Run Your First Real Export

If the dry run looks good, run the actual export:

```bash
confluence-exporter \
  --space "DOCS" \
  --out "./my-confluence-export"
```

You'll see progress output:
```
[INFO] Starting export of space DOCS
[INFO] Discovering pages...
[INFO] Found 47 pages in queue
[INFO] Processing pages... [██████████] 47/47 (100%)
[INFO] Downloading attachments... [████████  ] 8/12 (67%)
[INFO] Finalizing links...
[INFO] Export completed successfully!
```

## Step 7: Explore Your Export

Your export structure will look like this:

```
my-confluence-export/
├── manifest.json              # Export metadata
├── README.md                  # Export summary
├── _attachments/              # All attachments
│   ├── images/
│   ├── documents/
│   └── other/
└── Getting Started.md          # Your pages as Markdown
    ├── User Guide.md
    ├── user-guide/             # Child pages
    │   ├── Installation.md
    │   └── Configuration.md
    └── API Reference.md
```

## Step 8: Verify the Export

### Check the Summary
```bash
cat my-confluence-export/README.md
```

### Count the Files
```bash
find my-confluence-export -name "*.md" | wc -l
```

### Check for Errors
```bash
grep -i error my-confluence-export/export.log
```

## Step 9: Advanced Options

### Resume an Interrupted Export
If your export was interrupted:
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./my-confluence-export" \
  --resume
```

### Export Only Part of a Space
Get the page ID from the URL and use as root:
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./partial-export" \
  --root "123456789"
```

### High Performance Export
For large spaces:
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./fast-export" \
  --concurrency 10 \
  --log-level warn
```

## Step 10: Common Issues and Solutions

### Authentication Errors
**Problem**: `401 Unauthorized`
**Solution**: 
- Double-check your API token
- Ensure you're using email as username, not your display name
- Verify the base URL format

### Permission Errors  
**Problem**: `403 Forbidden`
**Solution**:
- Check that you have permission to view the space
- Verify the space key is correct
- Ask your Confluence admin to grant you access

### Network Timeouts
**Problem**: `ECONNRESET` or `ETIMEDOUT`
**Solution**:
- Reduce concurrency: `--concurrency 2`
- Increase retry delays: `--retry.maxDelayMs 60000`
- Check your network connection

### Memory Issues
**Problem**: `JavaScript heap out of memory`
**Solution**:
- Lower concurrency: `--concurrency 1`
- Export in smaller chunks using `--root`
- Close other applications to free memory

## Next Steps

### For Documentation Sites
Your Markdown files are ready for:
- GitBook
- Docusaurus  
- MkDocs
- Sphinx
- VitePress

### For RAG Systems
The structured Markdown with metadata is perfect for:
- Vector embeddings
- Semantic search
- AI knowledge bases
- Chatbot training

### For Backup/Migration
Use the export to:
- Migrate to another wiki platform
- Create offline documentation
- Backup your knowledge base

## Configuration Reference

### Basic Configuration File
```json
{
  "spaceKey": "DOCS",
  "outputDir": "./export",
  "baseUrl": "https://company.atlassian.net/wiki",
  "username": "user@company.com",
  "password": "api-token",
  "concurrency": 5,
  "logLevel": "info",
  "dryRun": false,
  "resume": false
}
```

### Environment Variables
- `CONFLUENCE_BASE_URL`: Your Confluence URL
- `CONFLUENCE_USERNAME`: Your username/email
- `CONFLUENCE_PASSWORD`: Your API token/password
- `CONFLUENCE_SPACE`: Default space key
- `CONFLUENCE_OUTPUT_DIR`: Default output directory
- `CONFLUENCE_LOG_LEVEL`: Default log level (debug, info, warn, error)
- `CONFLUENCE_CONCURRENCY`: Default concurrency (1-20)

### CLI Options Quick Reference
```bash
confluence-exporter [options]

Required:
  --space, -s <key>           Space key to export
  --out, -o <dir>            Output directory

Authentication:
  --username <email>         Username/email
  --password <token>         API token/password  
  --base-url <url>           Confluence base URL

Options:
  --config <file>            Configuration file path
  --dry-run                  Preview without writing files
  --resume                   Resume interrupted export
  --fresh                    Start fresh (ignore previous state)
  --root <pageId>           Export subtree from this page
  --concurrency, -c <num>    Concurrent requests (1-20)
  --log-level <level>        Logging: debug, info, warn, error
  --help, -h                 Show help
  --version, -v              Show version
```

## Troubleshooting Tips

### Debug Mode
For detailed diagnostics:
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./debug-export" \
  --log-level debug \
  --dry-run
```

### Test Configuration
Verify your setup works:
```bash
# Test authentication
confluence-exporter --space "DOCS" --dry-run

# Test with minimal settings
confluence-exporter \
  --space "DOCS" \
  --out "./test" \
  --concurrency 1 \
  --log-level info
```

### Get Help
1. Check the logs in your output directory
2. Run with `--dry-run` first to validate configuration
3. Use `--log-level debug` for detailed output
4. Try reducing `--concurrency` for network issues

## Advanced Queue Functionality

### Understanding the Queue System

The exporter uses an intelligent queue system that:
1. **Discovers** pages through content analysis
2. **Processes** them in optimal order
3. **Handles** failures with automatic retry
4. **Persists** state for reliable resume

### Queue Discovery Process

The exporter automatically finds pages through:
- **Direct enumeration**: All pages in the space
- **Macro analysis**: `list-children`, `include`, `excerpt-include` macros
- **Link following**: Internal page links and references
- **User mentions**: @username references that link to pages

### Monitoring Queue Progress

Use verbose logging to see queue metrics:
```bash
confluence-exporter \
  --space "DOCS" \
  --out "./export" \
  --log-level info
```

Output includes:
```
[INFO] Queue discovered 47 pages (23 direct, 24 from macros)
[INFO] Processing queue: 45 remaining, 2 completed, 0 failed
[INFO] Queue throughput: 3.2 pages/minute
[INFO] Estimated completion: 14 minutes
```

### Resume After Interruption

If export is interrupted:

1. **Check status**:
   ```bash
   ls -la ./export/.confluence-export/
   # queue-state.json    - Current queue state
   # resume.log          - Completed pages
   # export-progress     - Sentinel file
   ```

2. **Resume safely**:
   ```bash
   confluence-exporter \
     --space "DOCS" \
     --out "./export" \
     --resume
   ```

3. **Or start fresh**:
   ```bash
   confluence-exporter \
     --space "DOCS" \
     --out "./export" \
     --fresh
   ```

### Testing Queue Features

#### Test Discovery
Create a test page with:
```confluence
{list-children:depth=3}
{include:PageName}
@username mentioned here
[Link to Other Page](page-link)
```

Then export and verify all referenced pages are included.

#### Test Resume
1. Start a large export
2. Interrupt with Ctrl+C after some pages complete
3. Resume and verify no duplicate work

#### Test Error Handling
1. Export with some inaccessible pages
2. Verify graceful failure and continued processing
3. Check error summary in final report

## Success! 🎉

You now have your Confluence space exported as clean Markdown files. The structured output is ready for documentation sites, knowledge bases, or AI systems.

**What's Next?**
- Explore the [full documentation](../README.md) for advanced features
- Set up automated exports with cron/scheduled tasks
- Integrate with your documentation pipeline or RAG system
