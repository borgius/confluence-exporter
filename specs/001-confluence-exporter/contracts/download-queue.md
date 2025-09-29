# Download Queue Contracts

Version: Draft 2025-09-29  
Feature: Global Download Queue for Confluence Export

## Queue Operations Contract

### Queue State Management
```ts
interface QueueState {
  version: number;
  timestamp: string; // ISO
  spaceKey: string;
  items: QueueItem[];
  processedPageIds: string[];
  metrics: QueueMetrics;
  checksum: string;
}

interface QueueItem {
  pageId: string;
  sourceType: 'initial' | 'macro' | 'reference' | 'user';
  discoveryTimestamp: number;
  retryCount: number;
  parentPageId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}
```

### Queue Discovery Contract
```ts
interface PageDiscoveryResult {
  discoveredPageIds: string[];
  discoveredUsers: string[];
  sourceType: 'macro' | 'reference' | 'user';
  parentPageId: string;
}

interface DiscoveryHook {
  name: string;
  pattern: string | RegExp;
  handler: (match: string, context: DiscoveryContext) => Promise<PageDiscoveryResult>;
}

interface DiscoveryContext {
  api: ConfluenceApi;
  currentPageId: string;
  spaceKey: string;
  baseUrl: string;
}
```

### Queue Processing Contract
```ts
interface QueueProcessor {
  processNext(): Promise<ProcessingResult>;
  processAll(): Promise<ProcessingSummary>;
  isComplete(): boolean;
  canContinue(): boolean;
}

interface ProcessingResult {
  item: QueueItem;
  status: 'success' | 'failed' | 'skipped';
  newDiscoveries: QueueItem[];
  error?: Error;
  processingTime: number;
}

interface ProcessingSummary {
  totalProcessed: number;
  totalFailed: number;
  totalDiscovered: number;
  processingTime: number;
  errors: ProcessingError[];
}
```

## Queue Persistence Contract

### File Format
Queue state persisted as JSON with atomic write operations:

```json
{
  "version": 1,
  "timestamp": "2025-09-29T10:30:00.000Z",
  "spaceKey": "PROJ",
  "items": [
    {
      "pageId": "123456",
      "sourceType": "macro",
      "discoveryTimestamp": 1727601000000,
      "retryCount": 0,
      "parentPageId": "123455",
      "status": "pending"
    }
  ],
  "processedPageIds": ["123455", "123454"],
  "metrics": {
    "totalQueued": 10,
    "totalProcessed": 8,
    "totalFailed": 0,
    "currentQueueSize": 2,
    "discoveryRate": 2.5,
    "processingRate": 1.8,
    "averageRetryCount": 0.1,
    "persistenceOperations": 15
  },
  "checksum": "abc123def456"
}
```

### Persistence Operations
```ts
interface QueuePersistenceOps {
  // Write queue state atomically
  persist(state: QueueState): Promise<void>;
  
  // Read and validate queue state
  restore(): Promise<QueueState | null>;
  
  // Check if persisted state exists
  exists(): Promise<boolean>;
  
  // Remove persisted state
  cleanup(): Promise<void>;
  
  // Validate state integrity
  validateChecksum(state: QueueState): boolean;
}
```

## Discovery Patterns Contract

### Macro Discovery
List-children macro discovery pattern:
```xml
<ac:structured-macro ac:name="list-children">
  <ac:parameter ac:name="page">parent-page-title</ac:parameter>
</ac:structured-macro>
```

Discovery result: All child pages of specified parent (or current page if no parameter)

### User Reference Discovery
User mention discovery pattern:
```xml
<ac:link ac:type="userinfo">
  <ri:user ri:userkey="user123" />
</ac:link>
```

Discovery result: User profile page ID (if it exists and is accessible)

### Page Link Discovery
Internal page link discovery pattern:
```xml
<ac:link ac:type="page">
  <ri:page ri:content-title="Target Page" ri:space-key="SPACE" />
</ac:link>
```

