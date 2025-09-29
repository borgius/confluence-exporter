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

## 4. Full Export with Queue Discovery
```
confluence-export --space SPACEKEY --out ./spaces --concurrency 5
```
The export automatically discovers additional pages through:
- `list-children` macros in page content
- User mentions and references  
- Internal page links and includes
- All discovered pages are added to the download queue and processed

## 5. Monitor Queue Progress
```
confluence-export --space SPACEKEY --out ./spaces --verbose
```
Progress output includes queue metrics:
- Pages discovered and added to queue
- Current queue size and processing rate
- Failed pages and retry attempts
- Estimated time remaining

## 6. Resume vs Fresh After Interruption
```
confluence-export --space SPACEKEY --resume
# or
confluence-export --space SPACEKEY --fresh
```
If interruption detected and neither flag provided, tool aborts with guidance.
- `--resume`: Restores queue state and continues from where interrupted
- `--fresh`: Clears queue state and starts completely over

## 7. Queue State Inspection
After export completion or interruption:
- Queue state: `spaces/SPACEKEY/.queue-state.json` (temporary, cleaned on success)
- Export progress: `spaces/SPACEKEY/.export-in-progress` (sentinel file)
- Processing journal: `spaces/SPACEKEY/resume.log` (completed page IDs)

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

## Testing Queue Functionality

### Test Scenario 1: Basic Queue Discovery
1. Create a space with pages containing `list-children` macros
2. Run export and verify discovered pages are processed
3. Check queue metrics in verbose output
4. Verify all referenced pages appear in final export

### Test Scenario 2: Queue Resume After Interruption  
1. Start export of large space
2. Interrupt process (Ctrl+C) mid-export
3. Verify queue state file exists
4. Resume with `--resume` flag
5. Verify export completes without re-processing completed pages

### Test Scenario 3: Circular Reference Handling
1. Create pages with circular references (A → B → A)
2. Run export and verify no infinite loops
3. Check that all pages are processed exactly once
4. Verify warnings about circular references in logs

### Test Scenario 4: Queue Persistence and Recovery
1. Monitor queue state file during large export
2. Verify state is persisted periodically during processing
3. Simulate corruption of queue state file
4. Verify graceful recovery and queue rebuild from manifest
