# Feature Specification: Confluence Space to Markdown Extraction Library

**Feature Branch**: `001-i-like-to`  
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

### Edge Cases
- Space contains extremely deep hierarchy (>7 levels). Handling depth without path length or recursion failure.
- Circular-like link references (A links to B, B links back to A): ensure no infinite processing.
- Large pages exceeding size limits (e.g., >1MB of content).
- Pages with restricted permissions: skip with logged warning vs fail entire export? [NEEDS CLARIFICATION]
- Deleted pages encountered in index vs API delivering stale references.
- Non-ASCII characters in titles → filesystem-safe slug collisions (two pages with same sanitized name) resolved by appending short stable page ID fragment.
- Attachment filename collisions.
- Rate limiting / API throttling from Confluence handled with exponential backoff + jitter respecting Retry-After header.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST export all pages for a specified Confluence space into `spaces/<space_key>/`.
- **FR-002**: System MUST implement hierarchy mapping strategy: Each page becomes a single `.md` file; directories are only created to reflect nesting (no forced directory per page). (Chosen via Clarification Session 2025-09-29: Option B)
- **FR-003**: System MUST convert Confluence storage/representation format to CommonMark-compatible Markdown (headings, paragraphs, bold/italic, code, tables, lists, block quotes, panels/admonitions where feasible).
- **FR-004**: System MUST map internal page links to relative links between exported Markdown files.
- **FR-005**: System MUST export page metadata (title, original URL, last modified timestamp, page ID) as a front matter block or header section.
- **FR-006**: System MUST download ALL attachments (images and other binary assets) into a deterministic `assets/` subtree (e.g., `assets/<page-slug>/` or shared hashed path) and rewrite page references to relative local paths; failure to download an attachment counts as a page warning but does not fail the whole run unless >X% attachments fail (threshold to define in planning).
- **FR-007**: System MUST produce a manifest file (e.g., `spaces/<space_key>/manifest.json` or `.yml`) enumerating all exported pages with their source IDs and file paths.
- **FR-008**: System MUST provide deterministic file naming (documented slugification). On slug collision, append short stable page ID fragment: `slug--<pageIdSuffix>.md` (chosen Option A) ensuring uniqueness without reorder.
- **FR-009**: System MUST log progress (at minimum: pages processed, pages remaining, warnings, failures).
- **FR-010**: System MUST exit with non-zero status if any page failed to export (unless failures are explicitly allowed via a flag). [NEEDS CLARIFICATION: skip vs fail policy]
- **FR-011**: System MUST provide full incremental export: detect changed pages (timestamp or hash), add new pages, update modified pages, and remove locally deleted pages; manifest MUST reflect deltas.
- **FR-012**: System MUST avoid duplicate network fetches for already processed pages in a single run.
- **FR-013**: System MUST handle rate limits & transient network/server errors using exponential backoff with jitter for up to 6 attempts: delays ~0.5–0.75s, 1–1.5s, 2–3s, 4–6s, 8–12s, 16–24s; if `Retry-After` header present, first delay MUST honor it (capped at 30s) overriding calculated value; failures after final attempt are counted and surfaced in exit status.
- **FR-014**: System MUST provide a dry-run mode that lists planned exports without writing files.
- **FR-015**: System MUST validate final Markdown files for basic structure (no empty required metadata fields).
- **FR-016**: System MUST support configuration of space identifier input (space key vs name) while internally resolving canonical key.
- **FR-017**: System MUST allow filtering by root page to limit scope (optional). [NEEDS CLARIFICATION: required for MVP?]
- **FR-018**: System MUST detect and handle page title renames (update slug + redirect mapping file). [NEEDS CLARIFICATION: implement in MVP?]
- **FR-019**: System SHOULD provide checksum or hash for exported content to detect changes externally (future RAG pipeline integration) — optional in MVP.
- **FR-020**: System MUST produce output path stable across runs (idempotent naming) to facilitate downstream indexing.
 - **FR-021**: After a previously interrupted export is detected (presence of partial manifest / temp markers), the tool MUST require an explicit `--resume` or `--fresh` flag; default (no flag) MUST abort with clear guidance. `--resume` processes only missing/failed pages reusing valid artifacts; `--fresh` discards temp state and re-exports all pages.

### Non-Functional / Quality Constraints
- **NFR-001**: Export of a medium space (≈500 pages, light attachments) SHOULD complete within a target baseline (e.g., <10 minutes with standard network). [NEEDS CLARIFICATION: performance target]
- **NFR-002**: Memory usage SHOULD remain bounded (streaming preferred over full in-memory graph). [NEEDS CLARIFICATION: memory ceiling]
- **NFR-003**: All filesystem writes MUST be atomic (write temp then move) to prevent partial file corruption.
- **NFR-004**: Logs MUST be structured enough to enable parsing for metrics (JSON or key=value lines). [NEEDS CLARIFICATION: logging format]
- **NFR-005**: Tool MUST be usable in CI environments (non-interactive). Authentication MUST use HTTP Basic Auth with a Confluence username and password provided via environment variables (e.g., `CONFLUENCE_USERNAME`, `CONFLUENCE_PASSWORD`) or CLI flags; credentials MUST be encoded as `Authorization: Basic <base64(username:password)>` without interactive prompts when running headless.

### Key Entities
- **Space**: Logical grouping of pages; attributes: key, name, base URL.
- **Page**: Content node with: id, title, parent id (nullable), body storage format, last modified timestamp, version.
- **Attachment**: Binary asset with id, parent page id, filename, media type, download link.
- **ExportJob**: Run-level metadata (start time, end time, pages total, pages succeeded, pages failed, mode=full|incremental, flags).
- **ManifestEntry**: Mapping of page id → local relative path, hash, last exported timestamp.
- **LinkReference**: Internal cross-link needing rewrite to local Markdown path.

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
