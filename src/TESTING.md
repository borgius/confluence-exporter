# Testing Guide for Minimal Confluence Exporter

## Quick Start

### 1. Build the Project

```bash
cd src2
npm install
npm run build
```

### 2. Set Up Your Confluence Credentials

You have two options:

#### Option A: Environment Variables (Recommended)

```bash
export CONFLUENCE_BASE_URL="https://your-instance.atlassian.net"
export CONFLUENCE_USERNAME="your-email@example.com"
export CONFLUENCE_PASSWORD="your-api-token-or-password"
export CONFLUENCE_SPACE_KEY="YOURSPACE"
export OUTPUT_DIR="./test-output"
```

**Note for Atlassian Cloud:** Use an API token instead of password:
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Create a new API token
3. Use your email as username and the token as password

#### Option B: Command Line Arguments

```bash
npm run start -- <baseUrl> <username> <password> <spaceKey> [outputDir]
```

Example:
```bash
npm run start -- https://mysite.atlassian.net user@example.com mytoken MYSPACE ./output
```

### 3. Run the Exporter

#### Using the test script:
```bash
./test.sh
```

#### Or directly:
```bash
npm run start
```

#### Or with the compiled JavaScript:
```bash
node dist/index.js
```

## Expected Output

You should see output like:

```
╔════════════════════════════════════════════════════╗
║   Minimal Confluence to Markdown Exporter         ║
╚════════════════════════════════════════════════════╝

Starting export of space: MYSPACE
Output directory: ./output
[1] Processing: Getting Started (123456)
  ✓ Saved: getting-started.md
[2] Processing: User Guide (234567)
  ✓ Saved: user-guide.md
[3] Processing: API Documentation (345678)
  ✓ Saved: api-documentation.md

Export complete! Processed 3 pages.
Files saved to: ./output

✓ Export completed successfully!
```

## Verify the Results

Check the output directory for markdown files:

```bash
ls -la ./output/
cat ./output/getting-started.md
```

Each file should contain:
- YAML front matter with metadata
- Converted markdown content

Example:
```markdown
---
title: "Getting Started"
id: "123456"
version: 5
parentId: "789012"
---

# Getting Started

This is the page content...
```

## Troubleshooting

### Authentication Errors

If you see `401 Unauthorized`:
- Verify your credentials are correct
- For Atlassian Cloud, ensure you're using an API token, not your password
- Check that your base URL is correct (should be like `https://yoursite.atlassian.net`)

### Space Not Found

If you see `404 Not Found`:
- Verify the space key is correct (it's case-sensitive)
- Ensure you have access to the space

### No Pages Exported

If no pages are exported:
- Check that the space contains pages
- Verify you have read permissions on the space
- Try with a different space

### Build Errors

If `npm run build` fails:
- Ensure you have Node.js 18+ installed: `node --version`
- Run `npm install` again
- Check for TypeScript errors in the code

## Testing with Different Spaces

You can test with multiple spaces by changing the environment variable:

```bash
export CONFLUENCE_SPACE_KEY="SPACE1"
npm run start

export CONFLUENCE_SPACE_KEY="SPACE2"
export OUTPUT_DIR="./output-space2"
npm run start
```

## NPM Scripts Reference

- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run the compiled exporter
- `npm run clean` - Remove dist directory
- `npm run rebuild` - Clean and rebuild
- `npm run dev` - Build and run in one command

## Example: Testing with a Public Confluence Instance

If you have access to a test Confluence instance, you can use it like this:

```bash
cd src2

# Build
npm run build

# Set credentials
export CONFLUENCE_BASE_URL="https://test-instance.atlassian.net"
export CONFLUENCE_USERNAME="test@example.com"
export CONFLUENCE_PASSWORD="your-api-token"
export CONFLUENCE_SPACE_KEY="TEST"
export OUTPUT_DIR="./test-export"

# Run
npm run start
```

## Next Steps

After successful testing:
1. Review the exported markdown files
2. Check for any formatting issues
3. Compare with original Confluence pages
4. Report any bugs or missing features

## Limitations to Keep in Mind

This minimal version:
- Uses basic HTML-to-Markdown conversion (may not handle complex macros)
- Doesn't download attachments
- Doesn't rewrite internal links
- Doesn't support incremental exports
- Has no retry logic for failures

For full features, use the main exporter in the `src` directory.
