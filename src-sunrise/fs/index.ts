export { 
  atomicWriteFile,
  atomicWriteJson,
  type AtomicWriteOptions
} from './atomicWriter.js';

export {
  loadManifest,
  saveManifest,
  createEmptyManifest,
  updateManifest,
  diffManifests,
  validateManifest,
  getFileModTime,
  type Manifest,
  type ManifestDiff
} from './manifest.js';

export {
  getAttachmentPaths,
  storeAttachment,
  buildAttachmentStructure,
  validateAttachmentConfig,
  type AttachmentStorageConfig,
  type AttachmentPaths
} from './attachments.js';

export {
  loadResumeJournal,
  saveResumeJournal,
  createEmptyJournal,
  updateResumeEntry,
  markCompleted,
  markFailed,
  getPendingEntries,
  getCompletedEntries,
  getFailedEntries,
  canResume,
  cleanupJournal,
  type ResumeEntry,
  type ResumeJournal
} from './resumeJournal.js';

export {
  resolveSlugCollisions,
  resolveSingleSlug,
  extractExistingSlugs,
  applySlugResolutions,
  validateSlugResolutions,
  buildHierarchicalPaths,
  type SlugCollisionContext,
  type SlugResolution
} from './slugCollision.js';
