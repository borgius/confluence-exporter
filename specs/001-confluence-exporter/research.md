# Research & Decisions

Date: 2025-09-29  
Feature: Confluence Space to Markdown Extraction Library  
Spec: `specs/001-confluence-exporter/spec.md`

## Decision Log

### 1. Permissions Handling (Restricted Pages)
- Decision: Skip restricted pages; record warning, include in manifest with `access:"denied"`; exit non-zero only if >0 unrestricted page failures.
- Rationale: Preserves maximal export continuity without aborting due to a minority of restricted pages.
- Alternatives: (a) Fail entire run (harsh, blocks partial value); (b) Silent skip (loses audit trace).

### 2. Attachment Failure Threshold
- Decision: Threshold = 20% failed attachments OR >25 individual failures triggers non-zero exit.
- Rationale: Percentage guards proportional loss; absolute count catches clustering.
- Alternatives: Fixed percentage only (less granular), fixed absolute only (ignores scale).

### 3. Logging Format
- Decision: Line-delimited JSON `{time,level,msg,context}` + final human summary.
- Rationale: Machine parsable for CI pipelines, simple to stream.
- Alternatives: key=value (harder nested context), structured pretty (slower, larger output).

### 4. Authentication Mechanism (CI Friendly)
- Decision: HTTP Basic Auth using username + password via env vars: `CONFLUENCE_BASE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_PASSWORD`. Construct header `Authorization: Basic base64(username:password)`. No interactive prompt in non-TTY environments; optional prompt only if one or both missing and TTY.
- Rationale: Simplicity and broad Confluence support without token management; aligns with requirement for non-interactive CI usage.
- Alternatives: (a) API token + email (rejected per product directive), (b) OAuth 2.0 (added complexity, not needed), (c) PAT stored in config file (security risk in shared runners).

### 5. Performance Target Refinement
- Decision: Target ≥1.2 pages/sec average for 500-page space with concurrency=5, finishing <7 minutes typical; allow up to 10 minutes ceiling.
- Rationale: Provides measurable instrumentation goal and headroom.
- Alternatives: Unspecified (<10 min only) lacks actionable tuning guidance.

### 6. Memory Ceiling
- Decision: Keep process RSS <300MB; stream each page (no full graph in memory), maintain only manifest map and link rewrite index.
- Rationale: Aligns with constitution performance budgets.
- Alternatives: Load-all approach (risk OOM on large spaces).

### 7. Root Page Filter & Title Rename Scope
- Decision: Include root page filter in MVP; defer title rename redirect mapping to post-MVP (log detection only now).
- Rationale: Root filtering has clear user value; rename mapping adds complexity with low immediate necessity.
- Alternatives: Implement rename redirects now (longer delivery time).

### 8. HTTP Client & Retry Strategy
- Decision: Use `axios` + custom retry interceptor implementing exponential jitter & `Retry-After` logic; abort after 6 attempts.
- Rationale: Full control and alignment with spec-defined backoff.
- Alternatives: `got` built-in retry (less control over custom jitter windows).

### 9. Markdown Conversion Strategy
- Decision: Implement pluggable transformer: interface `IContentTransformer` so future specialized Atlassian converters can slot in; initial basic mapping of headings, lists, code, tables, links, images.
- Rationale: Extensibility without premature library lock-in.
- Alternatives: Hard-code one converter (inflexible) or adopt heavy dependency early.

### 10. Concurrency Management
- Decision: Use `p-limit` with default concurrency=5 (configurable via `--concurrency` or env). Attach adaptive slowdown if consecutive 429 responses exceed threshold (reduce concurrency by 1 down to min 1).
- Rationale: Balances throughput with rate limit compliance.
- Alternatives: Static concurrency only (less resilient to 429 storms).

### 11. Manifest Hashing
- Decision: SHA-256 of canonical Markdown content trimmed to 12 hex chars for change detection stored in manifest.
- Rationale: High collision resistance; substring keeps manifest compact.
- Alternatives: Last-mod timestamp only (miss silent content revert), full hash length (larger file size).

### 12. Resumability Markers
- Decision: Create `.export-in-progress` sentinel file + journal `resume.log` listing completed page IDs; on graceful completion remove both; on resume use journal to skip already persisted pages.
- Rationale: Minimal complexity while robust to interruption.
- Alternatives: DB-based checkpointing (overkill), relying solely on manifest (ambiguous partial state).

### 13. Slugification Rules
- Decision: lowercase, trim, NFC normalize, replace spaces & `/` with `-`, remove non `[a-z0-9-]`, collapse multiple `-`, cap length 120; collision resolution `slug--<pageIdSuffix>`.
- Rationale: Predictable and filesystem safe.
- Alternatives: Keep Unicode (risk cross-platform inconsistencies).

### 14. Logging Fields
- Decision: Fields: time (ISO), level, msg, pageId (optional), attempt (optional), durationMs (where relevant), errorCode.
- Rationale: Supports troubleshooting & metrics extraction.
- Alternatives: Minimal fields only (less observability).

### 15. Testing Strategy Overview
- Decision: Jest with separate config sections (unit vs integration via naming convention). Contract tests use `nock` fixtures. Integration tests create temp directory; verify manifest, paths, links.
- Rationale: Standard ecosystem tooling, good developer familiarity.
- Alternatives: Vitest (lighter) deferred until potential performance need.

## Open Items (Defer to Later Phase)
- Exact attachment failure absolute threshold tuning after initial real-run metrics.
- Advanced storage format features (macros, panels beyond admonitions) extension interface.
- Title rename redirect mapping logic (Phase 2+ backlog).

## Verification
All previously flagged NEEDS CLARIFICATION items now have a decision or explicit deferral with rationale.
