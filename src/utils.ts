import { parse } from 'yaml';
import fs, { readFileSync } from 'fs';
import { join } from 'path/posix';
import type { ConfluenceConfig, PageIndexEntry, } from './types.js';

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
