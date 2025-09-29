
# Implementation Plan: Confluence Space to Markdown Extraction Library

**Branch**: `001-i-like-to` | **Date**: 2025-09-29 | **Spec**: `specs/001-i-like-to/spec.md`
**Input**: Feature specification from `specs/001-i-like-to/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from file system structure or context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Export a full Confluence space (hierarchical pages + attachments) into a deterministic local Markdown tree under `spaces/<space_key>/` preserving structure, rewriting internal links, and generating a manifest suitable for future RAG ingestion. Technical approach (Node.js library + CLI): Use Confluence REST API pagination to traverse pages breadth-first, convert storage format to CommonMark, download attachments into `assets/`, maintain a manifest JSON for incremental detection, and enforce idempotent slugification with collision suffixes. Resumability requires explicit `--resume`/`--fresh` after interruption.

## Technical Context
**Language/Version**: Node.js 20 LTS (ESM)  
**Primary Dependencies**: `axios` (HTTP with retry adapter or custom), `commander` (CLI), `gray-matter` (front matter), `p-limit` (concurrency control), `marked` or custom storage-format→Markdown transformer (TBD), `winston` or lightweight JSON logger (TBD).  
**Storage**: Local filesystem only (no DB); manifest JSON; optional hash file.  
**Testing**: Jest + ts-jest (unit, integration); CLI smoke via node test script; possibility of contract tests via mocked Confluence API using `nock`.  
**Target Platform**: macOS/Linux CI environments (non-interactive).  
**Project Type**: Single library + CLI entrypoint.  
**Performance Goals**: Medium space (~500 pages) <10 min baseline (target refine to <7 min if average page <50KB).  
**Constraints**: Memory <300MB RSS; no page-level content loss; atomic writes; retry budget per request ≤6 attempts; respectful rate limit compliance; Basic Auth only (username/password) no token flow in MVP.  
**Scale/Scope**: Designed for up to ~5k pages initial; beyond that consider streaming refinements (defer).

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Initial Evaluation (Pre-Design):
- Code Quality & Readability: PASS (simple Node.js modular layout; plan includes linting & doc comments)  
- Test-Driven & Verification Discipline: PARTIAL (will formalize coverage targets & failing contract tests in Phase 1)  
- Consistent & Accessible User Experience: N/A (CLI only; ensure helpful error messages & structured logs)  
- Performance & Efficiency Budgets: PARTIAL (targets stated; need concrete instrumentation + measurement harness)  
Violations / Actions: None blocking; mark PARTIAL items to elevate to PASS post Phase 1.

Post-Design check placeholder (will update after contracts & data model): EXPECTED PASS.

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->
ios/ or android/
```
src/
├── cli/                # CLI entrypoint (bin script using commander)
├── core/               # Core orchestration (export runner, pipeline)
├── confluence/         # API client, pagination, DTO mapping
├── transform/          # Storage format → Markdown conversion utilities
├── fs/                 # Filesystem writers (atomic write, slug, manifest)
├── models/             # TypeScript types & entity models
├── services/           # Higher-level services (incremental diff, link rewrite)
└── util/               # Logging, retry/backoff, concurrency helpers

