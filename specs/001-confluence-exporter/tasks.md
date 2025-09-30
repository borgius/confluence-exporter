# Tasks: Confluence Space to Markdown Extraction Library with Markdown Cleanup and Global Download Queue

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
- [x] T008 Install remark ecosystem dependencies (unified, remark-parse, remark-stringify, remark-textr).
- [x] T009 Install textr typography dependencies (textr, typographic-quotes).
- [x] T010 [P] Update TypeScript paths for cleanup modules in tsconfig.json.
- [x] T011 [P] Update ESLint config to include cleanup rule directories.

## Phase 3.2: Tests First (TDD)
### Contract Tests (from contracts/confluence-api.md + contracts/download-queue.md)
- [x] T012 [P] Contract test: GET space success (tests/contract/get_space.test.ts) using `nock` fixture.
- [x] T013 [P] Contract test: GET paginated space content listing (tests/contract/list_pages_pagination.test.ts).
- [x] T014 [P] Contract test: GET page with storage & ancestors (tests/contract/get_page_with_body.test.ts).
- [x] T015 [P] Contract test: GET attachments pagination (tests/contract/get_attachments.test.ts).
- [x] T016 [P] Contract test: Rate limit 429 + Retry-After honored (tests/contract/rate_limit_retry.test.ts).
- [x] T017 [P] Contract test: Basic Auth header presence (tests/contract/basic_auth_header.test.ts).
- [x] T018 [P] Contract test: markdown cleanup API POST /cleanup in tests/contract/cleanup_api.test.ts.

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
- [x] T030 [P] Integration: Full cleanup pipeline with export integration (tests/integration/full_cleanup_pipeline.test.ts).
- [x] T031 [P] Integration: Cleanup performance validation (<1s target per file) (tests/integration/performance_cleanup.test.ts).
- [x] T032 [P] Integration: Typography improvements (smart quotes, dashes, ellipses) (tests/integration/typography_cleanup.test.ts).
- [x] T033 [P] Integration: Heading normalization and structure cleanup (tests/integration/heading_cleanup.test.ts).
- [x] T034 [P] Integration: Word wrapping with 92-character target (tests/integration/word_wrap_cleanup.test.ts).
- [x] T035 [P] Integration: Content preservation (code blocks, tables, HTML) (tests/integration/content_preservation.test.ts).
- [x] T036 [P] Integration: Partial cleanup on rule failures (tests/integration/error_handling_cleanup.test.ts).
- [x] T037 [P] Integration: Allow-failures flag validation (tests/integration/allow_failures_flag.test.ts).
- [x] T038 [P] Integration: Optional checksum generation (tests/integration/checksum_generation.test.ts).

### Download Queue Integration Tests (NEW)
- [x] T039 [P] Integration: Basic queue discovery from list-children macro (tests/integration/queue_discovery_basic.test.ts).
- [x] T040 [P] Integration: Queue persistence and recovery after interruption (tests/integration/queue_persistence.test.ts).
- [x] T041 [P] Integration: Circular reference detection and prevention (tests/integration/queue_circular_references.test.ts).
- [x] T042 [P] Integration: Queue processing with retry logic (tests/integration/queue_retry_logic.test.ts).
- [x] T043 [P] Integration: Multiple discovery sources (macros, users, links) (tests/integration/queue_multiple_sources.test.ts).
- [x] T044 [P] Integration: Queue size limits and memory management (tests/integration/queue_size_limits.test.ts).
- [x] T045 [P] Integration: Queue state corruption recovery (tests/integration/queue_corruption_recovery.test.ts).
- [x] T046 [P] Integration: Resume export with queue state restoration (tests/integration/queue_resume_export.test.ts).
- [x] T046a [P] Integration: Queue discovery from user mentions (tests/integration/queue_user_discovery.test.ts).
- [x] T046b [P] Integration: Queue discovery from page links (tests/integration/queue_link_discovery.test.ts).
- [x] T046c [P] Integration: Queue performance with large discovery sets (tests/integration/queue_large_scale.test.ts).

