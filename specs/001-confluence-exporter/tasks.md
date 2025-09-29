# Tasks: Confluence Space to Markdown Extraction Library with Cleanup

**Input**: Design documents from `/specs/001-confluence-exporter/`
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
- [ ] T008 Install remark ecosystem dependencies (unified, remark-parse, remark-stringify, remark-textr).
- [ ] T009 Install textr typography dependencies (textr, typographic-quotes).
- [ ] T010 [P] Update TypeScript paths for cleanup modules in tsconfig.json.
- [ ] T011 [P] Update ESLint config to include cleanup rule directories.

## Phase 3.2: Tests First (TDD)
### Contract Tests (from contracts/confluence-api.md + cleanup-api.yaml)
- [x] T012 [P] Contract test: GET space success (tests/contract/get_space.test.ts) using `nock` fixture.
- [x] T013 [P] Contract test: GET paginated space content listing (tests/contract/list_pages_pagination.test.ts).
- [x] T014 [P] Contract test: GET page with storage & ancestors (tests/contract/get_page_with_body.test.ts).
- [x] T015 [P] Contract test: GET attachments pagination (tests/contract/get_attachments.test.ts).
- [x] T016 [P] Contract test: Rate limit 429 + Retry-After honored (tests/contract/rate_limit_retry.test.ts).
- [x] T017 [P] Contract test: Basic Auth header presence (tests/contract/basic_auth_header.test.ts).
- [ ] T018 [P] Contract test: cleanup API POST /cleanup in tests/contract/cleanup_api.test.ts.

### Integration Tests (from user story + edge cases + quickstart + cleanup scenarios)
- [x] T021 [P] Integration: Full export happy path (tests/integration/full_export_happy.test.ts) generates manifest & files.
- [x] T022 [P] Integration: Resume interrupted export (tests/integration/resume_export.test.ts) uses sentinel + journal simulation.
- [x] T023 [P] Integration: Attachment failure threshold triggers non-zero exit (tests/integration/attachment_threshold.test.ts).
- [x] T024 [P] Integration: Slug collision resolution (tests/integration/slug_collision.test.ts).
- [x] T025 [P] Integration: Internal link rewrite correctness (tests/integration/link_rewrite.test.ts).
- [x] T026 [P] Integration: Root page filter exports subtree only (tests/integration/root_filter.test.ts).
- [x] T027 [P] Integration: Restricted page skipped with manifest status denied (tests/integration/restricted_page_skip.test.ts).
- [x] T028 [P] Integration: Dry-run creates no files but logs plan (tests/integration/dry_run.test.ts).
- [x] T029 [P] Integration: Performance baseline instrumentation exports ≥1.2 pages/sec (tests/integration/perf_baseline.test.ts) (may be tagged slow/skipped initially).
- [ ] T030 [P] Integration: Full cleanup pipeline with export integration (tests/integration/full_cleanup_pipeline.test.ts).
- [ ] T031 [P] Integration: Cleanup performance validation (<1s target per file) (tests/integration/performance_cleanup.test.ts).
- [ ] T032 [P] Integration: Typography improvements (smart quotes, dashes, ellipses) (tests/integration/typography_cleanup.test.ts).
- [ ] T033 [P] Integration: Heading normalization and structure cleanup (tests/integration/heading_cleanup.test.ts).
- [ ] T034 [P] Integration: Word wrapping with 92-character target (tests/integration/word_wrap_cleanup.test.ts).
- [ ] T035 [P] Integration: Content preservation (code blocks, tables, HTML) (tests/integration/content_preservation.test.ts).
- [ ] T036 [P] Integration: Partial cleanup on rule failures (tests/integration/error_handling_cleanup.test.ts).

