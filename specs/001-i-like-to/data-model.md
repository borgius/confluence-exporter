# Data Model

Date: 2025-09-29  
Feature: Confluence Space to Markdown Extraction Library

## Overview
Logical entities supporting export of a Confluence space to local Markdown with incremental & resumable capabilities.

## Entities

### Space
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| key | string | yes | Confluence space key (canonical) |
| name | string | yes | Human-readable space name |
| baseUrl | string | yes | Base URL for Confluence instance |

### Page
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Confluence page ID |
| title | string | yes | Original page title |
| parentId | string|null | no | Parent page ID (null for roots) |
| version | number | yes | Confluence version integer |
| lastModified | string (ISO) | yes | Last modified timestamp |
| bodyStorage | string | yes | Raw storage format markup |
| ancestors | string[] | no | Optional list root→parent chain IDs |

### Attachment
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Attachment ID |
| pageId | string | yes | Owning page ID |
| filename | string | yes | Original filename |
| mediaType | string | yes | MIME type |
| downloadUrl | string | yes | Direct download URL |
| sizeBytes | number | no | Size metadata (if provided) |

### ManifestEntry
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pageId | string | yes | Page ID |
| path | string | yes | Relative markdown path |
| hash | string | yes | Content hash (12-hex) |
| lastExported | string (ISO) | yes | Export timestamp |
| title | string | yes | Title at export time |
| version | number | yes | Page version at export |
| slug | string | yes | Derived slug |
| status | "ok"|"skipped"|"denied" | yes | Export outcome |

### ExportJob
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | UUID for job instance |
| startTime | string (ISO) | yes | Start timestamp |
| endTime | string (ISO)| no | Completion timestamp |
| mode | "full"|"incremental" | yes | Export mode |
| resume | boolean | yes | Was job resumed |
| pagesTotal | number | no | Count discovered |
| pagesSucceeded | number | no | Pages exported success |
| pagesFailed | number | no | Failed pages count |
| attachmentsFailed | number | no | Failed attachments count |
| warnings | number | no | Warning count |
| concurrency | number | yes | Concurrency used |

### LinkReference
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sourcePageId | string | yes | Page containing link |
| targetPageId | string | no | Resolved target ID (null if external) |
| originalHref | string | yes | Original link value |
| rewrittenHref | string | no | Local relative link after rewrite |

### ExportConfig
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| spaceKey | string | yes | Target space key |
| rootPageId | string | no | Optional root subtree limit |
| dryRun | boolean | yes | Do not write files |
| outputDir | string | yes | Base output directory |
| concurrency | number | yes | Parallel page fetch limit (default 5) |
| resumeMode | "resume"|"fresh"|null | yes | Null unless explicit resume/fresh required |
| attachmentFailurePct | number | yes | Threshold percent (20) |
| attachmentFailureAbs | number | yes | Absolute threshold (25) |
| logFormat | "json" | yes | Logging format constant |

### RetryPolicy
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| attempts | number | yes | Max attempts (6) |
| baseDelayMs | number | yes | Base delay (500) |
| jitter | boolean | yes | Add jitter |
| honorRetryAfter | boolean | yes | Honor server `Retry-After` |

## Relationships
- Space 1→* Page
- Page 1→* Attachment
- Page self-referential tree via parentId
- Page 1→* LinkReference (source)
- ManifestEntry 1:1 Page (latest export snapshot)
- ExportJob aggregates many ManifestEntry outcomes

## State Transitions
ExportJob: INIT → RUNNING → (COMPLETED | FAILED | ABORTED)
- FAILED if (pagesFailed >0 AND not allowed) OR attachment thresholds crossed.
- ABORTED if user interruption mid-run.

## Validation Rules
- Slug uniqueness enforced by collision suffix.
- Attachment failure threshold triggers non-zero exit.
- Resume requires presence of journal & sentinel or explicit flag.
- Hash recalculated each export to detect change.

## Derived Data
- `hash` derived from normalized markdown content.
- `slug` derived from title normalization rules.
- `rewrittenHref` derived after all target pages have paths.

## Open Questions (Logged for Future)
- Title rename redirect mapping file format (deferred).
- Potential large-scale optimization (batch API endpoints) beyond MVP.