### Unit Test Skeletons (key utilities) – still before implementation to enforce TDD
- [x] T047 [P] Unit: Slug generation rules (tests/unit/slugify.test.ts) covers normalization & collisions.
- [x] T048 [P] Unit: Retry backoff schedule generation (tests/unit/backoff.test.ts).
- [x] T049 [P] Unit: Hash computation stability (tests/unit/hash.test.ts).
- [x] T050 [P] Unit: Markdown transformer basic constructs (tests/unit/transformer_basic.test.ts).
- [x] T051 [P] Unit: Manifest diff logic (tests/unit/manifest_diff.test.ts).
- [x] T052 [P] Unit: Attachment path rewriting (tests/unit/attachment_rewrite.test.ts).
- [x] T053 [P] Unit: Link rewrite mapping resolution (tests/unit/link_rewrite_map.test.ts).
- [x] T054 [P] Unit: Config validation (tests/unit/config_validation.test.ts).
- [x] T055 [P] Unit: Typography cleanup rules (tests/unit/typography_rules.test.ts).
- [x] T056 [P] Unit: Heading normalization logic (tests/unit/heading_normalization.test.ts).
- [x] T057 [P] Unit: Word wrapping with preservation (tests/unit/word_wrap.test.ts).
- [x] T058 [P] Unit: Footnote positioning (tests/unit/footnote_positioning.test.ts).
- [x] T059 [P] Unit: Boldface punctuation cleanup (tests/unit/boldface_cleanup.test.ts).
- [x] T060 [P] Unit: Export artifact removal (tests/unit/artifact_removal.test.ts).
- [x] T061 [P] Unit: Cleanup service orchestration (tests/unit/cleanup_service.test.ts).
- [x] T062 [P] Unit: Allow-failures flag logic (tests/unit/allow_failures.test.ts).
- [x] T063 [P] Unit: Checksum generation utility (tests/unit/checksum.test.ts).

### Download Queue Unit Tests (NEW)
- [x] T064 [P] Unit: Queue item operations (add, remove, status) (tests/unit/queue_item_ops.test.ts).
- [x] T065 [P] Unit: Queue FIFO processing order (tests/unit/queue_fifo_order.test.ts).
- [x] T066 [P] Unit: Queue persistence serialization/deserialization (tests/unit/queue_persistence_unit.test.ts).
- [x] T067 [P] Unit: Queue metrics calculation (tests/unit/queue_metrics.test.ts).
- [x] T068 [P] Unit: Discovery hook pattern matching (tests/unit/discovery_hooks.test.ts).
- [x] T069 [P] Unit: Queue size validation and limits (tests/unit/queue_size_validation.test.ts).
- [x] T070 [P] Unit: Queue checksum validation (tests/unit/queue_checksum.test.ts).
- [x] T071 [P] Unit: Circular reference detection logic (tests/unit/circular_reference_detection.test.ts).
- [x] T072a [P] Unit: Queue orchestrator state transitions (tests/unit/download_queue_states.test.ts).
- [x] T072b [P] Unit: Queue atomic operations and concurrency (tests/unit/queue_atomic_ops.test.ts).

## Phase 3.3: Core Implementation (after tests exist & fail)
### Models & Types
- [x] T072 [P] Define TypeScript interfaces/types for export entities (src/models/entities.ts) (Space, Page, Attachment, ManifestEntry, ExportJob, LinkReference, ExportConfig, RetryPolicy).
- [x] T073 [P] Define cleanup entities (src/models/markdownCleanup.ts) (MarkdownDocument, CleanupRule, CleanupResult, CleanupConfig, DocumentMetadata, supporting types).
- [x] T074 [P] Define entities for allow-failures flag and checksum utilities (src/models/optionalFeatures.ts).
- [x] T075 [P] Define download queue entities (src/models/queueEntities.ts) (QueueItem, DownloadQueue, QueueMetrics, QueuePersistence, QueueState).

### Utilities & Low-level Helpers
- [x] T076 [P] Implement slug generation utility (src/util/slugify.ts).
- [x] T077 [P] Implement retry/backoff utility with jitter & Retry-After handling (src/util/retry.ts).
- [x] T078 [P] Implement hash utility (src/util/hash.ts) SHA-256 truncate 12 hex.
- [x] T079 [P] Implement logger wrapper producing line-delimited JSON (src/util/logger.ts).
- [x] T080 [P] Implement config validation (src/util/config.ts) (env + CLI merge, Basic Auth encoding).
- [x] T081 [P] Implement unified/remark parser utilities (src/util/markdownParser.ts).
- [x] T082 [P] Implement checksum utility for optional content hashing (src/util/checksum.ts).
- [x] T083 [P] Implement allow-failures flag processing utility (src/util/failureHandling.ts).

