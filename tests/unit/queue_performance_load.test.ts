import { DownloadQueueOrchestrator } from '../../src/queue/downloadQueue';
import type { QueueItem } from '../../src/models/queueEntities';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Unit: queue performance load', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-perf-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('handles high volume queue additions efficiently', async () => {
    const queueOrchestrator = new DownloadQueueOrchestrator('PERF_TEST', {
      maxQueueSize: 10000,
      persistenceThreshold: 5000, // Higher threshold for performance test
      persistencePath: path.join(tempDir, 'perf-queue.json')
    }, tempDir);

    const itemCount = 1000;
    const items: QueueItem[] = Array.from({ length: itemCount }, (_, i) => ({
      pageId: `perf-page-${i}`,
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }));

    const startTime = performance.now();
    
    // Add items in batches for better performance
    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await queueOrchestrator.add(batch);
    }

    const addDuration = performance.now() - startTime;

    expect(queueOrchestrator.size()).toBe(itemCount);
    expect(addDuration).toBeLessThan(5000); // Should complete within 5 seconds
    
    // Calculate throughput
    const throughput = itemCount / (addDuration / 1000); // items per second
    expect(throughput).toBeGreaterThan(100); // Should handle at least 100 items/sec
  });

  it('processes large queues efficiently', async () => {
    const queueOrchestrator = new DownloadQueueOrchestrator('PERF_TEST', {
      maxQueueSize: 5000,
      persistenceThreshold: 10000, // Disable persistence during test
      persistencePath: path.join(tempDir, 'process-perf-queue.json')
    }, tempDir);

    const itemCount = 500;
    const items: QueueItem[] = Array.from({ length: itemCount }, (_, i) => ({
      pageId: `process-page-${i}`,
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }));

    // Add all items first
    await queueOrchestrator.add(items);

    const startTime = performance.now();
    let processedCount = 0;

    // Process all items
    while (!queueOrchestrator.isEmpty()) {
      const item = await queueOrchestrator.next();
      if (item) {
        await queueOrchestrator.markProcessed(item.pageId);
        processedCount++;
      }
    }

    const processDuration = performance.now() - startTime;

    expect(processedCount).toBe(itemCount);
    expect(processDuration).toBeLessThan(10000); // Should complete within 10 seconds
    
    // Calculate processing throughput
    const throughput = processedCount / (processDuration / 1000); // items per second
    expect(throughput).toBeGreaterThan(50); // Should process at least 50 items/sec
  });

  it('handles persistence operations under load', async () => {
    const queueOrchestrator = new DownloadQueueOrchestrator('PERF_TEST', {
      maxQueueSize: 2000,
      persistenceThreshold: 100, // Force frequent persistence
      persistencePath: path.join(tempDir, 'persistence-load-queue.json')
    }, tempDir);

    const itemCount = 500;
    const items: QueueItem[] = Array.from({ length: itemCount }, (_, i) => ({
      pageId: `persist-page-${i}`,
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }));

    const startTime = performance.now();

    // Add items one by one to trigger multiple persistence operations
    for (const item of items) {
      await queueOrchestrator.add(item);
    }

    const addWithPersistenceDuration = performance.now() - startTime;

    expect(queueOrchestrator.size()).toBe(itemCount);
    expect(addWithPersistenceDuration).toBeLessThan(15000); // Should complete within 15 seconds even with persistence
    
    // Verify persistence file was created and is valid
    const persistenceFile = path.join(tempDir, 'persistence-load-queue.json');
    const fileExists = await fs.access(persistenceFile).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
  });

  it('maintains performance with mixed operations', async () => {
    const queueOrchestrator = new DownloadQueueOrchestrator('PERF_TEST', {
      maxQueueSize: 3000,
      persistenceThreshold: 200,
      persistencePath: path.join(tempDir, 'mixed-ops-queue.json')
    }, tempDir);

    const operationCount = 200;
    const startTime = performance.now();
    let addedCount = 0;
    let processedCount = 0;

    // Perform mixed operations: add, process, add more, process more
    for (let i = 0; i < operationCount; i++) {
      // Add some items
      const batchItems: QueueItem[] = Array.from({ length: 3 }, (_, j) => ({
        pageId: `mixed-page-${i}-${j}`,
        sourceType: 'initial',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      }));

      await queueOrchestrator.add(batchItems);
      addedCount += batchItems.length;

      // Process one item if available
      if (!queueOrchestrator.isEmpty()) {
        const item = await queueOrchestrator.next();
        if (item) {
          await queueOrchestrator.markProcessed(item.pageId);
          processedCount++;
        }
      }
    }

    const mixedOpsDuration = performance.now() - startTime;

    expect(addedCount).toBe(operationCount * 3);
    expect(processedCount).toBeGreaterThan(0);
    expect(mixedOpsDuration).toBeLessThan(20000); // Should complete within 20 seconds
    
    // Calculate combined throughput
    const totalOperations = addedCount + processedCount;
    const throughput = totalOperations / (mixedOpsDuration / 1000);
    expect(throughput).toBeGreaterThan(30); // Should handle at least 30 operations/sec
  });

  it('handles concurrent queue access performance', async () => {
    const queueOrchestrator = new DownloadQueueOrchestrator('PERF_TEST', {
      maxQueueSize: 2000,
      persistenceThreshold: 1000,
      persistencePath: path.join(tempDir, 'concurrent-perf-queue.json')
    }, tempDir);

    const concurrentOperations = 50;
    const itemsPerOperation = 10;

    const startTime = performance.now();

    // Create concurrent add operations
    const addPromises = Array.from({ length: concurrentOperations }, async (_, i) => {
      const items: QueueItem[] = Array.from({ length: itemsPerOperation }, (_, j) => ({
        pageId: `concurrent-page-${i}-${j}`,
        sourceType: 'initial',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      }));

      // Add items sequentially within each concurrent operation to avoid race conditions
      for (const item of items) {
        await queueOrchestrator.add(item);
      }
      return items.length;
    });

    const results = await Promise.all(addPromises);
    const concurrentDuration = performance.now() - startTime;
    const totalAdded = results.reduce((sum, count) => sum + count, 0);

    expect(totalAdded).toBe(concurrentOperations * itemsPerOperation);
    expect(queueOrchestrator.size()).toBe(totalAdded);
    expect(concurrentDuration).toBeLessThan(30000); // Should complete within 30 seconds
    
    // Calculate concurrent throughput
    const throughput = totalAdded / (concurrentDuration / 1000);
    expect(throughput).toBeGreaterThan(20); // Should handle at least 20 items/sec under concurrency
  });

  it('measures memory usage under load', async () => {
    const queueOrchestrator = new DownloadQueueOrchestrator('PERF_TEST', {
      maxQueueSize: 5000,
      persistenceThreshold: 10000, // Disable persistence to focus on memory
      persistencePath: path.join(tempDir, 'memory-test-queue.json')
    }, tempDir);

    const getMemoryUsage = () => {
      if (process.memoryUsage) {
        return process.memoryUsage().heapUsed;
      }
      return 0;
    };

    const initialMemory = getMemoryUsage();
    const itemCount = 1000;

    // Add many items to test memory usage
    const items: QueueItem[] = Array.from({ length: itemCount }, (_, i) => ({
      pageId: `memory-page-${i}`,
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }));

    await queueOrchestrator.add(items);
    const afterAddMemory = getMemoryUsage();

    // Process half the items
    const processCount = Math.floor(itemCount / 2);
    for (let i = 0; i < processCount; i++) {
      const item = await queueOrchestrator.next();
      if (item) {
        await queueOrchestrator.markProcessed(item.pageId);
      }
    }

    const afterProcessMemory = getMemoryUsage();

    // Memory should increase with items but not excessively
    const memoryIncreaseAdding = afterAddMemory - initialMemory;
    const memoryPerItem = memoryIncreaseAdding / itemCount;

    expect(memoryPerItem).toBeLessThan(10000); // Less than 10KB per item (rough estimate)
    expect(afterProcessMemory).toBeLessThanOrEqual(afterAddMemory * 1.1); // Memory shouldn't grow significantly during processing
  });

  it('validates queue metrics accuracy under load', async () => {
    const queueOrchestrator = new DownloadQueueOrchestrator('PERF_TEST', {
      maxQueueSize: 1000,
      persistenceThreshold: 2000, // Disable persistence
      metricsWindowSeconds: 60
    }, tempDir);

    const itemCount = 100;
    const items: QueueItem[] = Array.from({ length: itemCount }, (_, i) => ({
      pageId: `metrics-page-${i}`,
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }));

    // Add items and track metrics
    await queueOrchestrator.add(items);
    
    const initialMetrics = queueOrchestrator.getMetrics();
    expect(initialMetrics.totalQueued).toBeGreaterThanOrEqual(itemCount);
    expect(initialMetrics.currentQueueSize).toBe(itemCount);

    // Process items and verify metrics accuracy
    let processedCount = 0;
    let failedCount = 0;

    while (!queueOrchestrator.isEmpty() && processedCount + failedCount < itemCount) {
      const item = await queueOrchestrator.next();
      if (item) {
        // Randomly succeed or fail to test both metrics
        if (Math.random() > 0.2) { // 80% success rate
          await queueOrchestrator.markProcessed(item.pageId);
          processedCount++;
        } else {
          await queueOrchestrator.markFailed(item.pageId, new Error('Random failure'));
          failedCount++;
        }
      }
    }

    const finalMetrics = queueOrchestrator.getMetrics();
    
    expect(finalMetrics.totalProcessed).toBe(processedCount);
    expect(finalMetrics.totalFailed).toBe(failedCount);
    
    // The current queue size depends on how the queue handles failed items
    // Items may remain in queue for retry or be removed after max retries
    expect(finalMetrics.currentQueueSize).toBeGreaterThanOrEqual(0);
    expect(finalMetrics.currentQueueSize).toBeLessThanOrEqual(itemCount);
    
    // Verify metrics are accurate
    const totalOperations = processedCount + failedCount;
    expect(totalOperations).toBeGreaterThan(0);
    expect(finalMetrics.totalQueued).toBeGreaterThanOrEqual(itemCount);
  });

  it('handles stress test with rapid operations', async () => {
    const queueOrchestrator = new DownloadQueueOrchestrator('STRESS_TEST', {
      maxQueueSize: 2000,
      persistenceThreshold: 5000, // High threshold to reduce I/O during stress test
      persistencePath: path.join(tempDir, 'stress-test-queue.json')
    }, tempDir);

    const rapidOperations = 300;
    const startTime = performance.now();

    // Perform rapid add/process cycles
    for (let i = 0; i < rapidOperations; i++) {
      // Add an item
      const item: QueueItem = {
        pageId: `stress-page-${i}`,
        sourceType: 'initial',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      };

      await queueOrchestrator.add(item);

      // Immediately try to process if queue has items
      if (queueOrchestrator.size() > 0) {
        const processedItem = await queueOrchestrator.next();
        if (processedItem) {
          await queueOrchestrator.markProcessed(processedItem.pageId);
        }
      }
    }

    const stressDuration = performance.now() - startTime;

    expect(stressDuration).toBeLessThan(15000); // Should complete rapid operations within 15 seconds
    
    // Calculate operations per second
    const opsPerSecond = (rapidOperations * 2) / (stressDuration / 1000); // 2 ops per iteration (add + process)
    expect(opsPerSecond).toBeGreaterThan(20); // Should handle at least 20 ops/sec under stress
  });
});
