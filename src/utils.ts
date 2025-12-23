import { parse } from 'yaml';
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
// Page Metadata Utilities
// ============================================================================

/**
 * Get the .meta.json path for an HTML file
 */
export function getMetaPath(htmlPath: string): string {
  const dir = dirname(htmlPath);
  const base = basename(htmlPath, '.html');
  return join(dir, `${base}.meta.json`);
}

/**
 * Read page metadata from .meta.json sidecar file
 * Falls back to file mtime if .meta.json doesn't exist
 * 
 * @param htmlPath - Path to the HTML file
 * @returns PageMeta or null if file doesn't exist
 */
export function readPageMeta(htmlPath: string): PageMeta | null {
  if (!existsSync(htmlPath)) {
    return null;
  }

  const metaPath = getMetaPath(htmlPath);
  
  if (existsSync(metaPath)) {
    try {
      const content = readFileSync(metaPath, 'utf-8');
      return JSON.parse(content) as PageMeta;
    } catch {
      // Fall through to mtime fallback
    }
  }

  // Fallback: create meta from file mtime
  try {
    const stats = statSync(htmlPath);
    // Extract pageId from filename (format: {pageId}-{slug}.html)
    const base = basename(htmlPath, '.html');
    const pageId = base.split('-')[0];
    
    return {
      pageId,
      version: 0, // Unknown version, will trigger re-download on version check
      modifiedDate: stats.mtime.toISOString(),
      downloadedAt: stats.mtime.toISOString()
    };
  } catch {
    return null;
  }
}

/**
 * Write page metadata to .meta.json sidecar file
 * 
 * @param htmlPath - Path to the HTML file
 * @param meta - Metadata to write
 */
export function writePageMeta(htmlPath: string, meta: PageMeta): void {
  const metaPath = getMetaPath(htmlPath);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
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
 * 
 * @param indexEntry - Page entry from index with current version
 * @param existingMeta - Metadata from existing download
 * @returns Object with needsDownload boolean and reason
 */
export function checkPageStatus(
  indexEntry: PageIndexEntry,
  existingMeta: PageMeta | null
): { needsDownload: boolean; reason: 'new' | 'updated' | 'up-to-date'; details?: string } {
  if (!existingMeta) {
    return { needsDownload: true, reason: 'new' };
  }
  
  // Compare versions (primary check)
  const indexVersion = indexEntry.version ?? 0;
  const metaVersion = existingMeta.version ?? 0;
  
  if (indexVersion > metaVersion) {
    return { 
      needsDownload: true, 
      reason: 'updated',
      details: `v${metaVersion} → v${indexVersion}`
    };
  }
  
  // If versions match but meta version is 0 (fallback), compare dates
  if (metaVersion === 0 && indexEntry.modifiedDate) {
    const indexDate = new Date(indexEntry.modifiedDate);
    const metaDate = new Date(existingMeta.downloadedAt);
    
    if (indexDate > metaDate) {
      return {
        needsDownload: true,
        reason: 'updated',
        details: `modified after download`
      };
    }
  }
  
  return { needsDownload: false, reason: 'up-to-date' };
}
