# Test Fixtures

This directory contains HTML test fixtures for the markdown transformer tests.

## HTML Fixtures (`html/`)

Contains 10 real Confluence pages from the PR000299 space, saved as JSON files:

- `page-01-95956404.json` - "FCS Fidelity Charitable" (5245 chars) - Complex layout with tables, macros
- `page-02-95956405.json` - "Getting started with Confluence" (3273 chars) - Basic formatting, lists
- `page-03-95956406.json` - "Making a template" (2158 chars) - Ordered lists, info macro
- `page-04-104595607.json` - "Making a template for Confluence Pages" (1664 chars)
- `page-05-104595769.json` - "Engage Us!" (11632 chars) - Largest fixture, complex content
- `page-06-104595773.json` - "Projects (Archives)" (0 chars) - Empty page
- `page-07-104595779.json` - "Team Area" (127 chars) - Minimal content
- `page-08-104595782.json` - "Tools & Practices" (54 chars) - Very minimal content
- `page-09-104595793.json` - "Training and Meetings" (0 chars) - Empty page
- `page-10-104595805.json` - "Chef & C2C" (54 chars) - Very minimal content

Each fixture is a JSON object containing:
- `id`: Confluence page ID
- `title`: Page title
- `type`: Page type (usually "page")
- `version`: Page version number
- `parentId`: Parent page ID (if any)
- `ancestors`: Array of ancestor pages
- `bodyStorage`: Raw Confluence storage format HTML

## Expected Outputs (`expected/`)

*Currently empty - could be populated with expected markdown outputs for regression testing*

## Usage

These fixtures are automatically loaded by the transformer tests in `tests/unit/transformer_basic.test.ts`. The tests:

1. Validate that fixtures load correctly
2. Test individual transformer functions with synthetic HTML
3. Run integration tests against real fixture data
4. Verify that transformation produces valid markdown without HTML artifacts

## Regenerating Fixtures

To update the fixtures with fresh data from Confluence:

```bash
npx tsx scripts/fetch-test-fixtures.ts
```

This will fetch the first 10 pages from the PR000299 space and overwrite the existing fixtures.
