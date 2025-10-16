/**
 * T088: Queue checksum validation utilities
 * Supports FR-038 for queue integrity verification
 */

import { createHash } from 'crypto';
import type { QueueItem, DownloadQueue } from '../models/queueEntities.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checksumValid: boolean;
  structureValid: boolean;
}

export interface QueueIntegrityCheck {
  queueStateValid: boolean;
  itemsValid: boolean;
  metricsConsistent: boolean;
  orderingValid: boolean;
  checksumMatch: boolean;
  issues: string[];
}

/**
 * Validate complete queue state for persistence.
 */
export function validateQueueState(queue: DownloadQueue): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate basic structure
  const structureValid = validateQueueStructure(queue, errors);
  
  // Validate individual items
  validateQueueItems(queue, errors, warnings);
  
  // Validate processing order consistency
  validateProcessingOrder(queue, errors, warnings);
  
  // Validate metrics consistency
  validateMetricsConsistency(queue, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checksumValid: true, // Not applicable for in-memory queue
    structureValid,
  };
}

/**
 * Validate persisted queue data with checksum verification.
 */
export function validatePersistedData(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Data must be an object');
    return {
      valid: false,
      errors,
      warnings,
      checksumValid: false,
      structureValid: false,
    };
  }

  const state = data as Record<string, unknown>;
  
  // Validate structure
  const structureValid = validatePersistedStructure(state, errors);
  
  // Validate checksum if structure is valid
  let checksumValid = false;
  if (structureValid) {
    checksumValid = validateChecksum(state, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checksumValid,
    structureValid,
  };
}

/**
 * Perform comprehensive integrity check on queue.
 */
export function performIntegrityCheck(queue: DownloadQueue): QueueIntegrityCheck {
  const issues: string[] = [];

  const queueStateValid = checkQueueStateIntegrity(queue, issues);
  const itemsValid = checkItemsIntegrity(queue, issues);
  const metricsConsistent = checkMetricsConsistency(queue, issues);
  const orderingValid = checkOrderingIntegrity(queue, issues);

  return {
    queueStateValid,
    itemsValid,
    metricsConsistent,
    orderingValid,
    checksumMatch: true, // In-memory queues don't have checksums
    issues,
  };
}

/**
 * Generate checksum for queue state.
 */
export function generateQueueChecksum(
  queueItems: QueueItem[],
  processedPageIds: string[],
  spaceKey: string
): string {
  const data = {
    queueItems: queueItems.sort((a, b) => a.pageId.localeCompare(b.pageId)),
    processedPageIds: [...processedPageIds].sort(),
    spaceKey,
  };

  const jsonString = JSON.stringify(data);
  return createHash('sha256').update(jsonString, 'utf-8').digest('hex').substring(0, 16);
}

/**
 * Verify queue checksum matches expected value.
 */
export function verifyQueueChecksum(
  queue: DownloadQueue,
  expectedChecksum: string,
  spaceKey: string
): boolean {
  try {
    const queueItems = queue.items ? Array.from(queue.items.values()) : [];
    const processedPageIds = queue.processedPages ? Array.from(queue.processedPages) : [];
    
    const actualChecksum = generateQueueChecksum(queueItems, processedPageIds, spaceKey);
    return actualChecksum === expectedChecksum;
  } catch {
    return false;
  }
}

function validateQueueStructure(queue: DownloadQueue, errors: string[]): boolean {
  if (!queue.items || !(queue.items instanceof Map)) {
    errors.push('Queue items must be a Map');
    return false;
  }

  if (!Array.isArray(queue.processingOrder)) {
    errors.push('Processing order must be an array');
    return false;
  }

  if (!queue.processedPages || !(queue.processedPages instanceof Set)) {
    errors.push('Processed pages must be a Set');
    return false;
  }

  if (!queue.metrics || typeof queue.metrics !== 'object') {
    errors.push('Queue metrics must be an object');
    return false;
  }

  return true;
}

function validateQueueItems(
  queue: DownloadQueue,
  errors: string[],
  warnings: string[]
): void {
  if (!queue.items) return;

  for (const [pageId, item] of queue.items) {
    // Validate pageId consistency
    if (item.pageId !== pageId) {
      errors.push(`Page ID mismatch: key=${pageId}, item.pageId=${item.pageId}`);
    }

    // Validate item structure
    validateQueueItem(item, errors, warnings);
  }
}