### Download Queue Core Implementation (NEW)
- [x] T084 [P] Implement queue item operations and validation (src/queue/queueItem.ts) (supports FR-033, FR-037).
- [x] T085 [P] Implement queue persistence with atomic operations (src/queue/queuePersistence.ts) (implements FR-034, FR-038, FR-039).
- [x] T086 [P] Implement queue metrics calculation and tracking (src/queue/queueMetrics.ts) (implements FR-040).
- [x] T087 Implement main download queue orchestrator (src/queue/downloadQueue.ts) (FIFO processing, deduplication) (implements FR-033, FR-036, FR-037).
- [x] T088: Implement queue checksum validation utilities (src/queue/queueValidation.ts) (integrity checks, state validation)
- [x] T089: Implement queue discovery hook handlers (src/queue/queueDiscovery.ts) (dependency detection, circular reference prevention)
- [x] T090 Implement queue index module (src/queue/index.ts) (public interface exports).
- [x] T090: Implement queue recovery mechanisms (src/queue/queueRecovery.ts) (error recovery, backup/restore, auto-repair)
- [x] T090a: Create queue backup functionality with checksums
- [x] T090b: Implement corruption detection and auto-repair
- [x] T090c: Add queue state recovery from backups

### Confluence Client
- [x] T091 Create base HTTP client with axios + interceptors (src/confluence/httpClient.ts) (auth header injection, retry integration).
- [x] T092 Implement getSpace (src/confluence/getSpace.ts) using client.
- [x] T093 Implement listPages paginator (src/confluence/listPages.ts) breadth-first with pagination.
- [x] T094 Implement getPageWithBody (src/confluence/getPageWithBody.ts) retrieving storage & ancestors.
- [x] T095 Implement listAttachments paginator (src/confluence/listAttachments.ts).
- [x] T096 Implement downloadAttachment (src/confluence/downloadAttachment.ts) streaming to temp file.

### Transformation & Processing
- [x] T097 Implement content transformer interface + basic implementation (src/transform/markdownTransformer.ts).
- [x] T098 Enhanced markdown transformer with cleanup integration and queue discovery (src/transform/enhancedMarkdownTransformer.ts) (implements FR-035).
- [x] T098a [P] Implement page link discovery and queue population (src/transform/linkDiscovery.ts) (extracts page references for queue).
- [x] T098b [P] Implement macro discovery and parsing (src/transform/macroDiscovery.ts) (handles list-children, user mentions).
- [x] T098c [P] Implement user mention discovery and resolution (src/transform/userDiscovery.ts) (finds user pages to queue).
- [x] T099 Implement link extraction & rewrite mapping builder (src/transform/linkRewriter.ts).
- [x] T100 Implement attachment reference rewrite utility (src/transform/attachmentRewriter.ts).

### Cleanup Rules Implementation
- [x] T101 [P] Typography cleanup rule (src/transform/cleanupRules/typography.ts) (smart quotes, dashes, ellipses).
- [x] T102 [P] Heading normalization rule (src/transform/cleanupRules/headings.ts).
- [x] T103 [P] Smart word wrapping rule (src/transform/cleanupRules/wordWrap.ts) (92-character target).
- [x] T104 [P] Footnote positioning rule (src/transform/cleanupRules/footnotes.ts).
- [x] T105 [P] Boldface punctuation rule (src/transform/cleanupRules/boldface.ts).
- [x] T106 [P] Export artifact cleanup rule (src/transform/cleanupRules/artifacts.ts).

### Filesystem & Manifest
- [x] T107 Implement atomic file writer (src/fs/atomicWriter.ts).
- [x] T108 Implement manifest load/save & diff (src/fs/manifest.ts).
- [x] T109 Implement attachment storage layout & path builder (src/fs/attachments.ts).
- [x] T110 Implement resume journal handling (src/fs/resumeJournal.ts).
- [x] T111 Implement slug collision resolver (src/fs/slugCollision.ts) (uses slug generation + suffix logic).

