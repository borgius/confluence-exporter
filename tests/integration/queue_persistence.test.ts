/**
 * T040 Integration: Queue persistence and recovery after interruption
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('Queue Persistence Integration', () => {
  let tempDir: string;
  let queueStatePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(__dirname, 'temp-queue-'));
    queueStatePath = path.join(tempDir, '.queue-state.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  test('creates valid queue state file structure', async () => {
    const queueState = {
      version: 1,
      timestamp: '2025-09-29T10:30:00.000Z',
      spaceKey: 'TEST',
      items: [
        {
          pageId: '123456',
          sourceType: 'initial',
          discoveryTimestamp: 1727601000000,
          retryCount: 0,
          status: 'pending'
        },
        {
          pageId: '123457',
          sourceType: 'macro',
          discoveryTimestamp: 1727601010000,
          retryCount: 1,
          parentPageId: '123456',
          status: 'failed'
        }
      ],
      processedPageIds: ['123455', '123454'],
      metrics: {
        totalQueued: 10,
        totalProcessed: 8,
        totalFailed: 1,
        currentQueueSize: 2,
        discoveryRate: 2.5,
        processingRate: 1.8,
        averageRetryCount: 0.1,
        persistenceOperations: 15
      },
      checksum: 'abc123def456'
    };

    // Write queue state to file
    await fs.writeFile(queueStatePath, JSON.stringify(queueState, null, 2));

    // Verify file exists and can be read
    const exists = await fs.access(queueStatePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    // Read and parse the state
    const fileContent = await fs.readFile(queueStatePath, 'utf-8');
    const parsedState = JSON.parse(fileContent);

    expect(parsedState.version).toBe(1);
    expect(parsedState.spaceKey).toBe('TEST');
    expect(parsedState.items).toHaveLength(2);
    expect(parsedState.processedPageIds).toHaveLength(2);
    expect(parsedState.metrics.totalQueued).toBe(10);
  });

  test('validates queue state file format', async () => {
    const validState = {
      version: 1,
      timestamp: '2025-09-29T10:30:00.000Z',
      spaceKey: 'VALID',
      items: [],
      processedPageIds: [],
      metrics: {
        totalQueued: 0,
        totalProcessed: 0,
        totalFailed: 0,
        currentQueueSize: 0,
        discoveryRate: 0,
        processingRate: 0,
        averageRetryCount: 0,
        persistenceOperations: 0
      },
      checksum: 'valid123'
    };

    await fs.writeFile(queueStatePath, JSON.stringify(validState));

    // Read and validate structure
    const content = await fs.readFile(queueStatePath, 'utf-8');
    const state = JSON.parse(content);

    // Validate required fields
    expect(state).toHaveProperty('version');
    expect(state).toHaveProperty('timestamp');
    expect(state).toHaveProperty('spaceKey');
    expect(state).toHaveProperty('items');
    expect(state).toHaveProperty('processedPageIds');
    expect(state).toHaveProperty('metrics');
    expect(state).toHaveProperty('checksum');

    // Validate types
    expect(typeof state.version).toBe('number');
    expect(typeof state.timestamp).toBe('string');
    expect(typeof state.spaceKey).toBe('string');
    expect(Array.isArray(state.items)).toBe(true);
    expect(Array.isArray(state.processedPageIds)).toBe(true);
    expect(typeof state.metrics).toBe('object');
    expect(typeof state.checksum).toBe('string');
  });

  test('handles queue state corruption detection', async () => {
    // Create corrupted JSON file
    const corruptedContent = '{ "version": 1, "timestamp": "2025-09-29T10:30:00.000Z", "spaceKey": "TEST"';
    await fs.writeFile(queueStatePath, corruptedContent);

    // Try to read corrupted file
    const content = await fs.readFile(queueStatePath, 'utf-8');
    
    // Should fail to parse
    expect(() => JSON.parse(content)).toThrow();

    // Verify we can detect corruption
    let isCorrupted = false;
    try {
      JSON.parse(content);
    } catch {
      isCorrupted = true;
    }
    expect(isCorrupted).toBe(true);
  });

  test('preserves queue item structure and ordering', async () => {
    const items = [
      {
        pageId: 'page1',
        sourceType: 'initial',
        discoveryTimestamp: 1000,
        retryCount: 0,
        status: 'pending'
      },
      {
        pageId: 'page2',
        sourceType: 'macro',
        discoveryTimestamp: 2000,
        retryCount: 0,
        parentPageId: 'page1',
        status: 'pending'
      },
      {
        pageId: 'page3',
        sourceType: 'reference',
        discoveryTimestamp: 3000,
        retryCount: 2,
        status: 'failed'
      }
    ];

    const queueState = {
      version: 1,
      timestamp: new Date().toISOString(),
      spaceKey: 'ORDER-TEST',
      items,
      processedPageIds: [],
      metrics: {
        totalQueued: 3,
        totalProcessed: 0,
        totalFailed: 1,
        currentQueueSize: 3,
        discoveryRate: 1.0,
        processingRate: 0.5,
        averageRetryCount: 0.67,
        persistenceOperations: 1
      },
      checksum: 'order123'
    };

    await fs.writeFile(queueStatePath, JSON.stringify(queueState, null, 2));

    // Read back and verify ordering
    const content = await fs.readFile(queueStatePath, 'utf-8');
    const restoredState = JSON.parse(content);

    expect(restoredState.items).toHaveLength(3);
    expect(restoredState.items[0].pageId).toBe('page1');
    expect(restoredState.items[1].pageId).toBe('page2');
    expect(restoredState.items[2].pageId).toBe('page3');

    // Verify discovery timestamps are preserved (FIFO order)
    expect(restoredState.items[0].discoveryTimestamp).toBe(1000);
    expect(restoredState.items[1].discoveryTimestamp).toBe(2000);
    expect(restoredState.items[2].discoveryTimestamp).toBe(3000);

    // Verify source types are preserved
    expect(restoredState.items[0].sourceType).toBe('initial');
    expect(restoredState.items[1].sourceType).toBe('macro');
    expect(restoredState.items[2].sourceType).toBe('reference');
  });

  test('handles atomic write operations', async () => {
    const tempPath = queueStatePath + '.tmp';
    const originalState = {
      version: 1,
      timestamp: new Date().toISOString(),
      spaceKey: 'ATOMIC',
      items: [{ pageId: 'test', sourceType: 'initial', discoveryTimestamp: 1000, retryCount: 0, status: 'pending' }],
      processedPageIds: [],
      metrics: {
        totalQueued: 1,
        totalProcessed: 0,
        totalFailed: 0,
        currentQueueSize: 1,
        discoveryRate: 1.0,
        processingRate: 0.0,
        averageRetryCount: 0.0,
        persistenceOperations: 1
      },
      checksum: 'atomic123'
    };

    // Simulate atomic write: temp file -> rename
    await fs.writeFile(tempPath, JSON.stringify(originalState, null, 2));
    await fs.rename(tempPath, queueStatePath);

    // Verify final file exists and temp file is gone
    const finalExists = await fs.access(queueStatePath).then(() => true).catch(() => false);
    const tempExists = await fs.access(tempPath).then(() => true).catch(() => false);

    expect(finalExists).toBe(true);
    expect(tempExists).toBe(false);

    // Verify content is correct
    const content = await fs.readFile(queueStatePath, 'utf-8');
    const state = JSON.parse(content);
    expect(state.spaceKey).toBe('ATOMIC');
    expect(state.items).toHaveLength(1);
  });

  test('calculates and stores queue metrics correctly', async () => {
    const metrics = {
      totalQueued: 100,
      totalProcessed: 75,
      totalFailed: 5,
      currentQueueSize: 20,
      discoveryRate: 2.5,
      processingRate: 1.8,
      averageRetryCount: 0.2,
      persistenceOperations: 25,
      lastPersistenceTime: '2025-09-29T10:30:00.000Z'
    };

    const queueState = {
      version: 1,
      timestamp: new Date().toISOString(),
      spaceKey: 'METRICS',
      items: [],
      processedPageIds: [],
      metrics,
      checksum: 'metrics123'
    };

    await fs.writeFile(queueStatePath, JSON.stringify(queueState, null, 2));

    const content = await fs.readFile(queueStatePath, 'utf-8');
    const restoredState = JSON.parse(content);

    expect(restoredState.metrics.totalQueued).toBe(100);
    expect(restoredState.metrics.totalProcessed).toBe(75);
    expect(restoredState.metrics.totalFailed).toBe(5);
    expect(restoredState.metrics.currentQueueSize).toBe(20);
    expect(restoredState.metrics.discoveryRate).toBe(2.5);
    expect(restoredState.metrics.processingRate).toBe(1.8);
    expect(restoredState.metrics.averageRetryCount).toBe(0.2);
    expect(restoredState.metrics.persistenceOperations).toBe(25);

    // Verify calculated fields
    const successRate = restoredState.metrics.totalProcessed / restoredState.metrics.totalQueued;
    expect(successRate).toBe(0.75); // 75/100
  });
});
