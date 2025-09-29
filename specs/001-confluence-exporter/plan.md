
# Implementation Plan: Confluence Space to Markdown Extraction Library with Global Download Queue

**Branch**: `001-confluence-exporter` | **Date**: 2025-09-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-confluence-exporter/spec.md`

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
Confluence Space to Markdown Extraction Library that fetches all pages from a Confluence space, converts them to Markdown format, and stores them locally with preserved hierarchy. The system implements a global download queue to manage discovered page dependencies (from macros like list-children, user mentions, and page links) with persistent state management for resume capability. Designed for downstream RAG system integration while emphasizing correctness, completeness, and traceability.

## Technical Context
**Language/Version**: TypeScript 5.x (matching existing codebase)  
**Primary Dependencies**: remark ecosystem (unified, remark-parse, remark-stringify), textr for typography, axios for HTTP, p-limit for concurrency  
**Storage**: File system with JSON manifests and queue persistence  
**Testing**: Jest with contract tests using nock fixtures  
**Target Platform**: Node.js CLI tool, CI-friendly  
**Project Type**: single - CLI library with modular architecture  
**Performance Goals**: ≥1.2 pages/sec average for 500-page space, <10 minutes for medium spaces (300-700 pages)  
**Constraints**: <300MB RSS memory usage, <200ms API p95 latency, atomic file operations  
**Scale/Scope**: Supports spaces with 1000+ pages, handles deep hierarchies (>7 levels), manages download queues with thousands of discovered dependencies (soft limit: 10,000 items with warning; hard limit: 50,000 items with error to maintain <300MB memory budget)

**Global Download Queue Context**: 
- Implements persistent queue tracking all pages requiring processing
- Automatically discovers page dependencies during transformation (list-children macros, user mentions, page links)
- Saves queue state to disk after each modification for resume capability
- Processes queue in breadth-first manner to handle all discovered pages
- Prevents infinite loops with duplicate tracking and circular reference detection

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Code Quality & Readability**:
- ✅ TypeScript provides static analysis; ESLint configuration exists
- ✅ Modular architecture supports <10 complexity per function
- ✅ Public APIs will include JSDoc with usage examples
- ✅ No dead code policy; new dependencies justified (HTTP client, markdown processing, concurrency control)

**Test-Driven & Verification Discipline**:
- ✅ TDD approach: contract tests → models → services → CLI
- ✅ Test categories planned: unit (models), contract (API), integration (full export), performance (speed/memory)
- ✅ Coverage targets: ≥90% global, ≥95% for critical paths (queue management, resume logic, link rewriting)
- ✅ Failing tests will be written before implementation

**Consistent & Accessible User Experience**:
- ✅ CLI interface provides clear error messages and actionable guidance
- ✅ Progress reporting and structured logging for observability
- ✅ Non-interactive mode for CI environments
- ✅ Consistent file naming and path conventions

**Performance & Efficiency Budgets**:
- ✅ API latency budget <200ms p95 with retry/backoff
- ✅ Memory budget <300MB RSS with streaming processing
- ✅ Performance regression protection via benchmark tests
- ✅ Queue processing metrics and progress instrumentation

**Specific Considerations for Global Download Queue**:
- Queue persistence operations must be atomic to prevent corruption
- Memory efficiency critical as queue may grow to thousands of items
- Circular reference detection required to prevent infinite processing
- Recovery mechanisms needed for interrupted queue operations

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
```
src/
├── models/              # Entities: Space, Page, Attachment, ExportJob, etc.
│   ├── entities.ts
│   ├── markdownCleanup.ts
│   └── optionalFeatures.ts
├── services/            # Business logic: queue management, export coordination
│   ├── index.ts
│   ├── incrementalDiff.ts
│   ├── restrictedHandling.ts
│   └── rootFilter.ts
├── core/                # Core export engine and orchestration
│   ├── index.ts
│   ├── exportRunner.ts
│   ├── dryRunPlanner.ts
│   ├── finalizeLinks.ts
│   ├── markdownValidator.ts
│   ├── metrics.ts
│   ├── performanceCollector.ts
│   ├── resumeGuard.ts
│   └── thresholds.ts
├── transform/           # Content transformation pipeline
│   ├── index.ts
│   ├── markdownTransformer.ts
│   ├── enhancedMarkdownTransformer.ts
│   ├── linkRewriter.ts
│   └── attachmentRewriter.ts
├── confluence/          # Confluence API client
│   ├── index.ts
│   ├── api.ts
│   └── httpClient.ts
├── fs/                  # File system operations
│   ├── index.ts
│   ├── atomicWriter.ts
│   ├── attachments.ts
│   ├── manifest.ts
│   ├── resumeJournal.ts
│   └── slugCollision.ts
├── cleanup/             # Markdown post-processing
│   ├── cleanupService.ts
│   ├── typographyRule.ts
│   └── whitespaceRule.ts
├── cli/                 # Command-line interface
│   ├── index.ts
│   ├── configLoader.ts
│   ├── interrupt.ts
│   └── progress.ts
└── util/                # Shared utilities
    ├── checksum.ts
    └── ...

tests/
├── contract/            # API contract tests using nock
├── integration/         # Full export workflow tests
└── unit/               # Component unit tests

spaces/                  # Export output directory
└── <space_key>/        # Individual space exports
```

**Structure Decision**: Single project structure with modular architecture. The existing TypeScript codebase follows this pattern with clear separation of concerns: models for data structures, services for business logic, core for orchestration, transform for content processing, and specialized modules for Confluence API, file operations, cleanup, and CLI.

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh copilot`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract → contract test task [P]
- Each entity → model creation task [P] 
- Each user story → integration test task
- Implementation tasks to make tests pass
- **Queue-specific task generation**:
  - Queue infrastructure tasks (persistence, metrics, validation)
  - Discovery integration tasks (transformer hooks, pattern matching)
  - Queue processing tasks (FIFO processing, retry logic, circular detection)
  - Resume/recovery tasks (state restoration, corruption handling)

**Ordering Strategy**:
- TDD order: Tests before implementation 
- Dependency order: Models before services before UI
- **Queue implementation order**:
  1. Queue data structures and basic operations
  2. Persistence layer and atomic operations
  3. Discovery hooks and transformer integration
  4. Processing engine and retry logic
  5. Integration with existing export pipeline
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 35-40 numbered, ordered tasks in tasks.md (increased from 25-30 due to queue functionality)

**Queue Task Categories**:
- **Queue Core** (5-7 tasks): Basic queue operations, data structures, validation
- **Queue Persistence** (3-4 tasks): Disk persistence, atomic writes, corruption recovery
- **Queue Discovery** (4-5 tasks): Transformer integration, discovery hooks, pattern matching
- **Queue Processing** (4-5 tasks): Processing engine, retry logic, metrics, circular detection
- **Queue Integration** (3-4 tasks): Export runner integration, progress reporting, resume logic

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) - Updated with queue decisions
- [x] Phase 1: Design complete (/plan command) - Data model, contracts, quickstart updated
- [x] Phase 2: Task planning complete (/plan command - describe approach only) - Queue task categories and ordering defined
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS - Queue design maintains performance budgets, memory efficiency, and error handling requirements
- [x] All NEEDS CLARIFICATION resolved
- [ ] Complexity deviations documented

---
*Based on Constitution v3.0.0 - See `/memory/constitution.md`*