### Services / Orchestration
- [x] T112 Implement incremental diff service (src/services/incrementalDiff.ts) (compare old/new manifest entries + hashes).
- [x] T113 Implement markdown cleanup service orchestrator (src/services/markdownCleanupService.ts).
- [x] T114 Implement queue processing service with retry logic (src/services/queueProcessingService.ts) (implements FR-036, FR-037). ✅ COMPLETED: Batch processing with concurrency control, retry logic with exponential backoff, timeout handling, and comprehensive error management.
- [x] T114a [P] Implement queue discovery coordination service (src/services/queueDiscoveryCoordinationService.ts) (coordinates multiple discovery sources). ✅ COMPLETED: Orchestrates link, macro, and user discovery with priority-based execution, retry logic, and deduplication.
- [x] T114b [P] Implement queue monitoring and alerting service (src/services/queueMonitoringService.ts) (tracks performance and errors). ✅ COMPLETED: Comprehensive monitoring with metrics collection, alerting thresholds, trend analysis, and health status tracking.
- [x] T114c [P] Implement queue persistence coordination service (src/services/queuePersistenceCoordinationService.ts) (manages atomic persistence operations). ✅ COMPLETED: Backup management, recovery scenarios, atomic writes, and data integrity validation.
- [x] T115 Implement export orchestration pipeline with queue integration (src/core/exportRunner.ts) (fetch, transform, write, manifest update, link rewrite final pass, queue processing).
- [x] T116 Integrate performance instrumentation (pages/sec, timings, memory usage <300MB per NFR-002) (src/core/performanceCollector.ts or inline instrumentation).
- [x] T117 Implement exit status evaluation (threshold checks) (src/core/exitStatus.ts).
- [x] T118 Implement Markdown file validation (src/core/markdownValidator.ts) (validate front matter completeness, file extensions, basic structure per FR-015).

### CLI
- [x] T119 Implement CLI command & options (src/cli/index.ts) using commander (flags: --space, --out, --dry-run, --concurrency, --resume, --fresh, --root, --log-level).
- [x] T120 Wire config/env resolution & validation in CLI (src/cli/configLoader.ts) (produces ExportConfig).
- [x] T121 Implement progress logging with queue metrics (src/cli/progress.ts) (pages processed/remaining, warnings, queue size, discovery rate).
- [x] T122 Implement graceful interrupt handler (SIGINT) writing sentinel (src/cli/interrupt.ts).
- [x] T123 Build script & bin entrypoint header (dist/cli/index.js) (update package.json bin field).

## Phase 3.4: Integration & Hardening
- [x] T124 Implement attachment failure threshold enforcement (src/core/thresholds.ts) (percent & absolute logic).
- [x] T125 Implement restricted page handling (skip & warn) (src/services/restrictedHandling.ts).
- [x] T126 Implement root page filter logic (src/services/rootFilter.ts).
- [x] T127 Implement resume mode guard (require --resume / --fresh if sentinel present) (src/core/resumeGuard.ts).
- [x] T128 Implement final link rewrite pass after all pages exported (src/core/finalizeLinks.ts).
- [x] T129 Implement dry-run planner output with queue simulation (src/core/dryRunPlanner.ts) (no writes, logs plan including discovered pages).
- [x] T130 Integrate cleanup service into existing export pipeline (src/core/exportRunner.ts) (update to include automatic cleanup post-processing).
- [x] T131 Integrate queue processing into export pipeline (src/core/exportRunner.ts) (queue initialization, processing loop, state persistence) (implements FR-033, FR-034, FR-036).
- [x] T131a [P] Implement queue-aware export orchestration (src/core/queueAwareExporter.ts) (manages discovery and processing cycles).
- [x] T131b [P] Implement export resume with queue state restoration (src/core/resumeWithQueue.ts) (handles interrupted exports with queue). [COMPLETED ✓]
- [x] T131c [P] Implement queue progress reporting integration (src/core/queueProgressReporter.ts) (reports queue status in export progress). [COMPLETED ✓]
- [x] T132 Error handling and partial cleanup strategy across all cleanup rules.
- [x] T133 Performance monitoring and metrics collection for <1s cleanup target.
- [x] T134 Logging infrastructure for cleanup rule success/failure tracking.
- [x] T135 Configuration management for cleanup intensity levels (light/medium/heavy).
- [x] T136 CLI integration for cleanup options (--cleanup-intensity, --cleanup-disable).
- [x] T137 Queue corruption detection and recovery mechanisms (src/queue/queueRecovery.ts) (implements FR-039). [COMPLETED ✓]
- [x] T138: Queue size monitoring and alerting thresholds [COMPLETED ✓] (src/queue/queueMonitoring.ts) (supports FR-040).
- [x] T138a [P] Implement queue performance optimization strategies (src/queue/queueOptimizer.ts) (memory and processing optimizations).
- [x] T138b [P] Implement queue analytics and reporting (src/queue/queueAnalytics.ts) (detailed queue statistics and trends).
- [x] T138c [P] Implement queue backup and restore functionality (src/queue/queueBackup.ts) (emergency queue state management).
- [x] T139 Implement performance summary output block with queue statistics (src/core/metrics.ts) (including cleanup and queue statistics) (implements FR-040).
- [x] T140 Implement structured error classification including queue errors (src/core/errorClassifier.ts) (network vs content vs permission vs cleanup vs queue). [COMPLETED ✓]