Discovery result: Referenced page ID in same or different space

## Error Handling Contract

### Queue Errors
```ts
interface QueueError extends Error {
  code: 'QUEUE_FULL' | 'PERSISTENCE_FAILED' | 'CORRUPTION_DETECTED' | 'CIRCULAR_REFERENCE';
  pageId?: string;
  queueSize?: number;
  retryable: boolean;
}

interface ProcessingError extends Error {
  code: 'PAGE_NOT_FOUND' | 'ACCESS_DENIED' | 'TRANSFORM_FAILED' | 'DISCOVERY_FAILED';
  pageId: string;
  retryCount: number;
  retryable: boolean;
}
```

### Recovery Strategies
- **QUEUE_FULL**: Log warning, continue processing existing items
- **PERSISTENCE_FAILED**: Continue in-memory, retry persistence on next operation
- **CORRUPTION_DETECTED**: Rebuild queue from manifest and current state
- **CIRCULAR_REFERENCE**: Skip page, log warning, continue processing
- **PAGE_NOT_FOUND**: Mark as failed, continue processing
- **ACCESS_DENIED**: Skip with warning, continue processing
- **TRANSFORM_FAILED**: Retry up to limit, then mark as failed
- **DISCOVERY_FAILED**: Log warning, continue with partial discoveries

## Integration Points Contract

### Export Runner Integration
```ts
interface ExportRunnerQueueOps {
  initializeQueue(spacePages: Page[]): Promise<void>;
  processQueueUntilEmpty(): Promise<QueueProcessingSummary>;
  handleInterruption(): Promise<void>;
  resumeFromQueue(): Promise<QueueProcessingSummary>;
}
```

### Transformer Integration
```ts
interface TransformerQueueOps {
  registerDiscoveryHook(hook: DiscoveryHook): void;
  emitDiscoveredPages(discoveries: PageDiscoveryResult): void;
  getQueueMetrics(): QueueMetrics;
}
```

### Progress Reporting Integration
```ts
interface ProgressQueueOps {
  getQueueStatus(): QueueStatus;
  getProcessingRate(): number;
  getDiscoveryRate(): number;
  getFailureRate(): number;
}

interface QueueStatus {
  totalItems: number;
  processedItems: number;
  pendingItems: number;
  failedItems: number;
  estimatedTimeRemaining: number;
}
```

## Performance Contract

### Memory Usage
- Queue items: ~200 bytes per item
- Processed pages set: ~50 bytes per page ID
- Maximum queue size: 50,000 items (~10MB)
- Target memory overhead: <5% of total export memory budget

### Persistence Performance
- Persist operation: <100ms for typical queue sizes
- Restore operation: <200ms for typical queue sizes
- Atomic write guarantee: temp file + rename pattern
- Persistence frequency: Every 10 operations or 30 seconds

### Processing Performance
- Queue operations: O(1) add, O(1) next, O(1) mark operations
- Discovery integration: <10ms overhead per page transformation
- Circular detection: O(1) lookup in processed pages set
- Queue processing: Target 1-2 pages/second including discovery

## Validation Contract

### Input Validation
- Page IDs: Non-empty strings, alphanumeric + hyphens
- Source types: Must be valid enum values
- Timestamps: Positive Unix timestamps
- Retry counts: Non-negative integers ≤ maximum allowed

### State Validation
- Queue consistency: No duplicates in processing order
- Processed pages: No overlap with pending queue items
- Checksum validation: SHA-256 of serialized state
- Version compatibility: Fail gracefully on unknown versions

### Error Conditions
- Queue size exceeds limits: Warning at soft limit, error at hard limit
- Persistence corruption: Attempt recovery, fallback to rebuild
- Invalid page IDs: Skip with warning, continue processing
- Discovery failures: Partial success allowed, log warnings

This contract ensures reliable queue operations with clear error handling, performance guarantees, and integration points for the enhanced export system.
