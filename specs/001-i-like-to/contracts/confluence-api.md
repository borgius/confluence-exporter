# Confluence API Contracts (Subset Used)

Version: Draft 2025-09-29

## Authentication
All requests MUST include HTTP Basic Auth header constructed from username and password:
```
Authorization: Basic base64(username:password)
```
Environment variables `CONFLUENCE_USERNAME` and `CONFLUENCE_PASSWORD` supply credentials; no interactive prompts in CI.

## GET /rest/api/space/{spaceKey}
Response (200):
```json
{
  "key": "SPACE",
  "name": "Space Name",
  "_links": {"webui": "/spaces/SPACE/overview"}
}
```

## GET /rest/api/space/{spaceKey}/content?limit={n}&start={cursor}
Paginated listing of root (or filtered) pages.

Response (200):
```json
{
  "results": [
    {"id": "123", "type": "page", "title": "Root Page", "version": {"number": 7}},
    {"id": "124", "type": "page", "title": "Child A", "version": {"number": 3}}
  ],
  "start": 0,
  "limit": 25,
  "size": 2,
  "_links": {"next": "/...start=25"}
}
```

## GET /rest/api/content/{id}?expand=body.storage,version,ancestors
Response (200):
```json
{
  "id": "123",
  "type": "page",
  "title": "Root Page",
  "version": {"number": 7},
  "ancestors": [{"id": "10"}],
  "body": {"storage": {"value": "<p>Hello</p>", "representation": "storage"}}
}
```

## GET /rest/api/content/{id}/child/attachment?limit={n}&start={cursor}
Response (200):
```json
{
  "results": [
    {"id": "att1", "title": "image.png", "metadata": {"mediaType": "image/png"}, "_links": {"download": "/download/attachments/123/image.png"}}
  ],
  "_links": {"next": null}
}
```

## Rate Limiting / Errors
- 429: Includes `Retry-After` header (seconds). Client MUST honor.
- 5xx: Retry with backoff per RetryPolicy.

## Internal Interface Contracts
### IContentTransformer
```ts
interface IContentTransformer {
  toMarkdown(content: { storage: string; pageId: string; title: string }): Promise<string> | string;
}
```

### Export Orchestrator (High-Level)
```ts
interface ExportOrchestrator {
  run(config: ExportConfig): Promise<ExportResult>;
}
```

`ExportConfig` and related types defined in `data-model.md`.

## Assumptions
- Only `storage` representation used for initial MVP.
- Attachments fetched individually via download link.
- Pagination `limit` tuned (default 25) adjustable via future flag.

## Open Items
- Additional expansions (labels, metadata) intentionally deferred.
