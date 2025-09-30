/**
 * T065 Unit: Queue FIFO processing order
 */

import { describe, test, expect } from '@jest/globals';

interface QueueItem {
  pageId: string;
  sourceType: 'initial' | 'macro' | 'reference' | 'user';
  discoveryTimestamp: number;
  retryCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

// FIFO Queue implementation for testing
class FIFOQueue {
  private items = new Map<string, QueueItem>();
  private processingOrder: string[] = [];

  add(item: QueueItem): void {
    if (this.items.has(item.pageId)) {
      return; // Ignore duplicates for FIFO testing
    }
    
    this.items.set(item.pageId, { ...item });
    this.processingOrder.push(item.pageId);
  }

  next(): QueueItem | null {
    if (this.processingOrder.length === 0) {
      return null;
    }
    
    const nextPageId = this.processingOrder[0];
    const item = this.items.get(nextPageId);
    
    if (!item) {
      // Item was removed but still in order - clean up
      this.processingOrder.shift();
      return this.next();
    }
    
    return item;
  }

  dequeue(): QueueItem | null {
    if (this.processingOrder.length === 0) {
      return null;
    }
    
    const nextPageId = this.processingOrder.shift();
    if (!nextPageId) {
      return null;
    }
    
    const item = this.items.get(nextPageId);
    
    if (item) {
      this.items.delete(nextPageId);
      return item;
    }
    
    return this.dequeue(); // Try next if item was somehow removed
  }

  remove(pageId: string): boolean {
    if (!this.items.has(pageId)) {
      return false;
    }
    
    this.items.delete(pageId);
    
    const index = this.processingOrder.indexOf(pageId);
    if (index >= 0) {
      this.processingOrder.splice(index, 1);
    }
    
    return true;
  }

  size(): number {
    return this.processingOrder.length;
  }

  isEmpty(): boolean {
    return this.processingOrder.length === 0;
  }

  getProcessingOrder(): string[] {
    return [...this.processingOrder]; // Return copy
  }