tests/
├── unit/               # Pure function/utility & model tests
├── integration/        # End-to-end simulated export with mocked API
└── contract/           # Contract tests for API client assumptions
```

**Structure Decision**: Single library + CLI; separation by concern (API, transform, persistence) to keep complexity low and test isolation high.

## Phase 0: Outline & Research
Outstanding Spec Unknowns Targeted:
- Permissions handling policy (skip vs fail) → Decide default skip with warning & cumulative error threshold flag.
- Attachment failure threshold X% → Propose default 20% triggers non-zero exit.
- Logging format (JSON vs key=value) → Choose line-delimited JSON for machine parsing; human-friendly summary at end.
- Auth mechanism (CI) → Support PAT/token via env (`CONFLUENCE_TOKEN`) + base URL + email/user; fallback interactive prompt only if TTY.
- Performance target refinement (<10 min) → Draft instrumentation (pages/sec metric; target ≥1.2 pages/sec baseline with parallelism 5).
- Memory ceiling numeric (<300MB) → Track heap usage; streaming page processing; store only necessary fields.
- Root page filter & title rename in MVP? → Defer title rename redirect mapping to post-MVP; include root filter in MVP.

Research Decisions (to record in `research.md`):
1. HTTP Client & Retry: Use `axios` with custom interceptor implementing backoff spec; alt: `got` (good retry) rejected to keep deps minimal.
2. Markdown Conversion: Evaluate `@atlassian/atlas-markdown` (if available) vs custom minimal converters; choose pluggable strategy abstraction to allow improvement later.
3. Concurrency Model: Use `p-limit` with configurable concurrency (default 5) to respect rate limiting; alt naive Promise.all rejected (burst risk).
4. Manifest Hashing: Use SHA-256 content hash (truncated 12 hex) for change detection; alt byte-length + timestamp rejected (less reliable).
5. Resumability Markers: Write temp marker `.export-in-progress` with journal of completed page IDs to enable resume.
6. Slugification: Use lowercase, replace spaces with `-`, remove unsafe chars, collapse dashes, trim, length cap 120 chars; stable.
7. Logging: Line JSON `{level,time,msg,context}`; final summary block.
8. Testing Strategy: Contract tests mock a subset of API responses (pagination, attachment variants, rate limit 429 path).

Output: Create `research.md` capturing each decision with rationale & alternatives; ensure no remaining NEEDS CLARIFICATION block future design.

## Phase 1: Design & Contracts
Prerequisite: `research.md` committed.

1. Data Model (`data-model.md`): Detail entities Space, Page, Attachment, ExportJob, ManifestEntry, LinkReference, plus supplementary: ExportConfig, RetryPolicy. Include field types, constraints, and relationships (Page.parentId tree, Attachment.pageId). Add state transitions for ExportJob (INIT → RUNNING → COMPLETED|FAILED|ABORTED).
2. API Contracts (`/contracts/`): Not public external API; instead internal Confluence client contracts documented as pseudo OpenAPI subset (GET space, GET pages (paginated), GET page content, GET attachments). Provide schemas for responses we rely on; emphasize fields consumed. Provide a conversion interface contract: `IContentTransformer` with `toMarkdown(apiContent: ConfluenceContent) -> string`.
3. Contract Tests (`tests/contract`): For each Confluence endpoint scenario: success, pagination multi-page, rate limited (429), attachment download. Tests initially failing (unimplemented client) but with response fixtures.
4. Integration Scenarios (`tests/integration`): Full export happy path, interrupted export resume, attachment failure threshold triggering exit, slug collision, internal link rewrite correctness.
5. Quickstart (`quickstart.md`): Install, configure env vars, run dry-run, run export, interpret manifest & logs.
6. Update agent context file via `.specify/scripts/bash/update-agent-context.sh copilot` after generating design docs.

Outputs: `data-model.md`, `contracts/*.md|.yml`, contract tests, integration test skeletons, `quickstart.md`.

## Phase 2: Task Planning Approach
Strategy (for /tasks command later):
- Derive tasks per entity (models), per contract (client methods), per transformation feature, per CLI command/flag, per test scenario.
- Tag parallelizable tasks [P] where order independent (e.g., independent model definitions, isolated utility implementations after tests exist).
- Sequence: 1) Contract tests, 2) Models/types, 3) Confluence client stub → make contract tests pass, 4) Transformer tests + implementation, 5) Filesystem atomic writer, 6) Manifest & incremental diff logic, 7) Link rewrite, 8) CLI wrapper & argument parsing, 9) Resume logic, 10) Performance instrumentation & logging polish.
- Coverage gating: ensure each FR mapped to at least one test or validation step.

Estimated tasks: ~28.

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
No deviations requiring justification (single-project structure, minimal deps).


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitution v3.0.0 - See `/memory/constitution.md`*
