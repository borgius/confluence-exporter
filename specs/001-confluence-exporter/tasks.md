# Tasks: Confluence Space to Markdown Exporter (Two-Queue Architecture)

**Input**: Design documents from `/specs/001-confluence-exporter/`
**Prerequisites**: plan.md (present), research.md (present), data-model.md (present), contracts/ (present), quickstart.md (present)

## Execution Flow (main)
```
Follow tasks sequentially unless marked [P]. Ensure tests are written and failing before implementing dependent code.
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no direct dependency)
- All paths absolute or repo-root relative as shown

---
## Phase 3.1: Setup & Foundations
- [ ] T001 Ensure dependency list updated (axios, remark, unified, textr, p-limit) in `package.json`; add any missing types; do NOT implement feature code yet.
- [ ] T002 Add `src/queue/` scaffolding directories & placeholder index exports: `src/queue/download/`, `src/queue/processing/`, `src/queue/persistence/`.
- [ ] T003 Configure structured JSON logging helper in `src/util/log.ts` with shape {timestamp, level, message, context} (NFR-004); add unit test skeleton `tests/unit/logging.test.ts` (failing initially).
- [ ] T004 Implement atomic file writer stub in `src/fs/atomicWriter.ts` (if not complete) with temp+rename contract; add failing unit test `tests/unit/atomicWriter.test.ts` referencing FR-003.
- [ ] T005 Define shared type declarations for queue items & registry in `src/models/queueEntities.ts` (extend existing if present) covering fields from FR-038.
- [ ] T006 Add hashing utility stub in `src/util/hash.ts` (content hash for FR-018 future + manifest delta) with failing test `tests/unit/hash.test.ts`.

## Phase 3.2: Tests First (TDD) – Core Behavior & Contracts
- [ ] T007 [P] Contract test: manifest schema & required fields in `tests/contract/manifest.contract.test.ts` (covers FR-005, FR-007, FR-008, FR-020).
- [ ] T008 [P] Contract test: queue state JSON schema (two queues + fields FR-033..FR-040, FR-041/042) in `tests/contract/queue-state.contract.test.ts`.
- [ ] T009 [P] Contract test: cleanup output invariants (front matter preserved, code blocks untouched, heading normalization) `tests/contract/cleanup.contract.test.ts` (FR-022..FR-030).
- [ ] T010 [P] Integration test: full export basic space (no attachments) `tests/integration/export_basic.test.ts` (FR-001..FR-005, FR-009, FR-015).
- [ ] T011 [P] Integration test: attachments + relative rewriting `tests/integration/export_attachments.test.ts` (FR-006).
- [ ] T012 [P] Integration test: incremental delta detection `tests/integration/export_incremental.test.ts` (FR-011, FR-012, FR-018 placeholder assertions skipped initially).
- [ ] T013 [P] Integration test: slug collision handling `tests/integration/slug_collision.test.ts` (FR-008).
- [ ] T014 [P] Integration test: rate limiting + retry backoff using mock server `tests/integration/retry_backoff.test.ts` (FR-013).
- [ ] T015 [P] Integration test: interruption Ctrl-C single then resume drain `tests/integration/interruption_phase1.test.ts` (FR-042 first phase).
- [ ] T016 [P] Integration test: double Ctrl-C abort with state persistence `tests/integration/interruption_phase2.test.ts` (FR-042 second phase).
- [ ] T017 [P] Integration test: discovery beyond --limit `tests/integration/limit_discovery.test.ts` (FR-041).
- [ ] T018 [P] Integration test: macro/user mention discovery queue growth `tests/integration/discovery_queue_growth.test.ts` (FR-035, FR-037).
- [ ] T019 [P] Integration test: cleanup disable flag `tests/integration/cleanup_disable.test.ts` (FR-032).
- [ ] T020 [P] Unit test: whitespace & typography cleanup rule set `tests/unit/cleanup_typography.test.ts` (FR-022, FR-026, FR-027).
- [ ] T021 [P] Unit test: smart wrapping rule `tests/unit/cleanup_wrapping.test.ts` (FR-024).
- [ ] T022 [P] Unit test: partial cleanup failure isolation `tests/unit/cleanup_partial_failure.test.ts` (FR-031).
- [ ] T023 [P] Unit test: queue persistence corruption recovery (simulate truncated file) `tests/unit/queue_recovery.test.ts` (FR-039 + corruption tasks T137/T085 reference).
- [ ] T024 [P] Unit test: unified page registry dedupe & requeue semantics `tests/unit/unified_registry.test.ts` (FR-037).
- [ ] T025 [P] Unit test: backoff jitter timing boundaries `tests/unit/backoff.test.ts` (FR-013).
- [ ] T026 [P] Unit test: slug collision algorithm deterministic output `tests/unit/slug_collision.test.ts` (FR-008).

## Phase 3.3: Core Implementation (After Tests Above Exist & Fail)
- [ ] T027 Implement manifest writer & schema validator in `src/fs/manifest.ts` (FR-005, FR-007, FR-020) with integration hooks; make tests T007, T010 partially pass.
- [ ] T028 Implement slug generation & collision resolution in `src/fs/slugCollision.ts` (FR-008) to satisfy T013, T026.
- [ ] T029 Implement hashing util logic in `src/util/hash.ts` (make T006 pass; used in incremental detection, FR-011/018 placeholder).
- [ ] T030 Implement PageDownloadQueue (in-memory + persistence) `src/queue/download/pageDownloadQueue.ts` (FR-033, FR-034, FR-036) minimal operations enqueue/dequeue/save.
- [ ] T031 Implement PageProcessingQueue `src/queue/processing/pageProcessingQueue.ts` (FR-033, FR-034) with transition recording.
- [ ] T032 Implement queue persistence adapter `src/queue/persistence/queueStore.ts` with atomic write + checksum (FR-034, FR-038, FR-039) enabling T008, T023.
- [ ] T033 Implement UnifiedPageRegistry `src/queue/unifiedPageRegistry.ts` (FR-037) enabling T024.
- [ ] T034 Implement discovery handler (macros/links/mentions) `src/core/discovery.ts` adding to download queue (FR-035, FR-036).
- [ ] T035 Implement retry/backoff helper `src/util/backoff.ts` (FR-013) enabling T014, T025.
- [ ] T036 Implement attachments fetcher `src/fs/attachments.ts` (FR-006) plus relative path rewrite integration.
- [ ] T037 Implement cleanup pipeline orchestrator `src/cleanup/cleanupService.ts` applying rules & partial failure strategy (FR-022..FR-032) enabling T009, T020-T022, T019.
- [ ] T038 Implement individual cleanup rules (typography, wrapping, heading normalization, bold punctuation, footnotes) in `src/cleanup/*.ts` satisfying associated unit tests.
- [ ] T039 Implement export runner orchestrating two queues `src/core/exportRunner.ts` (FR-001..FR-004, FR-009, FR-011, FR-012, FR-033..FR-040, FR-041/042 logic hooks) making basic integration tests start passing.
- [ ] T040 Implement incremental planner `src/core/dryRunPlanner.ts` & `src/core/resumeGuard.ts` integration (FR-011, FR-021) enabling T012.
- [ ] T041 Implement interrupt handling (SIGINT) in `src/cli/interrupt.ts` with phase1 freeze + phase2 abort flush (FR-042) making T015, T016 pass.
- [ ] T042 Implement `--limit` logic scoping only initial seeding in `src/cli/index.ts` (FR-041) enabling T017.
- [ ] T043 Implement CLI cleanup disable & intensity flags in `src/cli/index.ts` (FR-029, FR-032) enabling T019.
- [ ] T044 Implement metrics collection (transition latency, queue stats) `src/core/metrics.ts` (FR-040 + NFR alignment) for integration logging.
- [ ] T045 Implement markdown validation `src/core/markdownValidator.ts` (FR-015) invoked post-write.
- [ ] T046 Implement finalize links rewriting `src/core/finalizeLinks.ts` ensuring relative mapping (FR-004) complementing slug logic.
- [ ] T047 Implement performance collector `src/core/performanceCollector.ts` capturing durations & memory snapshots (NFR-001/002) feeding metrics.
- [ ] T048 Add error classifier & exit status mapping `src/core/errorClassifier.ts` & `src/core/exitStatus.ts` (FR-010) adjusting CLI exit codes.

## Phase 3.4: Integration & Hardening
- [ ] T049 Integrate attachment failure threshold logic (FR-006 thresholds 20%/25) in attachments pipeline; add threshold test extension in existing test file.
- [ ] T050 Add corruption simulation + recovery path invocation (T023 follow-up) verifying merge of partial queue files.
- [ ] T051 Add dry-run mode logic `src/core/dryRunPlanner.ts` usage in CLI (FR-014) with test assertions added to basic export test.
- [ ] T052 Add space key vs name resolution `src/confluence/api.ts` helper (FR-016) and tests.
- [ ] T053 Add root page filter logic `src/cli/index.ts` (FR-017) + integration test extension.
- [ ] T054 Add checksum/hash inclusion to manifest entries (optional FR-018 future-proofing flag guarded) making incremental hash path ready.
- [ ] T055 Add rate limit Retry-After honoring in `src/confluence/httpClient.ts` integration with backoff helper (FR-013) refine T014.
- [ ] T056 Add queue metrics logging cadence & final summary (FR-040) updates to `src/core/queueProgressReporter.ts`.
- [ ] T057 Add structured logging for all error/retry branches (NFR-004) expanding log tests.
- [ ] T058 Add resume guard enforcement (abort without --resume/--fresh) `src/core/resumeGuard.ts` (FR-021) augment integration tests.
- [ ] T059 Add deletion detection & removal of stale local pages (FR-011 removal path) with integration test assertion update.
- [ ] T060 Add breadth-first ordering verification test augmenting queue state test (FR-036).

## Phase 3.5: Polish & Performance
- [ ] T061 [P] Add performance test harness `tests/performance/export_medium_space.test.ts` measuring time & memory (NFR-001/002) with skip flag initially.
- [ ] T062 [P] Add documentation quickstart content updates in `specs/001-confluence-exporter/quickstart.md` referencing interrupts & two-queue model.
- [ ] T063 [P] Add README segment summarizing usage flags (--limit, --resume, --fresh, --cleanup-intensity, --disable-cleanup).
- [ ] T064 [P] Add additional unit tests for metrics edge cases (empty queues, rapid interrupts) `tests/unit/metrics_edge.test.ts`.
- [ ] T065 Refactor any functions exceeding complexity threshold adding `// COMPLEXITY-JUSTIFICATION:` where unavoidable.
- [ ] T066 Final audit: ensure all FR/NFR mapped to code comments with `FR-xxx` tags; add missing doc comments.
- [ ] T067 Run full test suite & ensure failing tests only for deferred optional FR-018 hash usage (explicit TODO markers) then remove skips when implemented.

## Dependencies Overview
- T001–T006 precede all others.
- T007–T026 (tests) must exist & fail before starting T027+.
- Queue implementation (T030–T033) required before orchestrator (T039).
- Discovery (T034) depends on queues (download) + registry.
- Backoff (T035) precedes retry integration (T055) & related tests.
- Interrupt handling (T041) after basic runner (T039) but before final integration hardening tasks.
- Metrics (T044, T056, T047) can progress after queues and runner exist.

## Parallel Execution Examples
```
# Example: Initial contract & integration tests in parallel
T007 T008 T009 T010 T011 T012 T013 T014 T015 T016 T017 T018 T019 T020 T021 T022 T023 T024 T025 T026

# Example: After tests written, parallel model/infra pieces
T027 T028 T029 T030 T031 T032 T033

# Example: Polish parallel batch
T061 T062 T063 T064
```

## Validation Checklist
- [ ] All FR-001..FR-042 traced to at least one task
- [ ] NFR-001..NFR-006 addressed (performance test, memory, atomic writer, structured logs, cleanup timing)
- [ ] Tests precede implementation
- [ ] Parallel tags only where file isolation present
- [ ] Interrupt semantics covered (T015, T016, T041)
- [ ] Limit semantics covered (T017, T042)
- [ ] Two-queue persistence & corruption covered (T008, T023, T030–T033, T050)

---
Generated 67 tasks.

## Supplemental Tests & Tasks (Gap Coverage)
These extend the canonical list to cover previously untracked requirements and clarifications (FR-019 additions, edge cases, NFR validation). Numbering continues from T067.

- [ ] T068 Integration test: Restricted page canonical handling (manifest status access_denied without failing run) `tests/integration/restricted_page_manifest.test.ts` (FR-010 clarification)
- [ ] T069 Unit test: Duplicate fetch avoidance with UnifiedPageRegistry (single raw fetch per page) `tests/unit/duplicate_fetch_avoidance.test.ts` (FR-012)
- [ ] T070 Integration test: Markdown validation failure produces VALIDATION_ERROR exit code unless `--allow-failures` `tests/integration/markdown_validation_failure.test.ts` (FR-015, FR-019)
- [ ] T071 Integration test: Resume guard exit (no flag) returns RESUME_REQUIRED exit code `tests/integration/resume_guard_exit.test.ts` (FR-021, FR-019)
- [ ] T072 Integration test: Auth failure (401) after retries exits CONTENT_FAILURE with structured logs `tests/integration/auth_failure.test.ts` (NFR-005, FR-013, FR-019)
- [ ] T073 Unit test: Atomic writer corruption simulation (partial temp write never leaks) `tests/unit/atomic_writer_corruption.test.ts` (NFR-003)
- [ ] T074 Integration test: Deep hierarchy export (>7 levels) path & parent lineage correctness `tests/integration/deep_hierarchy.test.ts` (Edge Case)
- [ ] T075 Integration test: Large page (>1MB) processing within time & memory thresholds `tests/integration/large_page_performance.test.ts` (NFR-001, NFR-002)
- [ ] T076 Integration test: Attachment filename collision resolution uniqueness `tests/integration/attachment_filename_collision.test.ts` (FR-006)
- [ ] T077 Unit test: Unicode slug normalization & collision suffixing `tests/unit/unicode_slug_collision.test.ts` (FR-008)
- [ ] T078 Unit test: Metrics latency avgTransitionLatency computation accuracy `tests/unit/metrics_latency.test.ts` (FR-040)
- [ ] T079 Integration test: --limit does not cap dynamic discovery depth `tests/integration/limit_deep_discovery.test.ts` (FR-041)
- [ ] T080 Unit test: Exit code mapping stability & uniqueness `tests/unit/exit_codes.test.ts` (FR-019)

## Validation Addendum
- [ ] All new FR clarifications mapped (FR-019 → T070/T071/T080; FR-040 metrics → T078)
- [ ] Duplicate fetch prevention validated (T069)
- [ ] Resume guard strictness validated (T071)
- [ ] Auth + retry interplay validated (T072)

## Coverage & Deferred Scope
- [ ] T081 Coverage verification: achieve ≥90% global and ≥95% for critical modules (queue persistence, export runner, cleanup pipeline, manifest); produce coverage summary artifact `coverage/critical-summary.json`. (Policy alignment with plan Coverage Policy Alignment section)
- [ ] T082 Deferred (document only): Advanced queue analytics/optimizer/backup rotation features (multi-window performance trend analysis, predictive prefetch, multi-tier backup) explicitly out-of-scope for MVP; record rationale in `specs/001-confluence-exporter/research.md` addendum.

## Deferred / Post-MVP Backlog (Non-blocking)
- Advanced queue performance optimization heuristics (adaptive concurrency scaling)
- Historical trend analytics & reporting dashboards
- Automatic queue state snapshot rotation with retention policies
- Predictive link prefetch beyond discovered references
