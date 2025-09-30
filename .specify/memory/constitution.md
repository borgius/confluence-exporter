<!--
Sync Impact Report
Version: 2.1.1 → 3.0.0 (MAJOR)
Reason: Structural change (replaced 5 generic principle placeholders with 4 concrete principles; removed unused 5th principle section), substantive new measurable rules.

Modified Principles: (placeholders → concrete)
- PRINCIPLE_1_NAME → Code Quality & Readability
- PRINCIPLE_2_NAME → Test-Driven & Verification Discipline
- PRINCIPLE_3_NAME → Consistent & Accessible User Experience
- PRINCIPLE_4_NAME → Performance & Efficiency Budgets

Removed Sections:
- Placeholder principle slot #5 (previously [PRINCIPLE_5_NAME])

Added Sections:
- Quality Metrics & Operational Standards (Section 2)
- Development Workflow & Quality Gates (Section 3)

Templates Requiring Updates:
- .specify/templates/plan-template.md (version reference) ✅ updated
- .specify/templates/spec-template.md (no direct version reference) ✅ no change needed
- .specify/templates/tasks-template.md (aligns with performance test mention) ✅ no change needed
- .specify/templates/agent-file-template.md (auto-generated; no outdated references) ✅ no change

Deferred / TODO Items:
- TODO(RATIFICATION_DATE): Original adoption date unknown; set if historical record exists
- TODO(PERF_MEMORY_BUDGET_OVERRIDE): Override 300MB/service if domain requires different baseline
- TODO(MUTATION_TESTING_POLICY): Define mutation testing tool & target if adopted

Validation Checklist:
- No remaining unreplaced bracket tokens (except intentional TODO markers above)
- Dates ISO formatted
- Principles declarative & measurable
-->

# Confluence Project Constitution

## Core Principles

### I. Code Quality & Readability
All production code MUST be understandable, maintainable, and observable.

Rules:
- MUST pass automated linting & static analysis with zero errors and zero new warnings.
- MUST keep function cyclomatic complexity ≤ 10 (justify exceptions inline with `// COMPLEXITY-JUSTIFICATION:` comment).
- Public APIs MUST include doc comments with usage example; missing docs block merge.
- No dead code: unused functions, feature-flagged legacy paths >30 days old MUST be removed or ticketed for removal.
- Dependency additions MUST include a rationale (security, size, maintenance risk). High-risk deps require reviewer approval noting risk evaluation.
- Code style MUST follow the repository formatter output (no manual style debates in review).
- Each PR MUST have ≥1 peer review; reviewers MUST enforce these rules as a gate.
- Observability hooks (logging/metrics/traces) MUST exist for non-trivial branches (error, retry, external call) before merge.

Rationale: High, enforced quality lowers long-term change cost and accelerates safe iteration.

### II. Test-Driven & Verification Discipline
Implementation follows tests—not the reverse—and the test suite serves as the living contract of behavior.

Rules:
- TDD mandatory: Write failing test → implement → refactor; commits violating this order MAY be rejected.
- Test categories MUST be used: unit, contract, integration, end-to-end.
- Coverage: global line ≥ 90%; critical modules (security, pricing, auth, migrations) ≥ 95%.
- No brittle tests: any flaky test MUST be fixed or quarantined within 1 working day; quarantined tests block release if >7 days old.
- New features REQUIRE at least one integration or end-to-end scenario unless purely internal utility.
- Test names MUST describe intent (Given_When_Then style for integration / e2e).
- A red test MUST precede any new non-trivial code path in the same PR.

Rationale: Proven correctness reduces regression risk and enables fearless refactoring.

### III. Consistent & Accessible User Experience
User-facing interactions MUST be consistent, predictable, and accessible across all surfaces.

Rules:
- All UI components MUST use the shared design system tokens (color, spacing, typography); ad-hoc styles forbidden.
- Accessibility: WCAG 2.1 AA conformance required (contrast ≥4.5:1, focus visible, keyboard navigation complete, ARIA where needed).
- Error & empty states MUST provide actionable guidance (no generic “Something went wrong”).
- Interaction patterns (modals, toasts, forms) MUST reuse existing components; new patterns require design review.
- Copy MUST be concise, user-centered, and free of internal jargon; changes to critical wording (legal, security) require stakeholder approval.
- UX changes altering task success flow MUST include before/after usability rationale or data point.

Rationale: Consistency and accessibility improve user trust, task success rate, and reduce support burden.


## Quality Metrics & Operational Standards

| Domain | Metric | Target | Enforcement |
|--------|--------|--------|-------------|
| Code Quality | Lint errors | 0 | CI gate |
| Code Quality | Complexity per function | ≤10 | Review + tooling |
| Testing | Line coverage (global) | ≥90% | CI report gate |
| Testing | Critical module coverage | ≥95% | CI blocking |
| Testing | Flaky tests | 0 unresolved >24h | Daily triage |

Notes:
- Metrics serve as hard gates unless explicitly waived with tracked issue.
- Waivers MUST include expiry date ≤30 days.

## Development Workflow & Quality Gates

1. Spec Creation → Validate clarity (no implementation details) per spec template.
2. Plan Generation → Constitution Check enumerates: quality, testing coverage plan, UX impacts.
3. Test Authoring → Required categories in place before implementation.
4. Implementation → Keep changes minimal; ensure observability instrumentation.
6. Accessibility & UX Validation → Automated + manual checks before merge.
7. Review & Merge → All gates green; unresolved TODO markers prohibited (except constitution-authorized TODOs above).
8. Post-Merge Monitoring → Verify no regression in first 24h using metrics dashboards.

Gate Failure Policy:
- Any gate failure blocks merge; temporary bypass requires maintainer approval and issue reference.

## Governance

Authority & Scope:
- This constitution supersedes conflicting project guidelines.

Amendment Process:
1. Open PR labeled `constitution` containing proposed diff + impact analysis (principles affected, expected version bump type).
2. Obtain approval from ≥2 maintainers (or designated governance group).
3. Determine version bump:
  - MAJOR: Remove or redefine principle; backward-incompatible rule updates.
  - MINOR: Add new principle/section; materially expand rules.
  - PATCH: Clarifications, typo fixes, non-semantic wording.
4. Update version, `Last Amended` date, Sync Impact Report.
5. Merge; notify contributors (changelog / announcement channel).

Compliance & Review:
- Quarterly compliance review audits sample PRs for adherence.
- Violations trigger remediation tasks before next release cycle.
- Emergency security amendments allowed with retro review ≤5 days later.

Lifecycle & Waivers:
- Temporary waivers MUST link to issue with expiry ≤30 days; expired waivers auto-invalid.
- Undocumented exceptions are policy violations.

Versioning & Traceability:
- Each artifact referencing constitution SHOULD pin explicit version.
- Automation MAY enforce version sync in templates.

**Version**: 3.0.0 | **Ratified**: TODO(RATIFICATION_DATE) | **Last Amended**: 2025-09-29

---
Historical note: Prior template referenced v2.1.1; this release formalizes concrete principles and measurable gates.
