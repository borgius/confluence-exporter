# Feature Specification: Confluence Space to Markdown Extraction Library

**Feature Branch**: `001-confluence-exporter`  
**Created**: 2025-09-29  
**Status**: Draft  
**Input**: User description: "I like to build library that, fetch all pages from confluence space, and convert it to markdown format. Later I like to build RAG system using that files (just keep in mind). it should save it to spaces/<space_name> folder with the same folder structure as on confluence."

## Execution Flow (main)
```
1. Parse feature description (DONE)
2. Extract key concepts: Confluence space, pages (hierarchical), export to Markdown, preserve structure, local storage under spaces/<space_key_or_name>, future RAG usage.
3. Identify ambiguities (marked below with [NEEDS CLARIFICATION: …])
4. Define user scenarios (primary + acceptance + edge cases)
5. Generate functional requirements (testable, numbered)
6. Identify key entities (Space, Page, Asset, ExportJob, LinkReference)
7. Checklist gating readiness
8. Return: Spec ready for planning
```

---

## ⚡ Quick Guidelines (Contextualized)
- Focus: Provide a reliable, repeatable export of a full Confluence space hierarchy to local Markdown for downstream knowledge/RAG usage.
- Out of scope: Building the RAG pipeline itself, semantic chunking, embedding generation (future phases).
- Must emphasize correctness (structure fidelity), completeness (all page content), and traceability (mapping pages → files).

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As a developer or knowledge engineer, I want to fetch all pages from a given Confluence space and store them locally as Markdown files mirroring the original hierarchy so that I can later feed them into a Retrieval Augmented Generation (RAG) system without re-scraping Confluence.

### Acceptance Scenarios
1. **Given** a valid Confluence space key and accessible credentials, **When** I run the export, **Then** a `spaces/<space_key>/` directory is created containing Markdown files whose folder structure matches the parent/child hierarchy from Confluence.
2. **Given** pages containing rich text (headings, lists, code blocks, inline links, images), **When** the export finishes, **Then** each construct is represented in Markdown with no loss of semantic structure (e.g., headings preserved, code fenced, lists ordered/unordered correctly).
3. **Given** the export completes successfully, **When** I inspect internal links between pages, **Then** relative links resolve to the correct local Markdown counterparts.
4. **Given** a page is updated in Confluence after an initial export, **When** I rerun incremental export, **Then** only changed/new pages are re-downloaded, deleted pages are removed locally, and a log/manifest delta lists added/updated/removed counts.
5. **Given** an export is interrupted (network failure or user cancellation), **When** I restart the process without specifying a mode, **Then** the tool MUST refuse to proceed and instruct me to choose either `--resume` or `--fresh` explicitly; `--resume` reuses prior manifest/temp state to process only incomplete pages, while `--fresh` performs a clean restart deleting partial temp artifacts.
6. **Given** a space has attachments (images), **When** the export succeeds, **Then** all attachments are downloaded and referenced with relative paths in Markdown consistent across the space.
7. **Given** pages contain macros that reference other pages (e.g., list-children macro, user mentions), **When** the export processes these pages, **Then** all referenced pages are automatically discovered, added to the download queue, and exported even if they were not initially part of the space traversal, with the queue state persisted to disk after each modification.