### Unit Test Skeletons (key utilities) – still before implementation to enforce TDD
- [x] T037 [P] Unit: Slugification rules (tests/unit/slugify.test.ts) covers normalization & collisions.
- [x] T038 [P] Unit: Retry backoff schedule generation (tests/unit/backoff.test.ts).
- [x] T039 [P] Unit: Hash computation stability (tests/unit/hash.test.ts).
- [x] T040 [P] Unit: Markdown transformer basic constructs (tests/unit/transformer_basic.test.ts).
- [x] T041 [P] Unit: Manifest diff logic (tests/unit/manifest_diff.test.ts).
- [x] T042 [P] Unit: Attachment path rewriting (tests/unit/attachment_rewrite.test.ts).
- [x] T043 [P] Unit: Link rewrite mapping resolution (tests/unit/link_rewrite_map.test.ts).
- [x] T044 [P] Unit: Config validation (tests/unit/config_validation.test.ts).
- [ ] T045 [P] Unit: Typography cleanup rules (tests/unit/typography_rules.test.ts).
- [ ] T046 [P] Unit: Heading normalization logic (tests/unit/heading_normalization.test.ts).
- [ ] T047 [P] Unit: Word wrapping with preservation (tests/unit/word_wrap.test.ts).
- [ ] T048 [P] Unit: Footnote positioning (tests/unit/footnote_positioning.test.ts).
- [ ] T049 [P] Unit: Boldface punctuation cleanup (tests/unit/boldface_cleanup.test.ts).
- [ ] T050 [P] Unit: Export artifact removal (tests/unit/artifact_removal.test.ts).
- [ ] T051 [P] Unit: Cleanup service orchestration (tests/unit/cleanup_service.test.ts).

## Phase 3.3: Core Implementation (after tests exist & fail)
### Models & Types
- [x] T052 [P] Define TypeScript interfaces/types for export entities (src/models/entities.ts) (Space, Page, Attachment, ManifestEntry, ExportJob, LinkReference, ExportConfig, RetryPolicy).
- [ ] T053 [P] Define cleanup entities (src/models/markdownCleanup.ts) (MarkdownDocument, CleanupRule, CleanupResult, CleanupConfig, DocumentMetadata, supporting types).

### Utilities & Low-level Helpers
- [x] T054 [P] Implement slugify utility (src/util/slugify.ts).
- [x] T055 [P] Implement retry/backoff utility with jitter & Retry-After handling (src/util/retry.ts).
- [x] T056 [P] Implement hash utility (src/util/hash.ts) SHA-256 truncate 12 hex.
- [x] T057 [P] Implement logger wrapper producing line-delimited JSON (src/util/logger.ts).
- [x] T058 [P] Implement config validation (src/util/config.ts) (env + CLI merge, Basic Auth encoding).
- [ ] T059 [P] Implement unified/remark parser utilities (src/util/markdownParser.ts).

### Confluence Client
- [x] T060 Create base HTTP client with axios + interceptors (src/confluence/httpClient.ts) (auth header injection, retry integration).
- [x] T061 Implement getSpace (src/confluence/getSpace.ts) using client.
- [x] T062 Implement listPages paginator (src/confluence/listPages.ts) breadth-first with pagination.
- [x] T063 Implement getPageWithBody (src/confluence/getPageWithBody.ts) retrieving storage & ancestors.
- [x] T064 Implement listAttachments paginator (src/confluence/listAttachments.ts).
- [x] T065 Implement downloadAttachment (src/confluence/downloadAttachment.ts) streaming to temp file.

### Transformation & Processing
- [x] T066 Implement content transformer interface + basic implementation (src/transform/markdownTransformer.ts).
- [ ] T067 Enhanced markdown transformer with cleanup integration (src/transform/enhancedMarkdownTransformer.ts).
- [x] T068 Implement link extraction & rewrite mapping builder (src/transform/linkRewriter.ts).
- [x] T069 Implement attachment reference rewrite utility (src/transform/attachmentRewriter.ts).

### Cleanup Rules Implementation
- [ ] T070 [P] Typography cleanup rule (src/transform/cleanupRules/typography.ts) (smart quotes, dashes, ellipses).
- [ ] T071 [P] Heading normalization rule (src/transform/cleanupRules/headings.ts).
- [ ] T072 [P] Smart word wrapping rule (src/transform/cleanupRules/wordWrap.ts) (92-character target).
- [ ] T073 [P] Footnote positioning rule (src/transform/cleanupRules/footnotes.ts).
- [ ] T074 [P] Boldface punctuation rule (src/transform/cleanupRules/boldface.ts).
- [ ] T075 [P] Export artifact cleanup rule (src/transform/cleanupRules/artifacts.ts).

