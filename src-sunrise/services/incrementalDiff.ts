/**
 * Incremental export diff computation for detecting changes and deletions
 * 
 * FR-011: Implements full incremental export with change detection
 * FR-012: Avoids duplicate network fetches for already processed pages
 * FR-018: Provides checksum/hash for exported content change detection (optional MVP)
 */

import type { ManifestEntry, Page, Attachment } from '../models/entities.js';
import type { Manifest, ManifestDiff } from '../fs/manifest.js';
import { diffManifests } from '../fs/manifest.js';
import { contentHash } from '../util/hash.js';
import { logger } from '../util/logger.js';

export interface IncrementalDiffResult {
  manifestDiff: ManifestDiff;
  pagesToProcess: Page[];
  attachmentsToProcess: Attachment[];
  skippedPages: Page[];
  summary: {
    totalPages: number;
    pagesToUpdate: number;
    pagesSkipped: number;
    totalAttachments: number;
    attachmentsToUpdate: number;
  };
}

export interface DiffOptions {
  forceFullExport?: boolean;
  includeUnchanged?: boolean;
  contentHashCheck?: boolean;
}

/**
 * Compute incremental differences between current and previous export
 */
export function computeIncrementalDiff(
  currentPages: Page[],
  currentAttachments: Attachment[],
  previousManifest: Manifest,
  options: DiffOptions = {}
): IncrementalDiffResult {
  const {
    forceFullExport = false,
    includeUnchanged = false,
    contentHashCheck = true
  } = options;

  // If forcing full export, process everything
  if (forceFullExport) {
    return createFullExportResult(currentPages, currentAttachments);
  }

  // Build current manifest entries for comparison
  const currentManifestEntries = buildCurrentManifestEntries(
    currentPages,
    contentHashCheck
  );

  // Create temporary manifest for comparison
  const currentManifest: Manifest = {
    version: previousManifest.version,
    timestamp: new Date().toISOString(),
    spaceKey: previousManifest.spaceKey,
    entries: currentManifestEntries
  };

  // Compute manifest differences
  const manifestDiff = diffManifests(previousManifest, currentManifest);

  // Determine pages to process
  const pagesToProcess = determinePagesToProcess(
    currentPages,
    manifestDiff,
    includeUnchanged
  );

  // Determine attachments to process
  const attachmentsToProcess = determineAttachmentsToProcess(
    currentAttachments,
    pagesToProcess,
    previousManifest
  );

  // Calculate skipped pages
  const processedPageIds = new Set(pagesToProcess.map(p => p.id));
  const skippedPages = currentPages.filter(page => !processedPageIds.has(page.id));

  const result: IncrementalDiffResult = {
    manifestDiff,
    pagesToProcess,
    attachmentsToProcess,
    skippedPages,
    summary: {
      totalPages: currentPages.length,
      pagesToUpdate: pagesToProcess.length,
      pagesSkipped: skippedPages.length,
      totalAttachments: currentAttachments.length,
      attachmentsToUpdate: attachmentsToProcess.length
    }
  };

  logger.info('Incremental diff computed', result.summary);

  return result;
}

/**
 * Build manifest entries for current pages
 */
function buildCurrentManifestEntries(
  pages: Page[],
  computeContentHash: boolean
): ManifestEntry[] {
  const entries: ManifestEntry[] = [];

  for (const page of pages) {
    let hash = '';
    
    if (computeContentHash && page.bodyStorage) {
      hash = contentHash(page.bodyStorage);
    }

    const entry: ManifestEntry = {
      id: page.id,
      title: page.title,
      path: page.path || '',
      hash,
      version: page.version,
      status: 'added',
      parentId: page.parentId
    };

    entries.push(entry);
  }

  return entries;
}

/**
 * Determine which pages need processing based on manifest diff
 */