### Edge Cases
- Space contains extremely deep hierarchy (>7 levels). Handling depth without path length or recursion failure.
- Circular-like link references (A links to B, B links back to A): ensure no infinite processing.
- Large pages exceeding size limits (e.g., >1MB of content).
- Pages with restricted permissions: skip with logged warning (default policy; export continues with manifest status "access_denied").
- Deleted pages encountered in index vs API delivering stale references.
- Non-ASCII characters in titles → filesystem-safe slug collisions (two pages with same sanitized name) resolved by appending short stable page ID fragment.
- Attachment filename collisions.
- Rate limiting / API throttling from Confluence handled with exponential backoff + jitter respecting Retry-After header.
- Download queue grows exponentially due to deeply interconnected page references: implement queue size limits and circular reference detection.
- Queue persistence corruption during write operations: system must recover gracefully and rebuild queue from manifest state using corruption detection (T137) and recovery mechanisms (T085) that validate checksums and restore from last known good state.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST export all pages for a specified Confluence space into `spaces/<space_key>/`.
- **FR-002**: System MUST implement hierarchy mapping strategy: Each page becomes a single `.md` file; directories are only created to reflect nesting (no forced directory per page). (Chosen via Clarification Session 2025-09-29: Option B)
- **FR-003**: System MUST convert Confluence storage/representation format to CommonMark-compatible Markdown (headings, paragraphs, bold/italic, code, tables, lists, block quotes, panels/admonitions where feasible).
- **FR-004**: System MUST map internal page links to relative links between exported Markdown files.
- **FR-005**: System MUST export page metadata (title, original URL, last modified timestamp, page ID) as a front matter block or header section.
- **FR-006**: System MUST download ALL attachments (images and other binary assets) into a deterministic `assets/` subtree (e.g., `assets/<page-slug>/` or shared hashed path) and rewrite page references to relative local paths; failure to download an attachment counts as a page warning but does not fail the whole run unless attachment failures exceed 20% of total attachments OR more than 25 individual failures (whichever threshold is reached first).
- **FR-007**: System MUST produce a manifest file (e.g., `spaces/<space_key>/manifest.json` or `.yml`) enumerating all exported pages with their source IDs and file paths.
- **FR-008**: System MUST provide deterministic file naming (documented slugification). On slug collision, append short stable page ID fragment: `slug--<pageIdSuffix>.md` (chosen Option A) ensuring uniqueness without reorder.
- **FR-009**: System MUST log progress (at minimum: pages processed, pages remaining, warnings, failures).
- **FR-010**: System MUST exit with non-zero status if any page failed to export (unless failures are explicitly allowed via `--allow-failures` flag). Default policy: skip restricted pages with warning but fail on other errors.
- **FR-011**: System MUST provide full incremental export: detect changed pages (timestamp or hash), add new pages, update modified pages, and remove locally deleted pages; manifest MUST reflect deltas.
- **FR-012**: System MUST avoid duplicate network fetches for already processed pages in a single run.
- **FR-013**: System MUST handle rate limits & transient network/server errors using exponential backoff with jitter for up to 6 attempts: delays ~0.5–0.75s, 1–1.5s, 2–3s, 4–6s, 8–12s, 16–24s; if `Retry-After` header present, first delay MUST honor it (capped at 30s) overriding calculated value; failures after final attempt are counted and surfaced in exit status.
- **FR-014**: System MUST provide a dry-run mode that lists planned exports without writing files.
- **FR-015**: System MUST validate final Markdown files for basic structure (no empty required metadata fields).
- **FR-016**: System MUST support configuration of space identifier input (space key vs name) while internally resolving canonical key.
- **FR-017**: System MUST allow filtering by root page to limit scope (included in MVP for focused exports).
- **FR-018**: System SHOULD provide checksum or hash for exported content to detect changes externally (future RAG pipeline integration) — optional in MVP, deferred to post-MVP.
- **FR-019**: System MUST provide a deterministic exit code mapping so automation/CI can distinguish outcomes without parsing logs (see Exit Codes section). At minimum: success, content failures (including attachment threshold breach), invalid usage/config, interrupted (graceful abort on second SIGINT), and resume-required state MUST be uniquely identifiable.
- **FR-020**: System MUST produce output path stable across runs (idempotent naming) to facilitate downstream indexing.
 - **FR-021**: After a previously interrupted export is detected (presence of partial manifest / temp markers), the tool MUST require an explicit `--resume` or `--fresh` flag; default (no flag) MUST abort with clear guidance. `--resume` processes only missing/failed pages reusing valid artifacts; `--fresh` discards temp state and re-exports all pages.

