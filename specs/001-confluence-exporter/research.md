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

## Global Download Queue Decisions (2025-09-29 Update)

### 16. Global Download Queue Architecture
- **Decision**: Implement queue as in-memory Set for tracking with persistent JSON file for state recovery
- **Rationale**: Balance between performance (O(1) lookup), memory efficiency, and resume capability
- **Alternatives**: 
  - SQLite database (rejected: overhead for simple queue operations)
  - Plain array (rejected: O(n) duplicate checking)
  - Redis (rejected: external dependency complexity)

### 17. Queue Persistence Strategy
- **Decision**: Atomic writes using temp file + rename pattern; save after every N operations (configurable, default 10) or time interval (30s)
- **Rationale**: Balances crash recovery with I/O performance; atomic writes prevent corruption
- **Alternatives**: 
  - Save after every modification (rejected: performance impact)
  - No persistence (rejected: violates resume requirement)
  - Write-ahead logging (rejected: overcomplicated for single-process tool)

### 18. Circular Reference Detection
- **Decision**: Maintain processed pages set separate from queue; prevent re-queuing already processed pages
- **Rationale**: Simple and effective; supports legitimate re-processing of failed pages
- **Alternatives**: 
  - Depth limiting (rejected: may miss valid deep references)
  - Graph cycle detection (rejected: overcomplicated for this use case)
  - Time-based deduplication (rejected: not deterministic)

### 19. Queue Processing Order
- **Decision**: FIFO queue with breadth-first discovery; process pages in order discovered
- **Rationale**: Ensures systematic coverage; predictable for debugging; supports natural hierarchy processing
- **Alternatives**: 
  - Priority queue by hierarchy depth (rejected: complexity without clear benefit)
  - Parallel processing pools (deferred: complicates error handling and state management)
  - Random order (rejected: unpredictable for testing and debugging)

### 20. Queue Item Metadata
- **Decision**: Store minimal metadata: `{pageId, sourceType, discoveryTimestamp, retryCount, parentPageId?}`
- **Rationale**: Supports debugging and metrics without bloating queue size
- **Alternatives**: 
  - Full page metadata (rejected: memory inefficient, creates coupling)
  - ID-only (rejected: loses debugging context)
  - Rich dependency graph (rejected: overcomplicated for MVP)

### 21. Dependency Discovery Hooks
- **Decision**: Implement discovery via transformer plugins; each transformer can emit discovered page IDs
- **Rationale**: Extensible design; clean separation of content processing and queue management
- **Alternatives**: 
  - Hardcoded discovery patterns (rejected: not extensible)
  - Post-processing discovery (rejected: requires re-parsing content)
  - Regex-based discovery (rejected: fragile for complex content)

### 22. Queue Integration with Existing System
- **Decision**: Queue state stored separately from manifest; manifest tracks completed exports, queue tracks pending work
- **Rationale**: Clear separation of concerns; manifest remains source of truth for exported state
- **Alternatives**: 
  - Combined manifest+queue (rejected: conflates different concerns)
  - Queue as manifest extension (rejected: complicates existing logic)
  - No manifest integration (rejected: loses export traceability)

## Open Items (Defer to Later Phase)
- Exact attachment failure absolute threshold tuning after initial real-run metrics.
- Advanced storage format features (macros, panels beyond admonitions) extension interface.
- Title rename redirect mapping logic (Phase 2+ backlog).
- Queue size monitoring and alerting thresholds fine-tuning.
- Specific discovery patterns for different macro types.
- Integration testing with actual Confluence spaces for queue behavior.

## Queue Implementation Architecture

### Queue Module Structure
```
src/queue/
├── downloadQueue.ts     # Main queue implementation
├── queuePersistence.ts  # Disk persistence operations
├── queueItem.ts         # Queue item data model
├── queueMetrics.ts      # Performance monitoring
└── index.ts             # Public interface
```

### Key Interfaces
```typescript
interface QueueItem {
  pageId: string;
  sourceType: 'initial' | 'macro' | 'reference' | 'user';
  discoveryTimestamp: number;
  retryCount: number;
  parentPageId?: string;
}

interface DownloadQueue {
  add(items: QueueItem[]): Promise<void>;
  next(): Promise<QueueItem | null>;
  markProcessed(pageId: string): Promise<void>;
  markFailed(pageId: string, error: Error): Promise<void>;
  getMetrics(): QueueMetrics;
  persist(): Promise<void>;
  restore(): Promise<void>;
}
```

### Integration Points
1. **ExportRunner**: Initialize queue with initial space pages
2. **EnhancedMarkdownTransformer**: Emit discovered page IDs during transformation
3. **ResumePersistence**: Coordinate queue state with resume journal
4. **ProgressReporter**: Include queue metrics in progress output

## Verification
All previously flagged NEEDS CLARIFICATION items now have a decision or explicit deferral with rationale.