  peek(): QueueItem | null {
    return this.next();
  }
}

describe('Queue FIFO Processing Order', () => {
  let queue: FIFOQueue;

  beforeEach(() => {
    queue = new FIFOQueue();
  });

  test('processes items in first-in-first-out order', () => {
    const items: QueueItem[] = [
      { pageId: 'first', sourceType: 'initial', discoveryTimestamp: 1000, retryCount: 0, status: 'pending' },
      { pageId: 'second', sourceType: 'macro', discoveryTimestamp: 2000, retryCount: 0, status: 'pending' },
      { pageId: 'third', sourceType: 'reference', discoveryTimestamp: 3000, retryCount: 0, status: 'pending' }
    ];

    // Add items to queue
    items.forEach(item => queue.add(item));

    // Verify processing order matches insertion order
    expect(queue.dequeue()?.pageId).toBe('first');
    expect(queue.dequeue()?.pageId).toBe('second');
    expect(queue.dequeue()?.pageId).toBe('third');
    expect(queue.dequeue()).toBeNull();
  });

  test('maintains order when items are added at different times', () => {
    // Add items with gaps between additions
    queue.add({ pageId: 'early', sourceType: 'initial', discoveryTimestamp: 1000, retryCount: 0, status: 'pending' });
    
    // Process one item
    expect(queue.dequeue()?.pageId).toBe('early');
    
    // Add more items
    queue.add({ pageId: 'middle1', sourceType: 'macro', discoveryTimestamp: 2000, retryCount: 0, status: 'pending' });
    queue.add({ pageId: 'middle2', sourceType: 'reference', discoveryTimestamp: 3000, retryCount: 0, status: 'pending' });
    
    // Verify order is maintained
    expect(queue.dequeue()?.pageId).toBe('middle1');
    expect(queue.dequeue()?.pageId).toBe('middle2');
  });

  test('peek returns next item without removing it', () => {
    queue.add({ pageId: 'peek-test', sourceType: 'initial', discoveryTimestamp: 1000, retryCount: 0, status: 'pending' });
    queue.add({ pageId: 'second-item', sourceType: 'macro', discoveryTimestamp: 2000, retryCount: 0, status: 'pending' });

    // Peek should return first item but not remove it
    expect(queue.peek()?.pageId).toBe('peek-test');
    expect(queue.size()).toBe(2);
    
    // Peek again should return same item
    expect(queue.peek()?.pageId).toBe('peek-test');
    expect(queue.size()).toBe(2);
    
    // Dequeue should return the peeked item
    expect(queue.dequeue()?.pageId).toBe('peek-test');
    expect(queue.size()).toBe(1);
  });

  test('handles removal of items from middle of queue', () => {
    const items: QueueItem[] = [
      { pageId: 'item1', sourceType: 'initial', discoveryTimestamp: 1000, retryCount: 0, status: 'pending' },
      { pageId: 'item2', sourceType: 'macro', discoveryTimestamp: 2000, retryCount: 0, status: 'pending' },
      { pageId: 'item3', sourceType: 'reference', discoveryTimestamp: 3000, retryCount: 0, status: 'pending' },
      { pageId: 'item4', sourceType: 'user', discoveryTimestamp: 4000, retryCount: 0, status: 'pending' }
    ];

    items.forEach(item => queue.add(item));
    expect(queue.size()).toBe(4);

    // Remove item from middle
    const removed = queue.remove('item2');
    expect(removed).toBe(true);
    expect(queue.size()).toBe(3);

    // Verify remaining items are processed in correct order
    expect(queue.dequeue()?.pageId).toBe('item1');
    expect(queue.dequeue()?.pageId).toBe('item3'); // item2 was removed
    expect(queue.dequeue()?.pageId).toBe('item4');
  });

  test('preserves order when discovery timestamps are not chronological', () => {
    // Add items with non-chronological discovery timestamps
    // FIFO should follow insertion order, not timestamp order
    queue.add({ pageId: 'newer', sourceType: 'initial', discoveryTimestamp: 3000, retryCount: 0, status: 'pending' });
    queue.add({ pageId: 'older', sourceType: 'macro', discoveryTimestamp: 1000, retryCount: 0, status: 'pending' });
    queue.add({ pageId: 'newest', sourceType: 'reference', discoveryTimestamp: 5000, retryCount: 0, status: 'pending' });

    // Should process in insertion order, not timestamp order
    expect(queue.dequeue()?.pageId).toBe('newer');
    expect(queue.dequeue()?.pageId).toBe('older');
    expect(queue.dequeue()?.pageId).toBe('newest');
  });

  test('handles empty queue operations gracefully', () => {
    expect(queue.isEmpty()).toBe(true);
    expect(queue.size()).toBe(0);
    expect(queue.next()).toBeNull();
    expect(queue.peek()).toBeNull();
    expect(queue.dequeue()).toBeNull();
    expect(queue.remove('nonexistent')).toBe(false);
  });

  test('maintains processing order visibility', () => {
    const expectedOrder = ['alpha', 'beta', 'gamma', 'delta'];
    
    expectedOrder.forEach((pageId, index) => {
      queue.add({
        pageId,
        sourceType: 'initial',
        discoveryTimestamp: 1000 + index,
        retryCount: 0,
        status: 'pending'
      });
    });

    const actualOrder = queue.getProcessingOrder();
    expect(actualOrder).toEqual(expectedOrder);

    // Verify order array is a copy (not reference)
    actualOrder.push('modified');
    expect(queue.getProcessingOrder()).toEqual(expectedOrder); // Should not be modified
  });

  test('handles duplicate page IDs by ignoring subsequent additions', () => {
    const item1 = { pageId: 'duplicate', sourceType: 'initial', discoveryTimestamp: 1000, retryCount: 0, status: 'pending' } as const;
    const item2 = { pageId: 'duplicate', sourceType: 'macro', discoveryTimestamp: 2000, retryCount: 0, status: 'pending' } as const;
    const item3 = { pageId: 'unique', sourceType: 'reference', discoveryTimestamp: 3000, retryCount: 0, status: 'pending' } as const;

    queue.add(item1);
    queue.add(item2); // Should be ignored due to duplicate pageId
    queue.add(item3);

    expect(queue.size()).toBe(2);
    
    const first = queue.dequeue();
    expect(first?.pageId).toBe('duplicate');
    expect(first?.sourceType).toBe('initial'); // First item should be preserved
    
    const second = queue.dequeue();
    expect(second?.pageId).toBe('unique');
  });

  test('supports high-volume FIFO operations', () => {
    const itemCount = 1000;
    const items: QueueItem[] = [];

    // Add many items
    for (let i = 0; i < itemCount; i++) {
      const item: QueueItem = {
        pageId: `item-${i.toString().padStart(4, '0')}`,
        sourceType: 'initial',
        discoveryTimestamp: 1000 + i,
        retryCount: 0,
        status: 'pending'
      };
      items.push(item);
      queue.add(item);
    }

    expect(queue.size()).toBe(itemCount);

    // Verify all items come out in correct order
    for (let i = 0; i < itemCount; i++) {
      const dequeued = queue.dequeue();
      expect(dequeued?.pageId).toBe(`item-${i.toString().padStart(4, '0')}`);
    }

    expect(queue.isEmpty()).toBe(true);
  });

  test('handles mixed operations while maintaining FIFO order', () => {
    // Add initial items
    queue.add({ pageId: 'keep1', sourceType: 'initial', discoveryTimestamp: 1000, retryCount: 0, status: 'pending' });
    queue.add({ pageId: 'remove-me', sourceType: 'macro', discoveryTimestamp: 2000, retryCount: 0, status: 'pending' });
    queue.add({ pageId: 'keep2', sourceType: 'reference', discoveryTimestamp: 3000, retryCount: 0, status: 'pending' });

    // Remove middle item
    queue.remove('remove-me');

    // Add more items
    queue.add({ pageId: 'keep3', sourceType: 'user', discoveryTimestamp: 4000, retryCount: 0, status: 'pending' });

    // Process and verify order
    expect(queue.dequeue()?.pageId).toBe('keep1');
    expect(queue.dequeue()?.pageId).toBe('keep2');
    expect(queue.dequeue()?.pageId).toBe('keep3');
    expect(queue.isEmpty()).toBe(true);
  });
});