### Markdown Cleanup Requirements
- **FR-022**: System MUST apply typographic improvements including smart quotes, apostrophes, ellipses, and proper dash usage to exported markdown files automatically as post-processing
- **FR-023**: System MUST normalize heading formats to use consistent title case styling across all exported pages
- **FR-024**: System MUST implement smart word wrapping that respects sentence boundaries and maintains readability with a target line length of 92 characters
- **FR-025**: System MUST clean up export artifacts including unnecessary escapes, empty HTML comments, and malformed links from the markdown transformation process
- **FR-026**: System MUST normalize boldface formatting to ensure consistent punctuation handling
- **FR-027**: System MUST reposition footnotes to follow punctuation marks according to typographic conventions
- **FR-028**: System MUST preserve code blocks, mathematical notation, frontmatter, and other special content without modification during cleanup
- **FR-029**: System MUST provide different cleanup intensity levels (light/standard/heavy) with heavy cleanup as the default for automatic processing
- **FR-030**: System MUST maintain document structure and semantic meaning while improving presentation quality
- **FR-031**: System MUST implement partial cleanup strategy where individual cleanup rules can fail independently without affecting successful rule application
- **FR-032**: System MUST allow users to disable cleanup entirely via CLI flag for debugging or compatibility purposes

### Queue Architecture Requirements (Two-Queue Model)
The system now distinguishes two coordinated queues:
1. PageDownloadQueue: Responsible for scheduling and fetching the minimal required raw page + attachment metadata from Confluence (and any lightweight index data). Items enter here via initial space traversal and dynamic discovery.
2. PageProcessingQueue: Responsible for enrichment, additional API fetches (e.g., expanded bodies, attachments), link discovery, transformation to Markdown, cleanup, and final persistence to disk.

- **FR-033**: System MUST implement two distinct persistent queues: PageDownloadQueue (raw fetch) and PageProcessingQueue (post-fetch enrichment + transformation). No page may be transformed or written until it has successfully transitioned from the download queue to the processing queue.
- **FR-034**: System MUST persist BOTH queues atomically after each structural mutation (enqueue, dequeue, status change) so that after interruption all pending and in-progress items for each lifecycle stage can be recovered without duplication.
- **FR-035**: System MUST automatically enqueue newly discovered pages (macros, user mentions, inline links, embedded content) into the PageDownloadQueue during processing; discovery MUST NOT insert directly into the processing queue.
- **FR-036**: System MUST process the PageDownloadQueue in breadth-first order; upon successful raw fetch of a page's base metadata/content stub it MUST enqueue a corresponding item into the PageProcessingQueue (status transition recorded) while marking the original download entry completed.
- **FR-037**: System MUST prevent infinite loops across both queues by maintaining a unified processed/seen page ID registry; failed pages MAY be re-queued (with incremented retry count) into the appropriate queue stage they failed in, respecting retry/backoff constraints.
- **FR-038**: System MUST persist queue state in structured JSON including (for each item): pageId, queueType (download|processing), discoverySource (initial|macro|reference|retry), discoveryTimestamp, retries, status (pending|in-progress|completed|failed), lastTransitionTimestamp, and (if processing queue) contentHash (post-transformation) and outputPath once written.
- **FR-039**: System MUST handle persistence write failures for either queue gracefully by logging a warning and retaining in-memory state, retrying persistence opportunistically; a detected on-disk corruption MUST trigger recovery that merges intact records and avoids data loss (ties into corruption detection/recovery tasks referenced earlier T137/T085).
- **FR-040**: System MUST emit per-queue and cross-queue metrics: downloadQueue { pending, inProgress, completed, failed, discoveredThisRun }, processingQueue { pending, inProgress, completed, failed }, plus avgTransitionLatency (discovery → written) and cumulative newlyDiscovered count; these feed progress logging and final manifest stats.
 - **FR-040**: System MUST emit per-queue and cross-queue metrics: downloadQueue { pending, inProgress, completed, failed, discoveredThisRun }, processingQueue { pending, inProgress, completed, failed }, plus avgTransitionLatency (mean time from initial discovery enqueue → final successful write), cumulative newlyDiscovered count (total unique pages added to download queue this run), and transitionThroughput (completed transitions per unit time) to feed progress logging and final manifest stats.

