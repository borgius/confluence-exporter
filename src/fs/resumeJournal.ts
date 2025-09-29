import { readFile } from 'fs/promises';
import { atomicWriteJson } from './atomicWriter.js';
import { logger } from '../util/logger.js';

export interface ResumeEntry {
  id: string;
  timestamp: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  type: 'page' | 'attachment';
  pageId?: string;
  attachmentId?: string;
  path?: string;
  error?: string;
  retryCount?: number;
}

export interface ResumeJournal {
  version: string;
  startTime: string;
  lastUpdate: string;
  spaceKey: string;
  entries: ResumeEntry[];
}

/**
 * Load resume journal from file, returning empty journal if file doesn't exist
 */
export async function loadResumeJournal(filePath: string): Promise<ResumeJournal> {
  try {
    const content = await readFile(filePath, 'utf8');
    const journal = JSON.parse(content) as ResumeJournal;
    
    logger.debug('Resume journal loaded', {
      path: filePath,
      entries: journal.entries.length,
      startTime: journal.startTime
    });
    
    return journal;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // File doesn't exist - return empty journal
      logger.debug('No existing resume journal found, creating new one', { path: filePath });
      return createEmptyJournal();
    }
    
    logger.error('Failed to load resume journal', {
      path: filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new Error(`Failed to load resume journal: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Save resume journal to file atomically
 */
export async function saveResumeJournal(filePath: string, journal: ResumeJournal): Promise<void> {
  try {
    const updatedJournal = {
      ...journal,
      lastUpdate: new Date().toISOString()
    };
    
    await atomicWriteJson(filePath, updatedJournal);
    
    logger.debug('Resume journal saved', {
      path: filePath,
      entries: journal.entries.length
    });
  } catch (error) {
    logger.error('Failed to save resume journal', {
      path: filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new Error(`Failed to save resume journal: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a new empty resume journal
 */
export function createEmptyJournal(spaceKey = ''): ResumeJournal {
  const now = new Date().toISOString();
  return {
    version: '1.0.0',
    startTime: now,
    lastUpdate: now,
    spaceKey,
    entries: []
  };
}

/**
 * Add or update a resume entry
 */
export function updateResumeEntry(
  journal: ResumeJournal,
  entry: Omit<ResumeEntry, 'timestamp'>
): ResumeJournal {
  const timestamp = new Date().toISOString();
  const newEntry: ResumeEntry = { ...entry, timestamp };
  
  // Find existing entry by ID
  const existingIndex = journal.entries.findIndex(e => e.id === entry.id);
  
  let newEntries: ResumeEntry[];
  if (existingIndex >= 0) {
    // Update existing entry
    newEntries = [...journal.entries];
    newEntries[existingIndex] = newEntry;
  } else {
    // Add new entry
    newEntries = [...journal.entries, newEntry];
  }
  
  return {
    ...journal,
    lastUpdate: timestamp,
    entries: newEntries
  };
}

/**
 * Mark an entry as completed
 */
export function markCompleted(journal: ResumeJournal, entryId: string, path?: string): ResumeJournal {
  return updateResumeEntry(journal, {
    id: entryId,
    status: 'completed',
    type: getEntryType(journal, entryId),
    path
  });
}

/**
 * Mark an entry as failed
 */
export function markFailed(
  journal: ResumeJournal,
  entryId: string,
  error: string,
  retryCount = 0
): ResumeJournal {
  return updateResumeEntry(journal, {
    id: entryId,
    status: 'failed',
    type: getEntryType(journal, entryId),
    error,
    retryCount
  });
}

/**
 * Get pending entries that need to be processed
 */
export function getPendingEntries(journal: ResumeJournal): ResumeEntry[] {
  return journal.entries.filter(entry => 
    entry.status === 'pending' || entry.status === 'processing'
  );
}

/**
 * Get completed entries
 */
export function getCompletedEntries(journal: ResumeJournal): ResumeEntry[] {
  return journal.entries.filter(entry => entry.status === 'completed');
}

/**
 * Get failed entries that might need retry
 */
export function getFailedEntries(journal: ResumeJournal, maxRetries = 3): ResumeEntry[] {
  return journal.entries.filter(entry => 
    entry.status === 'failed' && (entry.retryCount || 0) < maxRetries
  );
}

/**
 * Check if export can be resumed
 */
export function canResume(journal: ResumeJournal, currentSpaceKey: string): boolean {
  if (journal.spaceKey !== currentSpaceKey) {
    logger.warn('Resume journal space key mismatch', {
      journalSpace: journal.spaceKey,
      currentSpace: currentSpaceKey
    });
    return false;
  }
  
  const pendingCount = getPendingEntries(journal).length;
  const failedCount = getFailedEntries(journal).length;
  
  logger.debug('Resume check', {
    pendingEntries: pendingCount,
    failedEntries: failedCount,
    totalEntries: journal.entries.length
  });
  
  return pendingCount > 0 || failedCount > 0;
}

/**
 * Clean up old entries from journal (keep only recent failed/pending)
 */
export function cleanupJournal(
  journal: ResumeJournal,
  maxAge: number = 7 * 24 * 60 * 60 * 1000 // 7 days in ms
): ResumeJournal {
  const cutoffTime = new Date(Date.now() - maxAge);
  
  const filteredEntries = journal.entries.filter(entry => {
    const entryTime = new Date(entry.timestamp);
    
    // Keep all pending/processing entries regardless of age
    if (entry.status === 'pending' || entry.status === 'processing') {
      return true;
    }
    
    // Keep recent failed entries for retry
    if (entry.status === 'failed' && entryTime > cutoffTime) {
      return true;
    }
    
    // Remove old completed entries
    return false;
  });
  
  logger.debug('Journal cleanup', {
    originalEntries: journal.entries.length,
    filteredEntries: filteredEntries.length,
    removed: journal.entries.length - filteredEntries.length
  });
  
  return {
    ...journal,
    entries: filteredEntries
  };
}

/**
 * Get entry type from existing journal entry or infer from ID
 */
function getEntryType(journal: ResumeJournal, entryId: string): 'page' | 'attachment' {
  const existing = journal.entries.find(e => e.id === entryId);
  return existing?.type || (entryId.startsWith('att-') ? 'attachment' : 'page');
}