### Filesystem & Manifest
- [x] T076 Implement atomic file writer (src/fs/atomicWriter.ts).
- [x] T077 Implement manifest load/save & diff (src/fs/manifest.ts).
- [x] T078 Implement attachment storage layout & path builder (src/fs/attachments.ts).
- [x] T079 Implement resume journal handling (src/fs/resumeJournal.ts).
- [x] T080 Implement slug collision resolver (src/fs/slugCollision.ts) (uses slugify + suffix logic).

### Services / Orchestration
- [x] T081 Implement incremental diff service (src/services/incrementalDiff.ts) (compare old/new manifest entries + hashes).
- [ ] T082 Implement markdown cleanup service orchestrator (src/services/markdownCleanupService.ts).
- [x] T083 Implement export orchestration pipeline (src/core/exportRunner.ts) (fetch, transform, write, manifest update, link rewrite final pass).
- [x] T084 Integrate performance instrumentation (pages/sec, timings, memory usage <300MB per NFR-002) (src/core/performanceCollector.ts or inline instrumentation).
- [x] T085 Implement exit status evaluation (threshold checks) (src/core/exitStatus.ts).
- [x] T086 Implement Markdown file validation (src/core/markdownValidator.ts) (validate front matter completeness, file extensions, basic structure per FR-015).

### CLI
- [x] T087 Implement CLI command & options (src/cli/index.ts) using commander (flags: --space, --out, --dry-run, --concurrency, --resume, --fresh, --root, --log-level).
- [x] T088 Wire config/env resolution & validation in CLI (src/cli/configLoader.ts) (produces ExportConfig).
- [x] T089 Implement progress logging (pages processed/remaining, warnings) (src/cli/progress.ts).
- [x] T090 Implement graceful interrupt handler (SIGINT) writing sentinel (src/cli/interrupt.ts).
- [x] T091 Build script & bin entrypoint header (dist/cli/index.js) (update package.json bin field).

## Phase 3.4: Integration & Hardening
- [x] T092 Implement attachment failure threshold enforcement (src/core/thresholds.ts) (percent & absolute logic).
- [x] T093 Implement restricted page handling (skip & warn) (src/services/restrictedHandling.ts).
- [x] T094 Implement root page filter logic (src/services/rootFilter.ts).
- [x] T095 Implement resume mode guard (require --resume / --fresh if sentinel present) (src/core/resumeGuard.ts).
- [ ] T096 Implement final link rewrite pass after all pages exported (src/core/finalizeLinks.ts).
- [ ] T097 Implement dry-run planner output (src/core/dryRunPlanner.ts) (no writes, logs plan).
- [ ] T098 Integrate cleanup service into existing export pipeline (src/core/exportRunner.ts) (update to include automatic cleanup post-processing).
- [ ] T099 Error handling and partial cleanup strategy across all cleanup rules.
- [ ] T100 Performance monitoring and metrics collection for <1s cleanup target.
- [ ] T101 Logging infrastructure for cleanup rule success/failure tracking.
- [ ] T102 Configuration management for cleanup intensity levels (light/medium/heavy).
- [ ] T103 CLI integration for cleanup options (--cleanup-intensity, --cleanup-disable).
- [ ] T104 Implement performance summary output block (src/core/metrics.ts) (including cleanup statistics).
- [ ] T105 Implement structured error classification (network vs content vs permission vs cleanup) (src/core/errorClassifier.ts).

