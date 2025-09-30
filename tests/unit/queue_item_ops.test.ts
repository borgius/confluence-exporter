/**
 * T064 Unit: Queue item operations (add, remove, status)
 */

import { describe, test, expect } from '@jest/globals';

// Define QueueItem interface for testing
interface QueueItem {
  pageId: string;
  sourceType: 'initial' | 'macro' | 'reference' | 'user';
  discoveryTimestamp: number;
  retryCount: number;
  parentPageId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

// Simple queue operations for testing
class TestQueueOperations {
  private items = new Map<string, QueueItem>();
  private processingOrder: string[] = [];

  add(item: QueueItem): void {
    if (this.items.has(item.pageId)) {
      throw new Error(`Item with pageId ${item.pageId} already exists`);
    }
    
    this.items.set(item.pageId, { ...item });
    this.processingOrder.push(item.pageId);
  }

  remove(pageId: string): QueueItem | null {
    const item = this.items.get(pageId);
    if (!item) {
      return null;
    }
    
    this.items.delete(pageId);
    const index = this.processingOrder.indexOf(pageId);
    if (index >= 0) {
      this.processingOrder.splice(index, 1);
    }
    
    return item;
  }

  updateStatus(pageId: string, status: QueueItem['status']): boolean {
    const item = this.items.get(pageId);
    if (!item) {
      return false;
    }
    
    item.status = status;
    return true;
  }

  get(pageId: string): QueueItem | undefined {
    return this.items.get(pageId);
  }

  size(): number {
    return this.items.size;
  }

  getByStatus(status: QueueItem['status']): QueueItem[] {
    return Array.from(this.items.values()).filter(item => item.status === status);
  }