function determinePagesToProcess(
  currentPages: Page[],
  manifestDiff: ManifestDiff,
  includeUnchanged: boolean
): Page[] {
  const pageMap = new Map(currentPages.map(page => [page.id, page]));
  const pagesToProcess: Page[] = [];

  // Always process added pages
  for (const entry of manifestDiff.added) {
    const page = pageMap.get(entry.id);
    if (page) {
      pagesToProcess.push(page);
    }
  }

  // Always process modified pages
  for (const entry of manifestDiff.modified) {
    const page = pageMap.get(entry.id);
    if (page) {
      pagesToProcess.push(page);
    }
  }

  // Optionally include unchanged pages
  if (includeUnchanged) {
    for (const entry of manifestDiff.unchanged) {
      const page = pageMap.get(entry.id);
      if (page) {
        pagesToProcess.push(page);
      }
    }
  }

  return pagesToProcess;
}

/**
 * Determine which attachments need processing
 */
function determineAttachmentsToProcess(
  currentAttachments: Attachment[],
  pagesToProcess: Page[],
  previousManifest: Manifest
): Attachment[] {
  const processedPageIds = new Set(pagesToProcess.map(p => p.id));
  const previouslyProcessedAttachments = new Set(
    previousManifest.entries
      .map(entry => extractAttachmentIdsFromPath(entry.path))
      .flat()
  );

  return currentAttachments.filter(attachment => {
    // Process attachments for pages being processed
    if (processedPageIds.has(attachment.pageId)) {
      return true;
    }

    // Process new attachments not seen before
    if (!previouslyProcessedAttachments.has(attachment.id)) {
      return true;
    }

    return false;
  });
}

/**
 * Extract attachment IDs referenced in a page path (simplified heuristic)
 */
function extractAttachmentIdsFromPath(_path: string): string[] {
  // This is a simplified implementation
  // In practice, you might maintain a separate attachment manifest
  // or track attachment references more explicitly
  return [];
}

/**
 * Create result for full export (no incremental logic)
 */
function createFullExportResult(
  currentPages: Page[],
  currentAttachments: Attachment[]
): IncrementalDiffResult {
  const emptyDiff: ManifestDiff = {
    added: [],
    modified: [],
    deleted: [],
    unchanged: []
  };

  return {
    manifestDiff: emptyDiff,
    pagesToProcess: currentPages,
    attachmentsToProcess: currentAttachments,
    skippedPages: [],
    summary: {
      totalPages: currentPages.length,
      pagesToUpdate: currentPages.length,
      pagesSkipped: 0,
      totalAttachments: currentAttachments.length,
      attachmentsToUpdate: currentAttachments.length
    }
  };
}

/**
 * Check if a page has content changes based on hash comparison
 */
export function hasPageContentChanged(
  page: Page,
  previousEntry: ManifestEntry
): boolean {
  if (!page.bodyStorage || !previousEntry.hash) {
    // Can't compare - assume changed
    return true;
  }

  const currentHash = contentHash(page.bodyStorage);
  return currentHash !== previousEntry.hash;
}

/**
 * Analyze diff to provide detailed change summary
 */
export function analyzeDiffSummary(diff: ManifestDiff): {
  changeTypes: Record<string, number>;
  impactedPages: number;
  recommendations: string[];
} {
  const changeTypes = {
    added: diff.added.length,
    modified: diff.modified.length,
    deleted: diff.deleted.length,
    unchanged: diff.unchanged.length
  };

  const impactedPages = diff.added.length + diff.modified.length + diff.deleted.length;
  const recommendations: string[] = [];

  if (impactedPages === 0) {
    recommendations.push('No changes detected - consider skipping export');
  } else if (impactedPages < 10) {
    recommendations.push('Small change set - incremental export recommended');
  } else if (impactedPages > 100) {
    recommendations.push('Large change set - consider full export for consistency');
  }

  if (diff.deleted.length > 0) {
    recommendations.push(`${diff.deleted.length} pages deleted - review cleanup requirements`);
  }

  return {
    changeTypes,
    impactedPages,
    recommendations
  };
}
