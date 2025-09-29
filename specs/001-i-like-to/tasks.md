# Tasks: Confluence Space to Markdown Extraction Library

**Input**: Design documents from `/specs/001-i-like-to/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
(Reference only – already executed to generate this list)

## Format
`[ID] [P?] Description`
- [P] indicates the task may run in parallel (different file, no dependency conflicts)
- All tests precede implementation (TDD). Ensure each new test fails before implementing passing code.

## Phase 3.1: Setup
- [x] T001 Initialize Node.js project (package.json) with type:module, add scripts (build, test, lint) in repository root.
- [x] T002 Add dependencies: runtime (`axios`, `commander`, `gray-matter`, `p-limit`, `winston`) and dev (`typescript`, `ts-node`, `jest`, `ts-jest`, `@types/jest`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `nodemon`, `nock`).
- [x] T003 Configure TypeScript (`tsconfig.json`) targeting ES2022, outDir `dist`, rootDir `src`.
- [x] T004 Configure ESLint + Prettier integration (if used) with project rules (no unused vars, complexity ≤10) and add npm `lint` script.
- [x] T005 Create project directory structure (`src/cli`, `src/core`, `src/confluence`, `src/transform`, `src/fs`, `src/models`, `src/services`, `src/util`, `tests/unit`, `tests/integration`, `tests/contract`).
- [x] T006 Add basic README with short description and link to quickstart.
- [x] T007 Add license file (placeholder MIT) and `.gitignore` (node, dist, coverage, temp export markers).

## Phase 3.2: Tests First (TDD)
### Contract Tests (from contracts/confluence-api.md)
- [x] T008 [P] Contract test: GET space success (tests/contract/get_space.test.ts) using `nock` fixture.
- [x] T009 [P] Contract test: GET paginated space content listing (tests/contract/list_pages_pagination.test.ts).
- [x] T010 [P] Contract test: GET page with storage & ancestors (tests/contract/get_page_with_body.test.ts).
- [x] T011 [P] Contract test: GET attachments pagination (tests/contract/get_attachments.test.ts).
- [x] T012 [P] Contract test: Rate limit 429 + Retry-After honored (tests/contract/rate_limit_retry.test.ts).
- [x] T013 [P] Contract test: Basic Auth header presence (tests/contract/basic_auth_header.test.ts).

### Integration Tests (from user story + edge cases + quickstart)
- [x] T014 [P] Integration: Full export happy path (tests/integration/full_export_happy.test.ts) generates manifest & files.
- [x] T015 [P] Integration: Resume interrupted export (tests/integration/resume_export.test.ts) uses sentinel + journal simulation.
- [x] T016 [P] Integration: Attachment failure threshold triggers non-zero exit (tests/integration/attachment_threshold.test.ts).
- [x] T017 [P] Integration: Slug collision resolution (tests/integration/slug_collision.test.ts).
- [x] T018 [P] Integration: Internal link rewrite correctness (tests/integration/link_rewrite.test.ts).
- [x] T019 [P] Integration: Root page filter exports subtree only (tests/integration/root_filter.test.ts).
- [x] T020 [P] Integration: Restricted page skipped with manifest status denied (tests/integration/restricted_page_skip.test.ts).
- [x] T021 [P] Integration: Dry-run creates no files but logs plan (tests/integration/dry_run.test.ts).
- [x] T022 [P] Integration: Performance baseline instrumentation exports ≥1.2 pages/sec (tests/integration/perf_baseline.test.ts) (may be tagged slow/skipped initially).

### Unit Test Skeletons (key utilities) – still before implementation to enforce TDD
- [x] T023 [P] Unit: Slugification rules (tests/unit/slugify.test.ts) covers normalization & collisions.
- [x] T024 [P] Unit: Retry backoff schedule generation (tests/unit/backoff.test.ts).
- [x] T025 [P] Unit: Hash computation stability (tests/unit/hash.test.ts).
- [x] T026 [P] Unit: Markdown transformer basic constructs (tests/unit/transformer_basic.test.ts).
- [x] T027 [P] Unit: Manifest diff logic (tests/unit/manifest_diff.test.ts).
- [x] T028 [P] Unit: Attachment path rewriting (tests/unit/attachment_rewrite.test.ts).
- [x] T029 [P] Unit: Link rewrite mapping resolution (tests/unit/link_rewrite_map.test.ts).
- [x] T030 [P] Unit: Config validation (tests/unit/config_validation.test.ts).

## Phase 3.3: Core Implementation (after tests exist & fail)
### Models & Types
- [x] T031 [P] Define TypeScript interfaces/types for entities (src/models/entities.ts) (Space, Page, Attachment, ManifestEntry, ExportJob, LinkReference, ExportConfig, RetryPolicy).

### Utilities & Low-level Helpers
- [x] T032 [P] Implement slugify utility (src/util/slugify.ts).
- [x] T033 [P] Implement retry/backoff utility with jitter & Retry-After handling (src/util/retry.ts).
- [x] T034 [P] Implement hash utility (src/util/hash.ts) SHA-256 truncate 12 hex.
- [x] T035 [P] Implement logger wrapper producing line-delimited JSON (src/util/logger.ts).
- [x] T036 [P] Implement config validation (src/util/config.ts) (env + CLI merge, Basic Auth encoding).

### Confluence Client
- [x] T037 Create base HTTP client with axios + interceptors (src/confluence/httpClient.ts) (auth header injection, retry integration).
- [x] T038 Implement getSpace (src/confluence/getSpace.ts) using client.
- [x] T039 Implement listPages paginator (src/confluence/listPages.ts) breadth-first with pagination.
- [x] T040 Implement getPageWithBody (src/confluence/getPageWithBody.ts) retrieving storage & ancestors.
- [x] T041 Implement listAttachments paginator (src/confluence/listAttachments.ts).
- [x] T042 Implement downloadAttachment (src/confluence/downloadAttachment.ts) streaming to temp file.

### Transformation & Processing
- [x] T043 Implement content transformer interface + basic implementation (src/transform/markdownTransformer.ts).
- [x] T044 Implement link extraction & rewrite mapping builder (src/transform/linkRewrite.ts).
- [x] T045 Implement attachment reference rewrite utility (src/transform/attachmentRewrite.ts).

### Filesystem & Manifest
- [x] T046 Implement atomic file writer (src/fs/atomicWrite.ts).
- [x] T047 Implement manifest load/save & diff (src/fs/manifest.ts).
- [x] T048 Implement attachment storage layout & path builder (src/fs/attachments.ts).
- [x] T049 Implement resume journal handling (src/fs/resumeJournal.ts).
- [x] T050 Implement slug collision resolver (src/fs/slugCollision.ts) (uses slugify + suffix logic).

### Services / Orchestration
- [x] T051 Implement incremental diff service (src/services/incrementalDiff.ts) (compare old/new manifest entries + hashes).
- [x] T052 Implement export orchestration pipeline (src/core/exportRunner.ts) (fetch, transform, write, manifest update, link rewrite final pass).
- [x] T053 Integrate performance instrumentation (pages/sec, timings, memory usage <300MB per NFR-002) (src/core/metrics.ts or inline instrumentation).
- [x] T054 Implement exit status evaluation (threshold checks) (src/core/exitStatus.ts).
- [x] T054a Implement Markdown file validation (src/core/markdownValidator.ts) (validate front matter completeness, file extensions, basic structure per FR-015).

### CLI
- [x] T055 Implement CLI command & options (src/cli/index.ts) using commander (flags: --space, --out, --dry-run, --concurrency, --resume, --fresh, --root, --log-level).
- [x] T056 Wire config/env resolution & validation in CLI (src/cli/configLoader.ts) (produces ExportConfig).
- [x] T057 Implement progress logging (pages processed/remaining, warnings) (src/cli/progress.ts).
- [x] T058 Implement graceful interrupt handler (SIGINT) writing sentinel (src/cli/interrupt.ts).
- [x] T059 Build script & bin entrypoint header (dist/cli/index.js) (update package.json bin field).

## Phase 3.4: Integration & Hardening
- [x] T060 Implement attachment failure threshold enforcement (src/core/thresholds.ts) (percent & absolute logic).
- [x] T061 Implement restricted page handling (skip & warn) (src/services/restrictedHandling.ts).
- [x] T062 Implement root page filter logic (src/services/rootFilter.ts).
- [x] T063 Implement resume mode guard (require --resume / --fresh if sentinel present) (src/core/resumeGuard.ts).
- [ ] T064 Implement final link rewrite pass after all pages exported (src/core/finalizeLinks.ts).
- [ ] T065 Implement dry-run planner output (src/core/dryRunPlanner.ts) (no writes, logs plan).
- [ ] T066 Implement performance summary output block (src/core/perfSummary.ts).
- [ ] T067 Implement structured error classification (network vs content vs permission) (src/util/errors.ts).

## Phase 3.5: Polish & Validation
- [ ] T068 [P] Add additional unit tests for error utilities (tests/unit/errors.test.ts).
- [ ] T069 [P] Add unit tests for resume journal logic (tests/unit/resume_journal.test.ts).
- [ ] T070 [P] Add unit tests for manifest diff edge cases (deleted pages) (tests/unit/manifest_diff_deleted.test.ts).
- [ ] T071 [P] Add CLI help output snapshot test (tests/unit/cli_help.test.ts).
- [ ] T072 [P] Add performance test harness script (tests/integration/perf_harness.test.ts) (may be skipped by default).
- [ ] T073 [P] Update README with usage examples & performance notes.
- [ ] T074 [P] Update quickstart with resume/dry-run clarifications as implemented (if changes occurred).
- [ ] T075 Refactor & de-duplicate transformation utilities (consolidate similar functions in src/transform/, remove unused exports, optimize attachment path resolution per code review findings).
- [ ] T076 Run lint & fix remaining style issues.
- [ ] T077 Ensure TypeScript strict mode passes (enable `strict` in tsconfig if not yet) and verify ≥90% line coverage per constitution.
- [ ] T078 Final pass: remove TODO markers not deferred intentionally.

## Dependencies Overview
- Setup (T001–T007) precedes all.
- Contract & integration & unit skeleton tests (T008–T030) precede implementation tasks (T031+).
- Models/utilities (T031–T036) unblock client & transformer tasks (T037–T045).
- Client pagination & page/attachment fetching (T037–T042) precede orchestration (T051–T054).
- Manifest & FS tasks (T046–T050) required before orchestration (T052) finalization & incremental diff (T051).
- CLI tasks (T055–T059) depend on core + models + config utilities (T031–T036, T052 partially for end-to-end tests to pass; can stub early for help output test).
- Integration & hardening (T060–T067) depend on orchestration baseline (T052) and utilities.
- Polish tasks (T068–T078) occur after earlier phases green.

## Parallel Execution Guidance
Example early parallel batch (after T001–T007):
```
# Contract tests
T008 T009 T010 T011 T012 T013
# Integration tests
T014 T015 T016 T017 T018 T019 T020 T021 T022
# Unit test skeletons
T023 T024 T025 T026 T027 T028 T029 T030
```
Example implementation parallel batch (post failing tests):
```
T031 T032 T033 T034 T035 T036
```
Later parallel examples:
```
T043 T044 T045
T046 T047 T048 T049 T050
T068 T069 T070 T071 T072 T073 T074
```
Ensure no two [P] tasks modify the same file concurrently.

## Validation Checklist
- [ ] All contract files mapped to contract test tasks (T008–T013)
- [ ] All entities mapped to model/types (T031)
- [ ] Tests precede implementation tasks
- [ ] Parallel tasks isolated by file
- [ ] CLI flags covered (T055–T058)
- [ ] Resume + thresholds + diff logic tasks included (T049 T051 T060 T063)
- [ ] Performance instrumentation & test tasks included (T053 T022 T066 T072)

## Notes
- Performance tests may be initially skipped pending environment stability.
- Title rename redirect mapping intentionally deferred (future task backlog).
