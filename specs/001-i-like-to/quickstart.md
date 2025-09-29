# Quickstart: Confluence Space Export CLI

## 1. Install
```
npm install -g @local/confluence-export (placeholder until published)
```
(or run via repository clone `npm install` then `node dist/cli/index.js`)

## 2. Set Environment Variables (Basic Auth)
```
export CONFLUENCE_BASE_URL="https://your-domain.atlassian.net"
export CONFLUENCE_USERNAME="your-username"
export CONFLUENCE_PASSWORD="your-password"
```
The CLI constructs `Authorization: Basic base64(CONFLUENCE_USERNAME:CONFLUENCE_PASSWORD)` automatically. Avoid shell history leaks (consider using a secrets manager or prompting without exporting the password permanently).

## 3. Run Dry-Run
```
confluence-export --space SPACEKEY --dry-run
```
Outputs planned page count and hierarchy without writing files.

## 4. Full Export
```
confluence-export --space SPACEKEY --out ./spaces --concurrency 5
```

## 5. Resume vs Fresh After Interruption
```
confluence-export --space SPACEKEY --resume
# or
confluence-export --space SPACEKEY --fresh
```
If interruption detected and neither flag provided, tool aborts with guidance.

## 6. Filter by Root Page
```
confluence-export --space SPACEKEY --root 123456
```
Exports subtree rooted at page ID 123456.

## 7. Inspect Output
- Markdown files: `spaces/SPACEKEY/...`
- Manifest: `spaces/SPACEKEY/manifest.json`
- Assets: `spaces/SPACEKEY/assets/<page-slug>/`

## 8. Exit Status Semantics
- 0: Success within thresholds.
- 1: Page export failures (non-permission) or attachment failure thresholds exceeded.
- 2: Misconfiguration / validation error.

## 9. Logs
Line-delimited JSON. For human summary use `jq` or tail final summary block.

## 10. Next Steps for RAG
- Run embedding pipeline against `spaces/SPACEKEY/**/*.md` excluding assets.
