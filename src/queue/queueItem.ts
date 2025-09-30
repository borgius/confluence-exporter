/**
 * T084: Queue item operations and validation
 * Implements queue item management with validation and status tracking
 */

import type { 
  QueueItem, 
  IQueueItem
} from '../models/queueEntities.js';
import { createQueueError } from '../models/queueEntities.js';

export class ManagedQueueItem implements IQueueItem {
  private _retryCount: number;
  private _status: QueueItem['status'];

  constructor(private readonly item: QueueItem) {
    this._retryCount = item.retryCount;
    this._status = item.status;
  }

  get pageId(): string {
    return this.item.pageId;
  }

  get sourceType(): QueueItem['sourceType'] {
    return this.item.sourceType;
  }

  get discoveryTimestamp(): number {
    return this.item.discoveryTimestamp;
  }

  get parentPageId(): string | undefined {
    return this.item.parentPageId;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  get status(): QueueItem['status'] {
    return this._status;
  }

  markProcessing(): void {
    if (this._status === 'completed' || this._status === 'failed') {
      throw createQueueError(
        'QUEUE_FULL',
        `Cannot mark completed/failed item as processing: ${this.pageId}`,
        false,
        this.pageId
      );
    }
    this._status = 'processing';
  }

  markCompleted(): void {
    if (this._status !== 'processing') {
      throw createQueueError(
        'QUEUE_FULL',
        `Cannot mark non-processing item as completed: ${this.pageId}`,
        false,
        this.pageId
      );
    }
    this._status = 'completed';
  }

  markFailed(): void {
    this._status = 'failed';
  }

  incrementRetry(): void {
    this._retryCount += 1;
    // Reset to pending for retry
    if (this._status === 'failed') {
      this._status = 'pending';
    }
  }

  canRetry(maxRetries: number): boolean {
    return this._retryCount < maxRetries;
  }

  toPlainObject(): QueueItem {
    return {
      pageId: this.pageId,
      sourceType: this.sourceType,
      discoveryTimestamp: this.discoveryTimestamp,
      retryCount: this._retryCount,
      parentPageId: this.parentPageId,
      status: this._status,
    };
  }
}

export class QueueItemOperations {
  private items = new Map<string, ManagedQueueItem>();
  private processingOrder: string[] = [];

  add(item: QueueItem): void {
    if (this.items.has(item.pageId)) {
      // Ignore duplicates
      return;
    }

    this.validateQueueItem(item);
    
    const managedItem = new ManagedQueueItem(item);
    this.items.set(item.pageId, managedItem);
    this.processingOrder.push(item.pageId);
  }

  addMultiple(items: QueueItem[]): void {
    for (const item of items) {
      this.add(item);
    }
  }

  remove(pageId: string): QueueItem | null {
    const item = this.items.get(pageId);
    if (!item) {
      return null;
    }

    this.items.delete(pageId);
    
    const orderIndex = this.processingOrder.indexOf(pageId);
    if (orderIndex >= 0) {
      this.processingOrder.splice(orderIndex, 1);
    }

    return item.toPlainObject();
  }

  get(pageId: string): QueueItem | undefined {
    const item = this.items.get(pageId);
    return item?.toPlainObject();
  }

  has(pageId: string): boolean {
    return this.items.has(pageId);
  }

  updateStatus(pageId: string, status: QueueItem['status']): boolean {
    const item = this.items.get(pageId);
    if (!item) {
      return false;
    }

    try {
      switch (status) {
        case 'processing':
          item.markProcessing();
          break;
        case 'completed':
          item.markCompleted();
          break;
        case 'failed':
          item.markFailed();
          break;
        case 'pending':
          // Allow direct pending assignment for resets
          break;
        default:
          throw new Error(`Invalid status: ${status}`);
      }
      return true;
    } catch {
      return false;
    }
  }

  incrementRetryCount(pageId: string): boolean {
    const item = this.items.get(pageId);
    if (!item) {
      return false;
    }

    item.incrementRetry();
    return true;
  }