  incrementRetryCount(pageId: string): boolean {
    const item = this.items.get(pageId);
    if (!item) {
      return false;
    }
    
    item.retryCount += 1;
    return true;
  }
}

describe('Queue Item Operations', () => {
  let queue: TestQueueOperations;

  beforeEach(() => {
    queue = new TestQueueOperations();
  });

  test('adds new queue items successfully', () => {
    const item: QueueItem = {
      pageId: 'page123',
      sourceType: 'initial',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    queue.add(item);

    expect(queue.size()).toBe(1);
    expect(queue.get('page123')).toEqual(item);
  });

  test('prevents duplicate page IDs', () => {
    const item1: QueueItem = {
      pageId: 'duplicate',
      sourceType: 'initial',
      discoveryTimestamp: 1000,
      retryCount: 0,
      status: 'pending'
    };

    const item2: QueueItem = {
      pageId: 'duplicate',
      sourceType: 'macro',
      discoveryTimestamp: 2000,
      retryCount: 0,
      status: 'pending'
    };

    queue.add(item1);
    expect(() => queue.add(item2)).toThrow('Item with pageId duplicate already exists');
    expect(queue.size()).toBe(1);
  });

  test('removes items and returns them', () => {
    const item: QueueItem = {
      pageId: 'removeme',
      sourceType: 'reference',
      discoveryTimestamp: 1500,
      retryCount: 1,
      status: 'failed'
    };

    queue.add(item);
    expect(queue.size()).toBe(1);

    const removed = queue.remove('removeme');
    expect(removed).toEqual(item);
    expect(queue.size()).toBe(0);
    expect(queue.get('removeme')).toBeUndefined();
  });

  test('returns null when removing non-existent item', () => {
    const removed = queue.remove('nonexistent');
    expect(removed).toBeNull();
    expect(queue.size()).toBe(0);
  });

  test('updates item status', () => {
    const item: QueueItem = {
      pageId: 'status-test',
      sourceType: 'user',
      discoveryTimestamp: 2000,
      retryCount: 0,
      status: 'pending'
    };

    queue.add(item);
    expect(queue.get('status-test')?.status).toBe('pending');

    const updated = queue.updateStatus('status-test', 'processing');
    expect(updated).toBe(true);
    expect(queue.get('status-test')?.status).toBe('processing');

    queue.updateStatus('status-test', 'completed');
    expect(queue.get('status-test')?.status).toBe('completed');
  });

  test('returns false when updating status of non-existent item', () => {
    const updated = queue.updateStatus('nonexistent', 'failed');
    expect(updated).toBe(false);
  });

  test('filters items by status', () => {
    const items: QueueItem[] = [
      { pageId: 'pending1', sourceType: 'initial', discoveryTimestamp: 1000, retryCount: 0, status: 'pending' },
      { pageId: 'pending2', sourceType: 'macro', discoveryTimestamp: 1100, retryCount: 0, status: 'pending' },
      { pageId: 'processing1', sourceType: 'reference', discoveryTimestamp: 1200, retryCount: 0, status: 'processing' },
      { pageId: 'failed1', sourceType: 'user', discoveryTimestamp: 1300, retryCount: 2, status: 'failed' },
      { pageId: 'completed1', sourceType: 'initial', discoveryTimestamp: 1400, retryCount: 0, status: 'completed' }
    ];

    items.forEach(item => queue.add(item));

    const pending = queue.getByStatus('pending');
    const processing = queue.getByStatus('processing');
    const failed = queue.getByStatus('failed');
    const completed = queue.getByStatus('completed');

    expect(pending).toHaveLength(2);
    expect(processing).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(completed).toHaveLength(1);

    expect(pending.map(i => i.pageId)).toEqual(['pending1', 'pending2']);
    expect(processing[0].pageId).toBe('processing1');
    expect(failed[0].pageId).toBe('failed1');
    expect(completed[0].pageId).toBe('completed1');
  });

  test('increments retry count', () => {
    const item: QueueItem = {
      pageId: 'retry-test',
      sourceType: 'macro',
      discoveryTimestamp: 3000,
      retryCount: 0,
      status: 'failed'
    };

    queue.add(item);
    expect(queue.get('retry-test')?.retryCount).toBe(0);

    const incremented = queue.incrementRetryCount('retry-test');
    expect(incremented).toBe(true);
    expect(queue.get('retry-test')?.retryCount).toBe(1);

    queue.incrementRetryCount('retry-test');
    expect(queue.get('retry-test')?.retryCount).toBe(2);
  });

  test('returns false when incrementing retry count of non-existent item', () => {
    const incremented = queue.incrementRetryCount('nonexistent');
    expect(incremented).toBe(false);
  });

  test('handles items with optional parent page ID', () => {
    const rootItem: QueueItem = {
      pageId: 'root',
      sourceType: 'initial',
      discoveryTimestamp: 1000,
      retryCount: 0,
      status: 'pending'
    };

    const childItem: QueueItem = {
      pageId: 'child',
      sourceType: 'macro',
      discoveryTimestamp: 2000,
      retryCount: 0,
      parentPageId: 'root',
      status: 'pending'
    };

    queue.add(rootItem);
    queue.add(childItem);

    expect(queue.get('root')?.parentPageId).toBeUndefined();
    expect(queue.get('child')?.parentPageId).toBe('root');
  });

  test('validates source types', () => {
    const validSourceTypes: QueueItem['sourceType'][] = ['initial', 'macro', 'reference', 'user'];
    
    validSourceTypes.forEach((sourceType, index) => {
      const item: QueueItem = {
        pageId: `test-${index}`,
        sourceType,
        discoveryTimestamp: 1000 + index,
        retryCount: 0,
        status: 'pending'
      };

      queue.add(item);
      expect(queue.get(`test-${index}`)?.sourceType).toBe(sourceType);
    });

    expect(queue.size()).toBe(4);
  });

  test('validates status transitions', () => {
    const item: QueueItem = {
      pageId: 'transition-test',
      sourceType: 'initial',
      discoveryTimestamp: 4000,
      retryCount: 0,
      status: 'pending'
    };

    queue.add(item);

    // Typical successful flow: pending -> processing -> completed
    queue.updateStatus('transition-test', 'processing');
    expect(queue.get('transition-test')?.status).toBe('processing');

    queue.updateStatus('transition-test', 'completed');
    expect(queue.get('transition-test')?.status).toBe('completed');

    // Reset for failure scenario
    queue.updateStatus('transition-test', 'pending');
    queue.updateStatus('transition-test', 'processing');
    queue.updateStatus('transition-test', 'failed');
    expect(queue.get('transition-test')?.status).toBe('failed');
  });
});
