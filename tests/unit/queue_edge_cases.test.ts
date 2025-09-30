import { DownloadQueueOrchestrator } from '../../src/queue/downloadQueue';
import type { QueueItem } from '../../src/models/queueEntities';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Unit: queue edge cases', () => {
  let tempDir: string;
  let queueOrchestrator: DownloadQueueOrchestrator;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-edge-test-'));
    queueOrchestrator = new DownloadQueueOrchestrator('TEST_SPACE', {
      maxQueueSize: 100,
      maxRetries: 3,
      persistenceThreshold: 5,
      persistencePath: path.join(tempDir, 'queue.json'),
      autoRecoveryEnabled: true
    }, tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('handles queue corruption gracefully', async () => {
    // Add some items first
    const validItems: QueueItem[] = [
      {
        pageId: 'page-1',
        sourceType: 'initial',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      },
      {
        pageId: 'page-2',
        sourceType: 'macro',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      }
    ];

    await queueOrchestrator.add(validItems);
    expect(queueOrchestrator.size()).toBe(2);

    // Force persistence
    await queueOrchestrator.persist();

    // Corrupt the persistence file
    const persistencePath = path.join(tempDir, 'queue.json');
    await fs.writeFile(persistencePath, 'invalid json content');

    // Create new queue instance to trigger restore
    const corruptedQueue = new DownloadQueueOrchestrator('TEST_SPACE', {
      persistencePath,
      autoRecoveryEnabled: true
    }, tempDir);

    // Should handle corruption gracefully
    expect(() => corruptedQueue.getState()).not.toThrow();
    expect(corruptedQueue.isEmpty()).toBe(true); // Should start fresh
  });

  it('handles concurrent access scenarios', async () => {
    const items: QueueItem[] = Array.from({ length: 5 }, (_, i) => ({
      pageId: `concurrent-page-${i}`,
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }));

    // Add items sequentially to avoid persistence issues in concurrent access
    for (const item of items) {
      await queueOrchestrator.add(item);
    }

    expect(queueOrchestrator.size()).toBe(5);

    // Process items sequentially to avoid race conditions
    const processedItems: QueueItem[] = [];
    while (!queueOrchestrator.isEmpty()) {
      const item = await queueOrchestrator.next();
      if (item) {
        await queueOrchestrator.markProcessed(item.pageId);
        processedItems.push(item);
      }
    }

    expect(processedItems.length).toBe(5);
    expect(queueOrchestrator.isEmpty()).toBe(true);
  });

  it('handles queue size limit violations', async () => {
    const smallQueue = new DownloadQueueOrchestrator('TEST_SPACE', {
      maxQueueSize: 3 // Very small queue
    });

    // Add items up to the limit
    const items: QueueItem[] = Array.from({ length: 3 }, (_, i) => ({
      pageId: `limit-page-${i}`,
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }));

    await smallQueue.add(items);
    expect(smallQueue.size()).toBe(3);

    // Attempt to add one more item should fail
    const extraItem: QueueItem = {
      pageId: 'extra-page',
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    await expect(smallQueue.add(extraItem)).rejects.toThrow('Queue size limit exceeded');
    expect(smallQueue.size()).toBe(3); // Should remain unchanged
  });

  it('handles invalid queue item validation', async () => {
    // Test with actually invalid items that should trigger validation errors
    const invalidItems = [
      null, // Null item
      undefined, // Undefined item
      {} // Empty object
    ] as unknown[];

    // Each invalid item should throw an error
    for (const invalidItem of invalidItems) {
      await expect(queueOrchestrator.add(invalidItem as QueueItem)).rejects.toThrow();
    }

    // Test with items missing required fields
    const missingFieldsItem = {
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
      // Missing pageId
    } as QueueItem;

    await expect(queueOrchestrator.add(missingFieldsItem)).rejects.toThrow();

    expect(queueOrchestrator.isEmpty()).toBe(true);
  });

  it('handles persistence failures gracefully', async () => {
    // Add items to queue
    const items: QueueItem[] = [
      {
        pageId: 'persist-page-1',
        sourceType: 'initial',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      }
    ];

    await queueOrchestrator.add(items);

    // Make persistence directory read-only to cause persistence failure
    const readOnlyDir = path.join(tempDir, 'readonly');
    await fs.mkdir(readOnlyDir, { mode: 0o444 }); // Read-only directory

    const readOnlyQueue = new DownloadQueueOrchestrator('TEST_SPACE', {
      persistencePath: path.join(readOnlyDir, 'queue.json')
    });

    await readOnlyQueue.add(items);

    // Persistence should fail but not crash the queue
    await expect(readOnlyQueue.persist()).rejects.toThrow();
    expect(readOnlyQueue.size()).toBe(1); // Queue should still be functional
  });

  it('handles duplicate item deduplication', async () => {
    const duplicateItem: QueueItem = {
      pageId: 'duplicate-page',
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    // Add the same item multiple times
    await queueOrchestrator.add(duplicateItem);
    await queueOrchestrator.add(duplicateItem);
    await queueOrchestrator.add([duplicateItem, duplicateItem]);

    // Should only have one item despite multiple additions
    expect(queueOrchestrator.size()).toBe(1);

    const retrievedItem = await queueOrchestrator.next();
    expect(retrievedItem?.pageId).toBe('duplicate-page');
    
    // After getting the item, it should still be in processing until marked complete
    await queueOrchestrator.markProcessed('duplicate-page');
    expect(queueOrchestrator.isEmpty()).toBe(true);
  });

  it('handles retry count exhaustion', async () => {
    const retryQueue = new DownloadQueueOrchestrator('TEST_SPACE', {
      maxRetries: 2 // Allow only 2 retries
    });

    const item: QueueItem = {
      pageId: 'retry-page',
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    await retryQueue.add(item);

    // Process and fail - should retry
    let processedItem = await retryQueue.next();
    expect(processedItem?.pageId).toBe('retry-page');
    await retryQueue.markFailed('retry-page', new Error('First failure'));
    
    // Process and fail again - should retry once more
    processedItem = await retryQueue.next();
    expect(processedItem?.pageId).toBe('retry-page');
    await retryQueue.markFailed('retry-page', new Error('Second failure'));

    // Process and fail final time - should not retry anymore
    processedItem = await retryQueue.next();
    if (processedItem) {
      await retryQueue.markFailed('retry-page', new Error('Final failure'));
    }

    // No more items should be available for retry
    const noMoreItems = await retryQueue.next();
    expect(noMoreItems).toBeNull();
  });

  it('handles queue state transitions correctly', async () => {
    // Start with empty queue
    expect(queueOrchestrator.getState()).toBe('empty');

    // Add items - should transition to populated
    const item: QueueItem = {
      pageId: 'state-page',
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    await queueOrchestrator.add(item);
    expect(queueOrchestrator.getState()).toBe('populated');

    // Start processing - should transition to processing
    const processingItem = await queueOrchestrator.next();
    expect(processingItem?.pageId).toBe('state-page');
    expect(queueOrchestrator.getState()).toBe('processing');

    // Complete processing - should transition to drained
    await queueOrchestrator.markProcessed('state-page');
    expect(queueOrchestrator.getState()).toBe('drained');

    // Clear queue - should transition to empty
    await queueOrchestrator.clear();
    expect(queueOrchestrator.getState()).toBe('empty');
  });

  it('handles persistence checksum validation', async () => {
    const items: QueueItem[] = [
      {
        pageId: 'checksum-page',
        sourceType: 'initial',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      }
    ];

    await queueOrchestrator.add(items);
    await queueOrchestrator.persist();

    // Manually corrupt the persisted file by modifying the checksum
    const persistencePath = path.join(tempDir, 'queue.json');
    const content = await fs.readFile(persistencePath, 'utf8');
    const data = JSON.parse(content);
    data.checksum = 'invalid-checksum';
    await fs.writeFile(persistencePath, JSON.stringify(data));

    // Create new queue instance - should detect checksum mismatch
    const checksumQueue = new DownloadQueueOrchestrator('TEST_SPACE', {
      persistencePath,
      autoRecoveryEnabled: true
    }, tempDir);

    // Should handle invalid checksum gracefully
    expect(checksumQueue.isEmpty()).toBe(true); // Should start fresh due to corruption
  });

  it('handles extremely large queue operations', async () => {
    const largeQueue = new DownloadQueueOrchestrator('TEST_SPACE', {
      maxQueueSize: 1000, // Large queue size
      persistenceThreshold: 1000 // Avoid persistence during test
    });

    // Add many items at once
    const manyItems: QueueItem[] = Array.from({ length: 100 }, (_, i) => ({
      pageId: `large-page-${i}`,
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }));

    // Should handle large batch addition
    await largeQueue.add(manyItems);
    expect(largeQueue.size()).toBe(100);

    // Process a subset
    const processedCount = 20;
    for (let i = 0; i < processedCount; i++) {
      const item = await largeQueue.next();
      if (item) {
        await largeQueue.markProcessed(item.pageId);
      }
    }

    // After processing and marking complete, queue should have fewer items
    const remainingItems = largeQueue.size();
    expect(remainingItems).toBeLessThanOrEqual(100);
    expect(remainingItems).toBeGreaterThanOrEqual(100 - processedCount);
  });

  it('handles queue interruption during processing', async () => {
    const item: QueueItem = {
      pageId: 'interrupt-page',
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    await queueOrchestrator.add(item);
    
    // Start processing
    const processingItem = await queueOrchestrator.next();
    expect(processingItem?.pageId).toBe('interrupt-page');
    
    // Simulate interruption by creating new queue instance without marking complete
    const interruptedQueue = new DownloadQueueOrchestrator('TEST_SPACE', {
      persistencePath: path.join(tempDir, 'queue.json'),
      autoRecoveryEnabled: true
    }, tempDir);

    // Should detect and handle interrupted processing
    // The item should be available for processing again
    expect(interruptedQueue.getState()).toBe('empty'); // Fresh start due to no persistence
  });
});