  getByStatus(status: QueueItem['status']): QueueItem[] {
    return Array.from(this.items.values())
      .filter(item => item.status === status)
      .map(item => item.toPlainObject());
  }

  getProcessingOrder(): string[] {
    return [...this.processingOrder];
  }

  size(): number {
    return this.items.size;
  }

  isEmpty(): boolean {
    return this.items.size === 0;
  }

  clear(): void {
    this.items.clear();
    this.processingOrder.length = 0;
  }

  getAllItems(): QueueItem[] {
    return Array.from(this.items.values()).map(item => item.toPlainObject());
  }

  getItemsByRetryCount(minRetries: number): QueueItem[] {
    return Array.from(this.items.values())
      .filter(item => item.retryCount >= minRetries)
      .map(item => item.toPlainObject());
  }

  getItemsBySourceType(sourceType: QueueItem['sourceType']): QueueItem[] {
    return Array.from(this.items.values())
      .filter(item => item.sourceType === sourceType)
      .map(item => item.toPlainObject());
  }

  canRetry(pageId: string, maxRetries: number): boolean {
    const item = this.items.get(pageId);
    return item ? item.canRetry(maxRetries) : false;
  }

  next(): QueueItem | null {
    if (this.processingOrder.length === 0) {
      return null;
    }

    const nextPageId = this.processingOrder[0];
    const item = this.items.get(nextPageId);
    
    if (!item) {
      // Clean up orphaned order entry
      this.processingOrder.shift();
      return this.next();
    }

    return item.toPlainObject();
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
    if (!item) {
      return this.dequeue(); // Try next item
    }

    this.items.delete(nextPageId);
    return item.toPlainObject();
  }

  private validateQueueItem(item: QueueItem): void {
    if (!item.pageId || typeof item.pageId !== 'string') {
      throw createQueueError(
        'QUEUE_FULL',
        'Queue item must have valid pageId',
        false
      );
    }

    if (!['initial', 'macro', 'reference', 'user'].includes(item.sourceType)) {
      throw createQueueError(
        'QUEUE_FULL',
        `Invalid source type: ${item.sourceType}`,
        false,
        item.pageId
      );
    }

    if (typeof item.discoveryTimestamp !== 'number' || item.discoveryTimestamp <= 0) {
      throw createQueueError(
        'QUEUE_FULL',
        'Discovery timestamp must be a positive number',
        false,
        item.pageId
      );
    }

    if (typeof item.retryCount !== 'number' || item.retryCount < 0) {
      throw createQueueError(
        'QUEUE_FULL',
        'Retry count must be a non-negative number',
        false,
        item.pageId
      );
    }

    if (!['pending', 'processing', 'completed', 'failed'].includes(item.status)) {
      throw createQueueError(
        'QUEUE_FULL',
        `Invalid status: ${item.status}`,
        false,
        item.pageId
      );
    }
  }
}

// Factory function for creating queue item operations
export function createQueueItemOperations(): QueueItemOperations {
  return new QueueItemOperations();
}

// Utility functions for queue item manipulation
export function createQueueItem(
  pageId: string,
  sourceType: QueueItem['sourceType'],
  parentPageId?: string
): QueueItem {
  return {
    pageId,
    sourceType,
    discoveryTimestamp: Date.now(),
    retryCount: 0,
    parentPageId,
    status: 'pending',
  };
}

export function cloneQueueItem(item: QueueItem): QueueItem {
  return {
    pageId: item.pageId,
    sourceType: item.sourceType,
    discoveryTimestamp: item.discoveryTimestamp,
    retryCount: item.retryCount,
    parentPageId: item.parentPageId,
    status: item.status,
  };
}

export function isRetryableStatus(status: QueueItem['status']): boolean {
  return status === 'failed' || status === 'pending';
}

export function getItemAge(item: QueueItem): number {
  return Date.now() - item.discoveryTimestamp;
}

export function sortItemsByDiscoveryTime(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => a.discoveryTimestamp - b.discoveryTimestamp);
}