## Phase 3.5: Polish & Validation
- [ ] T141 [P] Add additional unit tests for error utilities (tests/unit/errors.test.ts).
- [ ] T142 [P] Add unit tests for resume journal logic (tests/unit/resume_journal.test.ts).
- [ ] T143 [P] Add unit tests for manifest diff edge cases (deleted pages) (tests/unit/manifest_diff_deleted.test.ts).
- [ ] T144 [P] Add CLI help output snapshot test (tests/unit/cli_help.test.ts).
- [ ] T145 [P] Add performance test harness script for cleanup benchmarks (tests/integration/perf_harness.test.ts) (may be skipped by default).
- [ ] T146 [P] Add unit tests for queue edge cases (empty queue, corruption scenarios) (tests/unit/queue_edge_cases.test.ts).
- [ ] T147 [P] Add integration tests for queue performance under load (tests/integration/queue_performance_load.test.ts).
- [ ] T148 [P] Performance benchmarking suite for various document sizes.
- [ ] T149 [P] Update README with usage examples, performance notes, cleanup features, and queue functionality.
- [ ] T150 [P] Update quickstart with cleanup configuration examples, queue monitoring, and resume/dry-run clarifications.
- [ ] T151 [P] Add JSDoc comments to all public cleanup APIs and queue interfaces.
- [x] T152 PRIORITY: Coverage validation (>95% for all modules per constitution including cleanup and queue). ❌ BLOCKED - Current coverage: 18.96% (463/2441 statements) - many placeholder tests need implementation
- [ ] T153 Run quickstart.md validation scenarios (including cleanup and queue scenarios).
- [ ] T154 Memory usage profiling and optimization review (including cleanup and queue impact).
- [ ] T155 Refactor & de-duplicate transformation utilities (consolidate similar functions in src/transform/, remove unused exports, optimize attachment path resolution per code review findings).
- [x] T156 Run lint & fix remaining style issues. ✅ COMPLETED - All 5 lint warnings resolved
- [x] T157 PRIORITY: Ensure TypeScript strict mode passes (enable `strict` in tsconfig if not yet) and verify ≥95% line coverage per constitution. ❌ BLOCKED - 23 strict mode errors identified requiring extensive refactoring
- [ ] T158 Final pass: remove TODO markers not deferred intentionally.

## Dependencies Overview
- Setup (T001–T011) precedes all.
- Contract & integration & unit skeleton tests (T012–T072b) precede implementation tasks (T072+).
- Export models/utilities (T072, T076–T083) unblock client & transformer tasks (T091–T100).
- Queue models (T075) and core queue implementation (T084–T090c) unblock queue integration tasks (T114, T131).
- Cleanup models (T073, T081) unblock cleanup rule implementation (T101–T106).
- Client pagination & page/attachment fetching (T091–T096) precede orchestration (T115).
- Basic transformer (T097) precedes enhanced transformer with cleanup and queue discovery (T098–T098c).
- Cleanup rules (T101–T106) precede cleanup service (T113).
- Queue core (T084–T090c) precedes queue processing service (T114–T114c) and integration (T131–T131c).
- Discovery components (T089, T098a–T098c) precede queue discovery service (T114a).
- Queue persistence (T085) and recovery (T090a) precede persistence service (T114c).
- Queue monitoring (T086, T138) precede monitoring service (T114b).
- Cleanup service (T113) precedes enhanced transformer integration (T098).
- Enhanced transformer with queue discovery (T098–T098c) precedes export orchestration (T115).
- Manifest & FS tasks (T107–T111) required before orchestration (T115) finalization & incremental diff (T112).
- CLI tasks (T119–T123) depend on core + models + config utilities (T072–T083, T115 partially for end-to-end tests to pass; can stub early for help output test).
- Integration & hardening (T124–T140) depend on orchestration baseline (T115) and utilities.
- Queue integration tasks (T131–T131c, T137–T138c) depend on queue core implementation (T087, T114–T114c).
- Polish tasks (T141–T158) occur after earlier phases green.