## Phase 3.5: Polish & Validation
- [ ] T106 [P] Add additional unit tests for error utilities (tests/unit/errors.test.ts).
- [ ] T107 [P] Add unit tests for resume journal logic (tests/unit/resume_journal.test.ts).
- [ ] T108 [P] Add unit tests for manifest diff edge cases (deleted pages) (tests/unit/manifest_diff_deleted.test.ts).
- [ ] T109 [P] Add CLI help output snapshot test (tests/unit/cli_help.test.ts).
- [ ] T110 [P] Add performance test harness script for cleanup benchmarks (tests/integration/perf_harness.test.ts) (may be skipped by default).
- [ ] T111 [P] Performance benchmarking suite for various document sizes.
- [ ] T112 [P] Update README with usage examples, performance notes, and cleanup features.
- [ ] T113 [P] Update quickstart with cleanup configuration examples and resume/dry-run clarifications.
- [ ] T114 [P] Add JSDoc comments to all public cleanup APIs.
- [ ] T115 Coverage validation (>95% for all modules per constitution including cleanup).
- [ ] T116 Run quickstart.md validation scenarios (including cleanup scenarios).
- [ ] T117 Memory usage profiling and optimization review (including cleanup impact).
- [ ] T118 Refactor & de-duplicate transformation utilities (consolidate similar functions in src/transform/, remove unused exports, optimize attachment path resolution per code review findings).
- [ ] T119 Run lint & fix remaining style issues.
- [ ] T120 Ensure TypeScript strict mode passes (enable `strict` in tsconfig if not yet) and verify ≥95% line coverage per constitution.
- [ ] T121 Final pass: remove TODO markers not deferred intentionally.

## Dependencies Overview
- Setup (T001–T011) precedes all.
- Contract & integration & unit skeleton tests (T012–T051) precede implementation tasks (T052+).
- Export models/utilities (T052, T054–T058) unblock client & transformer tasks (T060–T069).
- Cleanup models (T053, T059) unblock cleanup rule implementation (T070–T075).
- Client pagination & page/attachment fetching (T060–T065) precede orchestration (T083).
- Basic transformer (T066) precedes enhanced transformer with cleanup (T067).
- Cleanup rules (T070–T075) precede cleanup service (T082).
- Cleanup service (T082) precedes enhanced transformer integration (T067).
- Manifest & FS tasks (T076–T080) required before orchestration (T083) finalization & incremental diff (T081).
- CLI tasks (T087–T091) depend on core + models + config utilities (T052–T058, T083 partially for end-to-end tests to pass; can stub early for help output test).
- Integration & hardening (T092–T105) depend on orchestration baseline (T083) and utilities.
- Polish tasks (T106–T121) occur after earlier phases green.

## Parallel Execution Guidance
Example early parallel batch (after T001–T011):
```
# Contract tests
T012 T013 T014 T015 T016 T017 T018 T019 T020
# Integration tests  
T021 T022 T023 T024 T025 T026 T027 T028 T029 T030 T031 T032 T033 T034 T035 T036
# Unit test skeletons
T037 T038 T039 T040 T041 T042 T043 T044 T045 T046 T047 T048 T049 T050 T051
```
Example implementation parallel batch (post failing tests):
```
T052 T053 T054 T055 T056 T057 T058 T059
T070 T071 T072 T073 T074 T075
```
Later parallel examples:
```
T066 T068 T069
T076 T077 T078 T079 T080
T106 T107 T108 T109 T110 T111 T112 T113 T114
```
Ensure no two [P] tasks modify the same file concurrently.

## Validation Checklist
- [ ] All contract files mapped to contract test tasks (T012–T020)
- [ ] All entities mapped to model/types (T052–T053)
- [ ] Tests precede implementation tasks
- [ ] Parallel tasks isolated by file
- [ ] CLI flags covered (T087–T091, T103)
- [ ] Resume + thresholds + diff logic tasks included (T079 T081 T092 T095)
- [ ] Performance instrumentation & test tasks included (T084 T029 T031 T104 T110–T111)
- [ ] Cleanup integration tasks included (T067 T082 T098–T105)
- [ ] Constitution compliance covered (performance T100, coverage T115, docs T112–T114)

## Notes
- Performance tests may be initially skipped pending environment stability.
- Title rename redirect mapping intentionally deferred (future task backlog).
- Cleanup features integrated as automatic post-processing with configurable intensity.
- Constitution compliance: Performance target <1s cleanup per file, >95% coverage, observability.
- TDD workflow enforced: All tests (T012–T051) must fail before any implementation (T052+).
- Automatic integration: CLI modification (T103) and export pipeline integration (T098).
- Partial cleanup strategy: Error handling implementation (T099) with rule independence.
- Flowmark inspiration: Typography rules (T070), word wrapping (T072), content preservation (T035).