### Queue Control & Interrupt Handling
- **FR-041**: The `--limit <N>` CLI option MUST cap only the initial seeding size of the PageDownloadQueue (first wave of root/space pages). Dynamically discovered pages (links, macros, mentions) MUST still be enqueued beyond this limit. The limit MUST NOT directly constrain the PageProcessingQueue.
- **FR-042**: On first SIGINT (Ctrl-C) the system MUST: (a) stop accepting new items into the PageDownloadQueue (freeze seeding & discovery enqueue operations), (b) allow the PageProcessingQueue to continue draining in-flight pages to persist already downloaded content, and (c) log a structured message indicating "graceful shutdown phase 1". On second SIGINT before draining completes, the system MUST immediately persist current state of both queues and manifest (atomic writes) and exit with a specific interrupt exit code while marking any still-pending items as 'aborted'.

### Non-Functional / Quality Constraints
- **NFR-001**: Export of a medium space (300-700 pages, light attachments) MUST complete within 10 minutes with standard network conditions (baseline target for performance validation).
- **NFR-002**: Memory usage MUST remain below 300MB RSS during export processing (streaming preferred over full in-memory graph).
- **NFR-003**: All filesystem writes MUST be atomic (write temp then move) to prevent partial file corruption.
- **NFR-004**: Logs MUST be structured as line-delimited JSON with required fields: level, timestamp, message, context.
- **NFR-005**: Tool MUST be usable in CI environments (non-interactive). Authentication MUST use HTTP Basic Auth with a Confluence username and password provided via environment variables (e.g., `CONFLUENCE_USERNAME`, `CONFLUENCE_PASSWORD`) or CLI flags; credentials MUST be encoded as `Authorization: Basic <base64(username:password)>` without interactive prompts when running headless.
- **NFR-006**: Markdown cleanup processing MUST complete within 1 second per individual markdown file to support interactive workflows and maintain overall export performance

### Architecture Note: Two-Queue Workflow
The export lifecycle is explicitly split into two queues to improve resilience, parallelism, and clarity of failure handling:
1. PageDownloadQueue: Seeds from the initial space tree plus dynamic discoveries; performs lightweight fetch (page metadata + minimal body or expansion required to qualify existence) and stores raw content/attachment references.
2. PageProcessingQueue: Accepts only successfully downloaded pages; performs enrichment (additional API expansions, attachment downloads), link discovery (adding new pages back into the PageDownloadQueue), transformation to Markdown, cleanup, and final atomic write to disk.

This separation enables: (a) clearer retry semantics (network/raw fetch vs transformation failures), (b) staged persistence for resume, (c) breadth-first exploration that can overlap with deeper processing, and (d) precise metrics for transition latency and bottleneck analysis. The UnifiedPageRegistry prevents duplicate traversal while still allowing failed stages to re-enter at the correct point.

Graceful Interrupt Flow: A first Ctrl-C transitions the system into a quiescing mode: the PageDownloadQueue is frozen (no new seeds or discoveries accepted) while the PageProcessingQueue continues until empty or forcibly aborted. A second Ctrl-C forces an immediate flush of in-memory queue/manifest state to disk and exits. This two-stage termination ensures partial progress is safely captured without risking corruption while still offering fast abort if the user insists.

### Exit Codes (FR-019)
| Exit Code | Name | Trigger Conditions |
|-----------|------|--------------------|
| 0 | SUCCESS | All required pages exported, no disallowed failures, attachment failures below thresholds |
| 1 | CONTENT_FAILURE | One or more page exports failed (non-restricted) OR attachment failure threshold (FR-006) exceeded |
| 2 | INVALID_USAGE | Invalid CLI flags / configuration / mutually exclusive options / missing required args |
| 3 | INTERRUPTED | User issued second SIGINT before graceful drain completed (FR-042) |
| 4 | RESUME_REQUIRED | Prior interrupted state detected but neither --resume nor --fresh provided (FR-021) |
| 5 | VALIDATION_ERROR | Markdown validation (FR-015) or manifest structural validation unrecoverable |

Notes:
- Restricted pages skipped do NOT trigger CONTENT_FAILURE unless policy changes via future flag.
- Additional codes MAY be added post-MVP; existing codes are stable.
- FR-010 references code 1 conditions; FR-021 references code 4; FR-042 references code 3.

