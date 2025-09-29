# Data Model

Date: 2025-09-29  
Feature: Confluence Space to Markdown Extraction Library with Cleanup

## Overview
Logical entities supporting export of a Confluence space to local Markdown with incremental & resumable capabilities, plus automated markdown cleanup and typography enhancement.

## Export Entities

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
| cleanupApplied | boolean | yes | Whether markdown cleanup was applied |

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
| cleanupStats | CleanupStats | no | Aggregate cleanup statistics |

### LinkReference
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sourcePageId | string | yes | Page containing link |
| targetPageId | string | no | Resolved target ID (null if external) |
| originalHref | string | yes | Original link value |
| rewrittenHref | string | no | Local relative link after rewrite |

## Queue Management Entities

### QueueItem
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pageId | string | yes | Confluence page ID to process |
| sourceType | "initial"\|"macro"\|"reference"\|"user" | yes | How page was discovered |
| discoveryTimestamp | number | yes | Unix timestamp when added to queue |
| retryCount | number | yes | Number of processing attempts (starts at 0) |
| parentPageId | string | no | Page that referenced this item (for tracing) |
| status | "pending"\|"processing"\|"completed"\|"failed" | yes | Current processing status |

### DownloadQueue
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| items | Map<string, QueueItem> | yes | Queue items indexed by page ID |
| processingOrder | string[] | yes | FIFO processing order (page IDs) |
| processedPages | Set<string> | yes | Completed page IDs (prevents duplicates) |
| metrics | QueueMetrics | yes | Performance and status metrics |
| persistencePath | string | yes | Disk persistence file path |
| maxQueueSize | number | yes | Soft limit for queue growth protection |
| persistenceThreshold | number | yes | Number of operations before forced save |

### QueueMetrics
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| totalQueued | number | yes | Total items ever added to queue |
| totalProcessed | number | yes | Total items successfully processed |
| totalFailed | number | yes | Total items that failed processing |
| currentQueueSize | number | yes | Items currently pending processing |
| discoveryRate | number | yes | Pages discovered per second (recent average) |
| processingRate | number | yes | Pages processed per second (recent average) |
| averageRetryCount | number | yes | Average retries per failed item |
| persistenceOperations | number | yes | Total queue persistence writes |
| lastPersistenceTime | string (ISO) | no | Timestamp of last successful persistence |

### QueuePersistence
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | number | yes | Queue state format version |
| timestamp | string (ISO) | yes | State snapshot timestamp |
| spaceKey | string | yes | Associated space key |
| queueItems | QueueItem[] | yes | Serialized queue items |
| processedPageIds | string[] | yes | Serialized processed pages set |
| metrics | QueueMetrics | yes | Metrics at persistence time |
| checksum | string | yes | Integrity verification hash |

## Cleanup Entities

### MarkdownDocument
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content | string | yes | Raw markdown content to be processed |
| filePath | string | yes | Source file path for context and error reporting |
| sourcePageId | string | no | Associated Confluence page ID |
| metadata | DocumentMetadata | yes | Document parsing and processing metadata |
| preservedSections | PreservedSection[] | no | Sections that should not be modified during cleanup |

### CleanupRule
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Unique identifier for the rule (e.g., 'typography', 'headings') |
| priority | number | yes | Execution order (lower numbers run first) |
| enabled | boolean | yes | Whether rule is active for current cleanup |
| config | RuleConfig | yes | Rule-specific configuration parameters |
| preserveTypes | ContentType[] | no | Content types this rule should skip |

### CleanupResult
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| originalContent | string | yes | Input markdown content |
| cleanedContent | string | yes | Output markdown after cleanup |
| appliedRules | RuleResult[] | yes | Results from each cleanup rule execution |
| processingTime | number | yes | Total processing duration in milliseconds |
| errors | CleanupError[] | no | Non-fatal errors encountered during cleanup |
| warnings | string[] | no | Advisory messages about processing |

### RuleResult
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ruleName | string | yes | Name of the applied rule |
| success | boolean | yes | Whether rule executed without errors |
| changesApplied | number | yes | Count of modifications made |
| processingTime | number | yes | Rule execution duration in milliseconds |
| errorMessage | string | no | Error details if rule failed |
| preservedBlocks | number | yes | Count of content blocks skipped by rule |

## Configuration Entities

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
| cleanup | CleanupConfig | yes | Markdown cleanup configuration |

### CleanupConfig
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| enabled | boolean | yes | Whether to apply cleanup post-processing |
| intensity | "light"|"medium"|"heavy" | yes | Cleanup aggressiveness level |
| rules | string[] | no | Specific rules to enable (null = all for intensity) |
| lineLength | number | yes | Target line length for word wrapping (default 92) |
| locale | string | yes | Language/region for typography rules (default 'en-us') |
| preserveFormatting | boolean | yes | Whether to preserve original formatting choices |

### RetryPolicy
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| attempts | number | yes | Max attempts (6) |
| baseDelayMs | number | yes | Base delay (500) |
| jitter | boolean | yes | Add jitter |
| honorRetryAfter | boolean | yes | Honor server `Retry-After` |

## Supporting Types

### DocumentMetadata
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| language | string | yes | Content language code (default: 'en-us') |
| frontmatter | boolean | yes | Whether document contains YAML/TOML frontmatter |
| hasMath | boolean | yes | Whether document contains mathematical notation |
| hasCode | boolean | yes | Whether document contains code blocks |
| wordCount | number | yes | Approximate word count for processing estimates |
| lineCount | number | yes | Total lines in document |