function validateQueueItem(
  item: QueueItem,
  errors: string[],
  warnings: string[]
): void {
  // Basic validation
  if (!item.pageId || typeof item.pageId !== 'string') {
    errors.push(`Invalid pageId: ${item.pageId}`);
  }

  if (!['initial', 'macro', 'reference', 'user'].includes(item.sourceType)) {
    errors.push(`Invalid sourceType: ${item.sourceType}`);
  }

  if (typeof item.discoveryTimestamp !== 'number' || item.discoveryTimestamp <= 0) {
    errors.push(`Invalid discoveryTimestamp: ${item.discoveryTimestamp}`);
  }

  if (typeof item.retryCount !== 'number' || item.retryCount < 0) {
    errors.push(`Invalid retryCount: ${item.retryCount}`);
  }

  if (!['pending', 'processing', 'completed', 'failed'].includes(item.status)) {
    errors.push(`Invalid status: ${item.status}`);
  }

  // Add warnings for concerning states
  addItemWarnings(item, warnings);
}

function addItemWarnings(item: QueueItem, warnings: string[]): void {
  if (item.retryCount > 5) {
    warnings.push(`High retry count for ${item.pageId}: ${item.retryCount}`);
  }

  const ageMs = Date.now() - item.discoveryTimestamp;
  if (ageMs > 24 * 60 * 60 * 1000) { // 24 hours
    warnings.push(`Old queue item ${item.pageId}: ${Math.round(ageMs / (60 * 60 * 1000))} hours old`);
  }
}

function validateProcessingOrder(
  queue: DownloadQueue,
  errors: string[],
  warnings: string[]
): void {
  if (!queue.items || !queue.processingOrder) return;

  // Check existence and duplicates
  validateOrderEntries(queue, errors);
  
  // Check consistency with item states
  validateOrderConsistency(queue, warnings);
}

function validateOrderEntries(queue: DownloadQueue, errors: string[]): void {
  const seen = new Set<string>();
  
  if (!queue.processingOrder || !queue.items) return;
  
  for (const pageId of queue.processingOrder) {
    if (!queue.items.has(pageId)) {
      errors.push(`Processing order contains non-existent item: ${pageId}`);
    }
    
    if (seen.has(pageId)) {
      errors.push(`Duplicate in processing order: ${pageId}`);
    }
    seen.add(pageId);
  }
}

function validateOrderConsistency(queue: DownloadQueue, warnings: string[]): void {
  if (!queue.items || !queue.processingOrder) return;
  
  for (const [pageId, item] of queue.items) {
    if ((item.status === 'pending' || item.status === 'processing') && 
        !queue.processingOrder.includes(pageId)) {
      warnings.push(`Pending/processing item not in processing order: ${pageId}`);
    }
  }
}

function validateMetricsConsistency(
  queue: DownloadQueue,
  errors: string[],
  warnings: string[]
): void {
  if (!queue.items || !queue.metrics) return;

  const itemCounts = countItemsByStatus(queue.items);
  
  // Validate current queue size
  const expectedCurrentSize = itemCounts.pending + itemCounts.processing;
  if (queue.metrics.currentQueueSize !== expectedCurrentSize) {
    errors.push(
      `Metrics currentQueueSize (${queue.metrics.currentQueueSize}) ` +
      `doesn't match actual size (${expectedCurrentSize})`
    );
  }

  // Check if total processed matches processed pages count
  if (queue.processedPages && 
      queue.metrics.totalProcessed !== queue.processedPages.size) {
    warnings.push(
      `Metrics totalProcessed (${queue.metrics.totalProcessed}) ` +
      `doesn't match processedPages size (${queue.processedPages.size})`
    );
  }
}