### Clarifications & Precisions

#### FR-006 Attachment Failure Threshold
- Percentage denominator: total attempted attachment downloads (success + failure) excluding attachments skipped due to permission (those are logged separately and not counted as failures).
- Evaluation timing: threshold applied continuously after each failure; early abort allowed once either 20% OR 25 absolute failures reached (whichever first). Final summary MUST state counts and which condition triggered (if any).

#### FR-013 Backoff / Jitter Model
- Base schedule (pre-jitter): 0.5s, 1s, 2s, 4s, 8s, 16s.
- Jitter: multiply each base delay by a random factor uniformly sampled in [1.0, 1.5]; resulting practical ranges match documented (e.g., 0.5–0.75s, 1–1.5s, ... 16–24s).
- If `Retry-After` header present on any retryable response: first retry delay = min(headerValueSeconds, 30). Subsequent retries revert to exponential sequence (still honoring jitter) unless another Retry-After appears.
- Retry budget: max 6 attempts (initial + 5 retries) unless explicitly extended later; after final failure classify error for exit status logic (FR-010 / FR-019 mapping).

#### FR-040 Metrics Definitions
- avgTransitionLatency: arithmetic mean over all pages successfully written: (writeTimestamp - discoveryEnqueueTimestamp).
- discoveredThisRun: count of unique page IDs first seen in this execution (excludes pages only revalidated by incremental planner).
- transitionThroughput: rolling rate (#successful transitions from download→processing per 30s window) MAY be logged but is optional in manifest summary.
- pending counts exclude in-progress items; failed counts accumulate until run end (do not decrement on retry requeue – retries create a new attempt but original failure still logged separately in error metrics).

#### Cleanup Intensity Mapping (FR-029)
| Intensity | Included Rules |
|-----------|----------------|
| light | Minimal artifact removal (FR-025 subset), heading normalization (FR-023), typography (FR-022) |
| standard | light + word wrap (FR-024), footnote reposition (FR-027), boldface punctuation (FR-026) |
| heavy (default) | standard + full artifact cleanup (all FR-025 patterns) + aggressive whitespace normalization (implementation detail) |

Users selecting `--cleanup-intensity=light` or `standard` MUST still receive structure-preserving guarantees (FR-030). Disabling cleanup (`--disable-cleanup`) bypasses all rules except mandatory safety steps (e.g., front matter preservation).

#### Admonition / Panel Handling
- Confluence panels / admonitions are rendered into block quotes with a standardized prefix (e.g., `> **Note:**`) — they are NOT altered by typography rules beyond general punctuation normalization.
- Cleanup rules must not strip semantic labels (Note, Warning, Info) if present.

#### Markdown Validation Scope (FR-015)
- Required front matter keys: title, pageId, sourceUrl, lastModified (ISO 8601), exportTimestamp.
- Empty or malformed required fields trigger VALIDATION_ERROR (exit 5) unless `--allow-failures` is set, in which case they count toward CONTENT_FAILURE conditions instead.

#### Resume Guard (FR-021) Interaction
- On detecting interrupted artifacts, absence of explicit mode sets exit code 4 with clear guidance to rerun using `--resume` or `--fresh`.

#### Duplicate Fetch Prevention (FR-012)
- UnifiedPageRegistry MUST guarantee at-most-once raw fetch per page per run unless a prior attempt failed before any body content was received; in that case a retry is permitted and does not violate dedupe semantics.

#### Metrics Emission Reliability
- Metrics logging SHOULD NOT abort export if emission fails; log at WARN and continue (ties to resilience principle).

### Key Entities
- **Space**: Logical grouping of pages; attributes: key, name, base URL.
- **Page**: Content node with: id, title, parent id (nullable), body storage format, last modified timestamp, version.
- **Attachment**: Binary asset with id, parent page id, filename, media type, download link.
- **ExportJob**: Run-level metadata (start time, end time, pages total, pages succeeded, pages failed, mode=full|incremental, flags).
- **ManifestEntry**: Mapping of page id → local relative path, hash, last exported timestamp.
- **LinkReference**: Internal cross-link needing rewrite to local Markdown path.
- **CleanupRule**: Individual markdown formatting transformation rule with priority, configuration, and content type restrictions.
- **CleanupResult**: Outcome of applying cleanup rules including success status, changes applied, and processing metrics.
- **CleanupStats**: Aggregate cleanup statistics including documents processed, processing time, rules applied, and error counts.
- **MarkdownCleanupConfig**: Configuration for cleanup intensity, line length targets, and rule enablement settings.
- **DownloadQueue**: Global queue managing pages requiring processing; attributes: queue items, persistence state, statistics.
- **QueueItem**: Individual queue entry with: page id, source type (initial|macro|reference), discovery timestamp, retry count, processing status, parent page id (optional).
- **QueuePersistence**: Disk-based queue state management with: file path, serialization format, atomic write operations, recovery mechanisms.
 - **PageDownloadQueue**: First-stage queue containing pages awaiting raw fetch; minimal metadata until fetch completes.
 - **PageProcessingQueue**: Second-stage queue containing pages whose raw fetch succeeded and now require enrichment, link analysis, transformation, cleanup, and write.
 - **QueueTransition**: Conceptual lifecycle record capturing movement from download to processing (timestamps, latency, retry lineage) for metrics.
 - **UnifiedPageRegistry**: Deduplicated set of all seen page IDs with state flags (seen, downloaded, processed) leveraged to prevent infinite loops across both queues.

---

## Review & Acceptance Checklist
### Content Quality
- [ ] No implementation details (specific libraries, languages, SDKs) introduced
- [ ] Focused on user value (reliable export) over implementation
- [ ] Written for non-technical stakeholders yet testable
- [ ] Mandatory sections completed

### Requirement Completeness
- [ ] All critical behaviors captured
- [ ] Each requirement testable
- [ ] Ambiguities enumerated with [NEEDS CLARIFICATION]
- [ ] Success criteria measurable (where possible)
- [ ] Scope bounded (excludes downstream RAG processing)
- [ ] Dependencies/assumptions noted (Confluence API availability, credentials)

---

## Execution Status
*Initialized (to be updated during planning/execution automation)*
- [ ] User description parsed
- [ ] Key concepts extracted
- [ ] Ambiguities marked
- [ ] User scenarios defined
- [ ] Requirements generated
- [ ] Entities identified
- [ ] Review checklist passed

---

## Clarifications

### Session 2025-09-29
- Q: How should the Confluence page hierarchy map to the local filesystem for the initial version? → A: Option B (single file per page; folders only for nesting)
- Q: How should attachments (images and other binary assets) be handled in the initial export? → A: Option A (always download all attachments; rewrite links to relative paths)
- Q: Should incremental export (detecting and updating only changed pages) be included in the MVP? → A: Option A (full incremental support: add/update/remove)
- Q: How should slug/file name collisions be resolved when two pages sanitize to the same slug? → A: Option A (append short page ID)
- Q: What retry/backoff policy should apply when the Confluence API returns rate limit or transient errors? → A: Option B with Retry-After (exponential jittered backoff, 6 attempts, honor Retry-After)
 - Q: When an export is interrupted how should restart behavior work by default? → A: Option D with mandatory explicit flag if interrupted (require `--resume` or `--fresh` on next run; no implicit default)
 - Q: Which authentication mechanism should the CLI implement for Confluence access? → A: Basic Auth (username + password; no token/email) via `Authorization: Basic` header, non-interactive friendly.
- Q: How should the markdown cleanup be integrated into the existing transformation workflow? → A: Automatic post-processing: Always runs after each transformation without user intervention
- Q: What should be the target line length for smart word wrapping? → A: 92 characters: Flowmark's default compromise between readability and modern displays
- Q: How should the system handle cleanup failures or corrupted markdown files? → A: Partial cleanup: Apply only successful cleanup rules, skip problematic ones
- Q: What should be the default cleanup intensity level for automatic processing? → A: Heavy: All cleanup rules including aggressive export artifact removal
- Q: What should be the acceptable processing time for cleanup per markdown file? → A: Under 1 second: Fast enough for interactive workflows
