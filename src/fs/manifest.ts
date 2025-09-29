import { readFile, stat } from 'fs/promises';
import { atomicWriteJson } from './atomicWriter.js';
import type { ManifestEntry } from '../models/entities.js';
import { logger } from '../util/logger.js';

export interface Manifest {
  version: string;
  timestamp: string;
  spaceKey: string;
  entries: ManifestEntry[];
}

export interface ManifestDiff {
  added: ManifestEntry[];
  modified: ManifestEntry[];
  deleted: ManifestEntry[];
  unchanged: ManifestEntry[];
}

/**
 * Load manifest from file, returning empty manifest if file doesn't exist
 */
export async function loadManifest(filePath: string): Promise<Manifest> {
  try {
    const content = await readFile(filePath, 'utf8');
    const manifest = JSON.parse(content) as Manifest;
    
    logger.debug('Manifest loaded', {
      path: filePath,
      version: manifest.version,
      entries: manifest.entries.length
    });
    
    return manifest;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // File doesn't exist - return empty manifest
      logger.debug('No existing manifest found, creating new one', { path: filePath });
      return createEmptyManifest();
    }
    
    logger.error('Failed to load manifest', {
      path: filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new Error(`Failed to load manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Save manifest to file atomically
 */
export async function saveManifest(filePath: string, manifest: Manifest): Promise<void> {
  try {
    await atomicWriteJson(filePath, manifest);
    
    logger.debug('Manifest saved', {
      path: filePath,
      version: manifest.version,
      entries: manifest.entries.length
    });
  } catch (error) {
    logger.error('Failed to save manifest', {
      path: filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new Error(`Failed to save manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a new empty manifest
 */
export function createEmptyManifest(spaceKey = ''): Manifest {
  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    spaceKey,
    entries: []
  };
}

/**
 * Update manifest with new entries
 */
export function updateManifest(
  existing: Manifest,
  newEntries: ManifestEntry[],
  spaceKey?: string
): Manifest {
  return {
    ...existing,
    timestamp: new Date().toISOString(),
    spaceKey: spaceKey || existing.spaceKey,
    entries: newEntries
  };
}

/**
 * Compare two manifests and return the differences
 */
export function diffManifests(oldManifest: Manifest, newManifest: Manifest): ManifestDiff {
  const oldEntries = new Map(oldManifest.entries.map(entry => [entry.id, entry]));
  const newEntries = new Map(newManifest.entries.map(entry => [entry.id, entry]));
  
  const added: ManifestEntry[] = [];
  const modified: ManifestEntry[] = [];
  const unchanged: ManifestEntry[] = [];
  const deleted: ManifestEntry[] = [];

  // Check for added and modified entries
  for (const [id, newEntry] of newEntries) {
    const oldEntry = oldEntries.get(id);
    
    if (!oldEntry) {
      added.push(newEntry);
    } else if (hasEntryChanged(oldEntry, newEntry)) {
      modified.push(newEntry);
    } else {
      unchanged.push(newEntry);
    }
  }

  // Check for deleted entries
  for (const [id, oldEntry] of oldEntries) {
    if (!newEntries.has(id)) {
      deleted.push(oldEntry);
    }
  }

  logger.debug('Manifest diff computed', {
    added: added.length,
    modified: modified.length,
    deleted: deleted.length,
    unchanged: unchanged.length
  });

  return {
    added,
    modified,
    deleted,
    unchanged
  };
}

/**
 * Check if a manifest entry has changed
 */
function hasEntryChanged(oldEntry: ManifestEntry, newEntry: ManifestEntry): boolean {
  // Compare key properties that indicate content changes
  return (
    oldEntry.title !== newEntry.title ||
    oldEntry.hash !== newEntry.hash ||
    oldEntry.version !== newEntry.version ||
    oldEntry.path !== newEntry.path ||
    oldEntry.status !== newEntry.status ||
    oldEntry.parentId !== newEntry.parentId
  );
}

/**
 * Validate manifest structure and entries
 */
export function validateManifest(manifest: Manifest): void {
  if (!manifest.version) {
    throw new Error('Manifest missing version');
  }
  
  if (!manifest.timestamp) {
    throw new Error('Manifest missing timestamp');
  }
  
  if (!Array.isArray(manifest.entries)) {
    throw new Error('Manifest entries must be an array');
  }
  
  // Validate each entry
  for (const entry of manifest.entries) {
    if (!entry.id) {
      throw new Error('Manifest entry missing id');
    }
    
    if (!entry.title) {
      throw new Error(`Manifest entry ${entry.id} missing title`);
    }
    
    if (!entry.path) {
      throw new Error(`Manifest entry ${entry.id} missing path`);
    }
    
    if (!entry.hash) {
      throw new Error(`Manifest entry ${entry.id} missing hash`);
    }
    
    if (!entry.status) {
      throw new Error(`Manifest entry ${entry.id} missing status`);
    }
  }
}

/**
 * Get file modification time if it exists
 */
export async function getFileModTime(filePath: string): Promise<Date | null> {
  try {
    const stats = await stat(filePath);
    return stats.mtime;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    throw error;
  }
}
