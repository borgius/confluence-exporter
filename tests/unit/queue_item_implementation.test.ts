/**
 * Quick verification test for QueueItemOperations
 */

import { describe, test, expect } from '@jest/globals';
import { QueueItemOperations, createQueueItem } from '../../src/queue/queueItem';

describe('QueueItemOperations Implementation Test', () => {
  test('creates and manages queue items', () => {
    const ops = new QueueItemOperations();
    
    const item = createQueueItem('test-page', 'initial');
    ops.add(item);
    
    expect(ops.size()).toBe(1);
    expect(ops.has('test-page')).toBe(true);
    
    const retrieved = ops.get('test-page');
    expect(retrieved?.pageId).toBe('test-page');
    expect(retrieved?.sourceType).toBe('initial');
    expect(retrieved?.status).toBe('pending');
  });

  test('handles status transitions correctly', () => {
    const ops = new QueueItemOperations();
    const item = createQueueItem('status-test', 'macro');
    
    ops.add(item);
    
    // Test status progression
    expect(ops.updateStatus('status-test', 'processing')).toBe(true);
    expect(ops.get('status-test')?.status).toBe('processing');
    
    expect(ops.updateStatus('status-test', 'completed')).toBe(true);
    expect(ops.get('status-test')?.status).toBe('completed');
  });

  test('maintains FIFO order', () => {
    const ops = new QueueItemOperations();
    
    ops.add(createQueueItem('first', 'initial'));
    ops.add(createQueueItem('second', 'macro'));
    ops.add(createQueueItem('third', 'reference'));
    
    expect(ops.next()?.pageId).toBe('first');
    expect(ops.dequeue()?.pageId).toBe('first');
    expect(ops.next()?.pageId).toBe('second');
  });
});