## Parallel Execution Guidance
Example early parallel batch (after T001–T011):
```
# Contract tests
T012 T013 T014 T015 T016 T017 T018
# Integration tests (cleanup & queue)
T021 T022 T023 T024 T025 T026 T027 T028 T029 T030 T031 T032 T033 T034 T035 T036 T037 T038
# Queue integration tests
T039 T040 T041 T042 T043 T044 T045 T046 T046a T046b T046c
# Unit test skeletons (utilities & queue)
T047 T048 T049 T050 T051 T052 T053 T054 T055 T056 T057 T058 T059 T060 T061 T062 T063
# Queue unit tests
T064 T065 T066 T067 T068 T069 T070 T071 T072a T072b
```
Example implementation parallel batch (post failing tests):
```
# Models & types
T072 T073 T074 T075
# Utilities
T076 T077 T078 T079 T080 T081 T082 T083
# Queue core components
T084 T085 T086 T088 T089 T090a T090b T090c
# Cleanup rules
T101 T102 T103 T104 T105 T106
# Discovery components
T098a T098b T098c
# Queue services
T114a T114b T114c
# Queue integration
T131a T131b T131c
# Queue optimization
T138a T138b T138c
```
Later parallel examples:
```
# Transform & filesystem
T097 T099 T100 T107 T108 T109 T110 T111
# Polish tasks
T141 T142 T143 T144 T145 T146 T147 T148 T149 T150 T151
```
Ensure no two [P] tasks modify the same file concurrently.

**Queue-specific parallel batches**:
```
# Queue core infrastructure (independent components)
T084 T085 T086 T088 T089 T090a T090b T090c
# Queue discovery and transformation
T098a T098b T098c T114a
# Queue services and monitoring  
T114b T114c T138a T138b T138c
# Queue integration tests
T039 T040 T041 T042 T043 T044 T045 T046 T046a T046b T046c
# Queue unit tests
T064 T065 T066 T067 T068 T069 T070 T071 T072a T072b
```

## Validation Checklist
- [ ] All contract files mapped to contract test tasks (T012–T018)
- [ ] All entities mapped to model/types (T072–T075)
- [ ] All queue entities and operations have corresponding tests (T039–T046, T064–T071)
- [ ] Tests precede implementation tasks
- [ ] Parallel tasks isolated by file
- [ ] CLI flags covered (T119–T123, T136)
- [ ] Resume + thresholds + diff logic tasks included (T110 T112 T124 T127)
- [ ] Performance instrumentation & test tasks included (T116 T031 T133 T139 T147–T148)
- [ ] Cleanup integration tasks included (T098 T113 T130–T136)
- [ ] Queue integration tasks included (T087 T098 T114 T131 T137–T138)
- [ ] Constitution compliance covered (performance T133, coverage T152, docs T149–T151)
- [ ] Queue discovery and processing workflow complete (T084–T090, T098, T114, T131)
- [ ] Queue persistence and recovery mechanisms implemented (T085, T137)
- [ ] Queue performance and monitoring capabilities (T086, T138, T147)

## Notes
- Performance tests may be initially skipped pending environment stability.
- Title rename redirect mapping intentionally deferred (future task backlog).
- Cleanup features integrated as automatic post-processing with configurable intensity.
- **Global download queue functionality integrated as core export enhancement with:**
  - Automatic discovery of page dependencies during transformation
  - Persistent queue state for resume capability after interruption  
  - FIFO processing with circular reference detection
  - Comprehensive error handling and retry mechanisms
  - Performance monitoring and queue statistics reporting
- Constitution compliance: Performance target <1s cleanup per file, queue operations <1ms, >95% coverage, observability.
- TDD workflow enforced: All tests (T012–T071) must fail before any implementation (T072+).
- Automatic integration: CLI modification (T136) and export pipeline integration (T130–T131).
- Partial cleanup strategy: Error handling implementation (T132) with rule independence.
- Queue processing strategy: Breadth-first discovery (T087) with persistent state management (T085).
- Flowmark inspiration: Typography rules (T101), word wrapping (T103), content preservation (T035).
- **Queue architecture**: Modular design in `src/queue/` with clear separation of concerns for core operations, persistence, metrics, and discovery.