function validatePersistedStructure(
  state: Record<string, unknown>,
  errors: string[]
): boolean {
  const requiredFields = ['version', 'timestamp', 'spaceKey', 'queueItems', 'processedPageIds', 'metrics', 'checksum'];
  
  for (const field of requiredFields) {
    if (!(field in state)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof state.version !== 'number' || state.version < 1) {
    errors.push('Invalid version number');
  }

  if (!Array.isArray(state.queueItems)) {
    errors.push('queueItems must be an array');
  }

  if (!Array.isArray(state.processedPageIds)) {
    errors.push('processedPageIds must be an array');
  }

  return errors.length === 0;
}

function validateChecksum(state: Record<string, unknown>, errors: string[]): boolean {
  try {
    const { checksum, ...dataWithoutChecksum } = state;
    const expectedChecksum = calculatePersistenceChecksum(dataWithoutChecksum);
    
    if (checksum !== expectedChecksum) {
      errors.push('Checksum validation failed');
      return false;
    }
    
    return true;
  } catch (error) {
    errors.push(`Checksum calculation failed: ${error}`);
    return false;
  }
}

function calculatePersistenceChecksum(data: Record<string, unknown>): string {
  const jsonString = JSON.stringify(data, Object.keys(data).sort());
  return createHash('sha256').update(jsonString, 'utf-8').digest('hex').substring(0, 16);
}

function checkQueueStateIntegrity(queue: DownloadQueue, issues: string[]): boolean {
  let valid = true;

  if (!queue.items || !queue.processingOrder || !queue.processedPages) {
    issues.push('Missing required queue components');
    valid = false;
  }

  if (typeof queue.maxQueueSize !== 'number' || queue.maxQueueSize <= 0) {
    issues.push('Invalid maxQueueSize');
    valid = false;
  }

  return valid;
}

function checkItemsIntegrity(queue: DownloadQueue, issues: string[]): boolean {
  if (!queue.items) return false;

  let valid = true;
  const pageIds = new Set<string>();

  for (const [key, item] of queue.items) {
    if (key !== item.pageId) {
      issues.push(`Key mismatch: ${key} !== ${item.pageId}`);
      valid = false;
    }

    if (pageIds.has(item.pageId)) {
      issues.push(`Duplicate pageId: ${item.pageId}`);
      valid = false;
    }
    pageIds.add(item.pageId);
  }

  return valid;
}

function checkMetricsConsistency(queue: DownloadQueue, issues: string[]): boolean {
  if (!queue.items || !queue.metrics) return false;

  let valid = true;
  const itemCounts = countItemsByStatus(queue.items);

  // Check metrics against actual counts
  if (queue.metrics.currentQueueSize !== itemCounts.pending + itemCounts.processing) {
    issues.push('Current queue size metric inconsistent with actual item counts');
    valid = false;
  }

  return valid;
}

function checkOrderingIntegrity(queue: DownloadQueue, issues: string[]): boolean {
  if (!queue.processingOrder || !queue.items) return false;

  let valid = true;

  // Check for orphaned order entries
  for (const pageId of queue.processingOrder) {
    if (!queue.items.has(pageId)) {
      issues.push(`Orphaned processing order entry: ${pageId}`);
      valid = false;
    }
  }

  return valid;
}

function countItemsByStatus(items: Map<string, QueueItem>) {
  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  
  for (const item of items.values()) {
    counts[item.status]++;
  }
  
  return counts;
}

/**
 * Quick validation for queue item before adding to queue.
 */
export function validateQueueItemQuick(item: QueueItem): { valid: boolean; error?: string } {
  if (!item.pageId || typeof item.pageId !== 'string') {
    return { valid: false, error: 'Invalid pageId' };
  }

  if (!['initial', 'macro', 'reference', 'user'].includes(item.sourceType)) {
    return { valid: false, error: 'Invalid sourceType' };
  }

  if (typeof item.retryCount !== 'number' || item.retryCount < 0) {
    return { valid: false, error: 'Invalid retryCount' };
  }

  if (!['pending', 'processing', 'completed', 'failed'].includes(item.status)) {
    return { valid: false, error: 'Invalid status' };
  }

  return { valid: true };
}

/**
 * Sanitize queue item to ensure it's valid.
 */
export function sanitizeQueueItem(item: Partial<QueueItem>): QueueItem | null {
  if (!item.pageId || typeof item.pageId !== 'string') {
    return null;
  }

  return {
    pageId: item.pageId,
    sourceType: ['initial', 'macro', 'reference', 'user'].includes(item.sourceType as string) 
      ? item.sourceType as QueueItem['sourceType'] 
      : 'reference',
    discoveryTimestamp: typeof item.discoveryTimestamp === 'number' && item.discoveryTimestamp > 0
      ? item.discoveryTimestamp 
      : Date.now(),
    retryCount: typeof item.retryCount === 'number' && item.retryCount >= 0 
      ? item.retryCount 
      : 0,
    parentPageId: typeof item.parentPageId === 'string' ? item.parentPageId : undefined,
    status: ['pending', 'processing', 'completed', 'failed'].includes(item.status as string)
      ? item.status as QueueItem['status']
      : 'pending',
  };
}