### PreservedSection
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | ContentType | yes | Type of preserved content |
| startLine | number | yes | Beginning line number (1-indexed) |
| endLine | number | yes | Ending line number (inclusive) |
| marker | string | yes | Text marker that identifies the section |

### CleanupError
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ruleName | string | yes | Rule that encountered the error |
| line | number | no | Line number where error occurred (if known) |
| message | string | yes | Human-readable error description |
| severity | "warning"|"error" | yes | Error impact level |

### CleanupStats
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| documentsProcessed | number | yes | Total documents cleaned |
| totalProcessingTime | number | yes | Aggregate cleanup time in milliseconds |
| rulesApplied | number | yes | Total rule applications across all documents |
| errorsEncountered | number | yes | Total non-fatal errors |
| averageProcessingTime | number | yes | Average time per document |

### ContentType (Enum)
- `TEXT` - Plain text content
- `CODE_BLOCK` - Fenced code blocks
- `INLINE_CODE` - Inline code spans
- `MATH_BLOCK` - Mathematical notation blocks
- `MATH_INLINE` - Inline mathematical notation
- `FRONTMATTER` - YAML/TOML frontmatter
- `HTML` - Raw HTML content
- `LINK` - Markdown links
- `IMAGE` - Image references

## Relationships
- Space 1→* Page
- Page 1→* Attachment  
- Page self-referential tree via parentId
- Page 1→* LinkReference (source)
- Page 1:1 MarkdownDocument (during cleanup)
- ManifestEntry 1:1 Page (latest export snapshot)
- ExportJob aggregates many ManifestEntry outcomes
- CleanupResult produced by applying CleanupRule[] to MarkdownDocument
- CleanupConfig → CleanupRule configuration
- ExportJob → CleanupStats aggregation
- **Queue Relationships:**
  - ExportJob 1:1 DownloadQueue (each job has associated queue)
  - DownloadQueue 1→* QueueItem (queue contains multiple items)
  - QueueItem N:1 Page (items reference pages to be processed)
  - QueueItem optionally references another Page via parentPageId
  - QueuePersistence 1:1 DownloadQueue (queue state serialization)

## State Transitions

### ExportJob
INIT → RUNNING → (COMPLETED | FAILED | ABORTED)
- FAILED if (pagesFailed >0 AND not allowed) OR attachment thresholds crossed
- ABORTED if user interruption mid-run

### MarkdownDocument Cleanup
Raw → Parsed → Processed → Cleaned
- Raw: Original transformed markdown content
- Parsed: Document structure identified, preserved sections marked
- Processed: Rules applied in priority order with error collection
- Cleaned: Final content with cleanup results and statistics

### CleanupResult
PENDING → PROCESSING → (COMPLETED | FAILED | SKIPPED)
- COMPLETED: All enabled rules processed successfully
- FAILED: Critical error prevents cleanup completion
- SKIPPED: Document excluded from cleanup (e.g., configuration, content type)

### QueueItem
PENDING → PROCESSING → (COMPLETED | FAILED)
- FAILED items can transition back to PENDING for retry (incrementing retryCount)
- COMPLETED items are moved to processedPages set and removed from active queue
- Maximum retryCount limits prevent infinite retry loops

### DownloadQueue
EMPTY → POPULATED → PROCESSING → (DRAINED | FAILED | INTERRUPTED)
- POPULATED: Initial pages added from space discovery
- PROCESSING: Items being processed with potential new discoveries
- DRAINED: All queue items successfully processed
- FAILED: Too many processing failures or queue corruption
- INTERRUPTED: Export stopped mid-processing, queue state preserved for resume

## Validation Rules

### Export Validation
- Slug uniqueness enforced by collision suffix
- Attachment failure threshold triggers non-zero exit
- Resume requires presence of journal & sentinel or explicit flag
- Hash recalculated each export to detect change

### Cleanup Validation
- Content must be valid UTF-8 text
- Line numbers must be positive and start ≤ end
- Rule names must be alphanumeric + hyphens only
- Line length must be between 40-200 characters
- Processing time must be non-negative
- Locale must be valid BCP-47 language tag

### Queue Validation
- Page IDs must be non-empty strings and unique within queue
- Source type must be one of valid enum values
- Discovery timestamp must be positive Unix timestamp
- Retry count must be non-negative integer ≤ maximum allowed retries
- Queue size must not exceed configured maximum (soft/hard limits)
- Processing order must maintain FIFO consistency with queue items
- Processed pages set must not contain items still in active queue
- Persistence checksum must verify queue state integrity

## Derived Data
- `hash` derived from normalized markdown content (after cleanup if enabled)
- `slug` derived from title normalization rules
- `rewrittenHref` derived after all target pages have paths
- `averageProcessingTime` calculated from total time / document count
- `preservedSections` identified during document parsing phase

## Performance Considerations

### Memory Usage
- Document content stored as immutable strings during cleanup
- Intermediate AST representations released after each rule
- Sequential rule processing for reliability
- Estimated memory overhead: 2-3x document size during cleanup

### Processing Targets
- Individual cleanup rules: <100ms for typical documents
- Total cleanup pipeline: <1000ms per document
- Export + cleanup combined: <10 minutes total for large spaces
- Memory efficiency: Process documents individually, not in batches

## Open Questions (Logged for Future)
- Title rename redirect mapping file format (deferred)
- Potential large-scale optimization (batch API endpoints) beyond MVP
- Advanced cleanup rule configuration via external config files
- Integration with external typography enhancement services
