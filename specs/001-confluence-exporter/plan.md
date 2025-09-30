
# Implementation Plan: Confluence Space to Markdown Extraction Library

**Branch**: `001-confluence-exporter` | **Date**: 2025-09-30 | **Spec**: [spec.md](./spec.md)
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
Export all pages from a specified Confluence space into local Markdown files with preserved hierarchy, attachments, and cross-references. Designed for RAG system ingestion with two-queue architecture for robust processing, incremental updates, and graceful interrupt handling. Includes automatic markdown cleanup and comprehensive error recovery mechanisms.

## Technical Context
**Language/Version**: TypeScript 5.x (matching existing codebase)  
**Primary Dependencies**: remark ecosystem (unified, remark-parse, remark-stringify), textr for typography, axios for HTTP, p-limit for concurrency  
**Storage**: File system with JSON manifests and queue persistence  
**Testing**: Jest with comprehensive unit, integration, contract testing  
**Target Platform**: Node.js 20+ (CLI tool and library)
**Project Type**: single (CLI + library)  
**Performance Goals**: Medium space export (300-700 pages) within 10 minutes; <300MB memory usage  
**Constraints**: <1 second cleanup per markdown file; reliable queue persistence; graceful interrupt handling  
**Scale/Scope**: Enterprise Confluence spaces; supports thousands of pages with dynamic discovery; attachment handling with failure thresholds

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Code Quality & Readability (Principle I)**:
- ✅ TypeScript with strict mode enforced
- ✅ ESLint configured with zero-error policy
- ✅ All public APIs documented (ExportRunner, ConfluenceApi)
- ✅ Cyclomatic complexity monitoring in place
- ✅ Dependency rationale: axios (HTTP), remark (Markdown), textr (typography), p-limit (concurrency)
- ✅ Comprehensive logging and observability hooks

**Test-Driven & Verification Discipline (Principle II)**:
- ✅ TDD approach: Tests exist before implementation
- ✅ Test categories defined: unit, contract, integration, performance
- ✅ Coverage targets: ≥90% global, ≥95% for core modules
- ✅ No flaky tests in existing test suite
- ✅ Integration scenarios for all major user stories

**Consistent & Accessible User Experience (Principle III)**:
- ✅ CLI follows standard conventions with --help, --version
- ✅ Error messages provide actionable guidance
- ✅ Consistent interaction patterns for configuration
- ✅ No user-facing accessibility concerns (CLI tool)

**Quality Metrics & Operational Standards**:
- ✅ CI gates configured for lint, tests, coverage
- ✅ Performance targets defined: 10min for 300-700 pages, <300MB memory
- ✅ Structured logging with JSON format
- ✅ Atomic file operations for reliability

**Assessment**: PASS - All constitutional requirements satisfied. Existing codebase demonstrates adherence to quality principles.

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
├── cleanup/          # Markdown cleanup rules and service
├── cli/             # Command-line interface and configuration
├── confluence/      # Confluence API client and HTTP handling
├── core/            # Core export orchestration and business logic
├── fs/              # File system operations, manifest, atomic writes
├── models/          # Data types and entities
├── queue/           # Two-queue architecture implementation
├── services/        # Business logic services (incremental diff, etc.)
├── transform/       # Markdown transformation and cleanup rules
└── util/            # Shared utilities (logging, hashing, etc.)

tests/
├── contract/        # API contract tests
├── integration/     # End-to-end export scenarios
├── performance/     # Performance and load testing
└── unit/           # Component unit tests

spaces/             # Export output directory
```

**Structure Decision**: Single project structure chosen as this is a CLI tool and library for Confluence export functionality. The existing codebase follows a well-organized modular approach with clear separation of concerns between API interaction, processing queues, transformation, and file operations.

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
- Load `.specify/templates/tasks-template.md` as base structure
- Generate tasks from existing design docs (contracts, data model, quickstart)
- Extract implementation gaps from the comprehensive task list in existing `tasks.md`
- Each API contract → contract test task [P] (can be parallelized)
- Each entity → model validation task [P] 
- Each user story from quickstart → integration test task
- Implementation tasks ordered to make tests pass using TDD approach
- Queue architecture tasks for two-queue implementation
- Cleanup pipeline tasks for markdown enhancement
- Performance and reliability tasks for large-scale exports

**Ordering Strategy**:
- TDD order: Tests before implementation (failing tests first)
- Dependency order: Models → Services → CLI → Integration 
- Foundation first: Core entities, utilities, basic API client
- Queue system: Download queue → Processing queue → Orchestration
- Transformation: Basic markdown → Enhanced transformation → Cleanup
- Mark [P] for parallel execution (independent files/modules)

**Integration with Existing Tasks**:
Since comprehensive tasks already exist in `tasks.md`, the /tasks command will:
1. Validate existing task completeness against new design artifacts
2. Identify any gaps or missing implementation details
3. Ensure task ordering follows TDD and constitutional principles
4. Update task status and dependencies based on current implementation state

**Estimated Output**: 
- Review and validate ~85 existing numbered, ordered tasks in tasks.md
- Add any missing tasks for constitutional compliance
- Ensure proper [P] marking for parallelizable work
- Validate dependency ordering and TDD approach

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
- [x] Phase 0: Research complete (/plan command) ✅ 2025-09-30
- [x] Phase 1: Design complete (/plan command) ✅ 2025-09-30
- [x] Phase 2: Task planning complete (/plan command - describe approach only) ✅ 2025-09-30
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS ✅ 2025-09-30
- [x] Post-Design Constitution Check: PASS ✅ 2025-09-30
- [x] All NEEDS CLARIFICATION resolved ✅ 2025-09-30
- [x] Complexity deviations documented ✅ None required

**Artifacts Generated**:
- [x] research.md ✅ Comprehensive decision log completed
- [x] data-model.md ✅ All entities defined with cleanup integration
- [x] contracts/ ✅ API contracts and queue interfaces documented
- [x] quickstart.md ✅ Complete user journey with examples
- [x] .github/copilot-instructions.md ✅ Agent context updated

**Ready for Next Phase**: /tasks command can proceed to validate and enhance existing tasks.md

---
*Based on Constitution v3.0.0 - See `/memory/constitution.md`*
