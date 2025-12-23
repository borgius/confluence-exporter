import { parse, stringify } from 'yaml';
import fs, { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import type { ConfluenceConfig, PageIndexEntry, PageMeta } from './types.js';

/**
 * Utility functions used across the application
 */

/**
 * Convert text to safe filename/slug
 * 
 * @param text - Text to slugify
 * @returns Slugified text (lowercase, hyphens, no special chars)
 * 
 * @example
 * slugify("My Page Title!") // "my-page-title"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single
    .trim();
}

/**
 * Attempt to reverse slugification (best effort)
 * Converts hyphens to spaces and capitalizes first letter of each word
 * 
 * @param slug - Slugified text to convert back
 * @returns Title-cased text with spaces
 * 
 * @example
 * unslugify("my-page-title") // "My Page Title"
 */
export function unslugify(slug: string): string {
  return slug
    .replace(/-/g, ' ')           // Replace hyphens with spaces
    .replace(/\b\w/g, c => c.toUpperCase()); // Capitalize first letter of each word
}

export const pageFilename = (item: PageIndexEntry, ext='.md') => {
  const slug = slugify(item.title);
  return `${item.id}-${slug}${ext}`;
};

export const pagePath = (id: string, config: ConfluenceConfig) => {
  const indexFile = join(config.outputDir, '_index.yaml');
  const indexContent = readFileSync(indexFile, 'utf-8');
  const index = parse(indexContent) as PageIndexEntry[];

  const findParents = (id: string, path: string[]): string[] => {
    const entry = index.find(e => e.id === id);
    if (!entry) return [];
    path.unshift(pageFilename(entry, ''));
    if (entry.parentId) {
      return findParents(entry.parentId, path);
    }
    return path;
  };
  const item = index.find(e => e.id === id);
  if (!item) {
    throw new Error(`Page with ID ${id} not found in index`);
  }
  const parents = item.parentId ? findParents(item.parentId, []) : [];
  return join(config.outputDir, config.spaceKey, ...parents, pageFilename(item, '.html'));
}

// ============================================================================
// Page Metadata Utilities (Index-based)
// ============================================================================

/**
 * Read a specific entry from _index.yaml
 */
export function readIndexEntry(indexPath: string, pageId: string): PageIndexEntry | null {
  if (!existsSync(indexPath)) return null;

  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index: PageIndexEntry[] = parse(content);
    return index.find(entry => entry.id === pageId) || null;
  } catch {
    return null;
  }
}

/**
 * Update a specific entry in _index.yaml
 */
export function updateIndexEntry(
  indexPath: string,
  pageId: string,
  updates: Partial<PageIndexEntry>
): boolean {
  if (!existsSync(indexPath)) return false;

  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index: PageIndexEntry[] = parse(content);

    const entryIndex = index.findIndex(entry => entry.id === pageId);
    if (entryIndex === -1) return false;

    // Update the entry
    index[entryIndex] = { ...index[entryIndex], ...updates };

    // Write back to file
    const yamlContent = stringify(index, {
      indent: 2,
      lineWidth: 0
    });
    writeFileSync(indexPath, yamlContent, 'utf-8');

    return true;
  } catch {
    return false;
  }
}

/**
 * Find existing HTML file for a page by ID
 * Searches recursively in the output directory for {pageId}-*.html pattern
 * 
 * @param outputDir - Root directory to search
 * @param pageId - Page ID to find
 * @returns Path to HTML file or null if not found
 */
export function findExistingFile(outputDir: string, pageId: string): string | null {
  const pattern = new RegExp(`^${pageId}-.*\\.html$`);
  
  function searchDir(dir: string): string | null {
    if (!existsSync(dir)) return null;
    
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isFile() && pattern.test(entry.name)) {
          return fullPath;
        }
        
        if (entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'images') {
          const found = searchDir(fullPath);
          if (found) return found;
        }
      }
    } catch {
      // Ignore permission errors, etc.
    }
    
    return null;
  }
  
  return searchDir(outputDir);
}

/**
 * Check if a page needs to be downloaded based on version comparison
 * Uses index entry download tracking fields
 * 
 * @param indexEntry - Page entry from index with current version
 * @returns Object with needsDownload boolean and reason
 */
export function checkPageStatus(
  indexEntry: PageIndexEntry
): { needsDownload: boolean; reason: 'new' | 'updated' | 'up-to-date'; details?: string } {
  const downloadedVersion = indexEntry.downloadedVersion ?? 0;
  const currentVersion = indexEntry.version ?? 0;

  // If never downloaded, it's new
  if (indexEntry.downloadedAt === undefined) {
    return { needsDownload: true, reason: 'new' };
  }

  // Compare versions (primary check)
  if (currentVersion > downloadedVersion) {
    return { 
      needsDownload: true, 
      reason: 'updated',
      details: `v${downloadedVersion} → v${currentVersion}`
    };
  }

  // If versions match but downloadedVersion is 0 (fallback), compare dates
  if (downloadedVersion === 0 && indexEntry.modifiedDate && indexEntry.downloadedAt) {
    const currentDate = new Date(indexEntry.modifiedDate);
    const downloadedDate = new Date(indexEntry.downloadedAt);
    
    if (currentDate > downloadedDate) {
      return {
        needsDownload: true,
        reason: 'updated',
        details: `modified after download`
      };
    }
  }
  
  return { needsDownload: false, reason: 'up-to-date' };
}
