import { join, extname, basename } from 'path';
import { atomicWriteFile } from './atomicWriter.js';
import type { Attachment } from '../models/entities.js';
import { slugify } from '../util/slugify.js';
import { logger } from '../util/logger.js';

export interface AttachmentStorageConfig {
  baseDir: string;
  strategy: 'flat' | 'by-page' | 'by-type';
  maxFilenameLength?: number;
  preserveExtensions?: boolean;
}

export interface AttachmentPaths {
  absolutePath: string;
  relativePath: string;
  directory: string;
}

/**
 * Generate storage paths for an attachment based on configuration
 */
export function getAttachmentPaths(
  attachment: Attachment,
  config: AttachmentStorageConfig
): AttachmentPaths {
  const {
    baseDir,
    strategy,
    maxFilenameLength = 100,
    preserveExtensions = true
  } = config;

  let directory: string;

  // Determine directory structure based on strategy
  switch (strategy) {
    case 'flat':
      directory = join(baseDir, 'attachments');
      break;
      
    case 'by-page':
      directory = join(baseDir, 'attachments', slugify(attachment.pageId));
      break;
      
    case 'by-type': {
      const mediaType = attachment.mediaType || 'unknown';
      const typeDir = getTypeDirectory(mediaType);
      directory = join(baseDir, 'attachments', typeDir);
      break;
    }
      
    default:
      throw new Error(`Unknown attachment storage strategy: ${strategy}`);
  }

  // Generate safe filename
  const filename = generateSafeFilename(
    attachment.fileName,
    attachment.id,
    maxFilenameLength,
    preserveExtensions
  );

  const relativePath = join('attachments', 
    strategy === 'flat' ? filename : 
    strategy === 'by-page' ? join(slugify(attachment.pageId), filename) :
    join(getTypeDirectory(attachment.mediaType || 'unknown'), filename)
  );

  const absolutePath = join(directory, filename);

  return {
    absolutePath,
    relativePath,
    directory
  };
}

/**
 * Store attachment content to disk
 */
export async function storeAttachment(
  attachment: Attachment,
  content: Buffer,
  config: AttachmentStorageConfig
): Promise<Attachment> {
  const paths = getAttachmentPaths(attachment, config);

  try {
    await atomicWriteFile(paths.absolutePath, content, {
      ensureDir: true
    });

    logger.debug('Attachment stored', {
      id: attachment.id,
      fileName: attachment.fileName,
      path: paths.relativePath,
      size: content.length
    });

    // Return updated attachment with local path
    return {
      ...attachment,
      localPath: paths.relativePath
    };

  } catch (error) {
    logger.error('Failed to store attachment', {
      id: attachment.id,
      fileName: attachment.fileName,
      path: paths.absolutePath,
      error: error instanceof Error ? error.message : String(error)
    });

    throw new Error(`Failed to store attachment ${attachment.fileName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate a safe filename for filesystem storage
 */
function generateSafeFilename(
  originalName: string,
  attachmentId: string,
  maxLength: number,
  preserveExtension: boolean
): string {
  // Extract extension if preserving
  const ext = preserveExtension ? extname(originalName) : '';
  const nameWithoutExt = preserveExtension ? basename(originalName, ext) : originalName;

  // Slugify the name
  let safeName = slugify(nameWithoutExt);

  // Ensure we have some content
  if (!safeName || safeName.length === 0) {
    safeName = `attachment-${attachmentId.substring(0, 8)}`;
  }

  // Add extension back
  const fullName = safeName + ext;

  // Truncate if too long, preserving extension
  if (fullName.length > maxLength) {
    const availableLength = maxLength - ext.length;
    if (availableLength <= 0) {
      // Extension alone is too long - use ID-based name
      return `att-${attachmentId.substring(0, Math.max(1, maxLength - 4))}`;
    }
    safeName = safeName.substring(0, availableLength);
    return safeName + ext;
  }

  return fullName;
}

/**
 * Get directory name for a media type
 */
function getTypeDirectory(mediaType: string): string {
  const type = mediaType.toLowerCase();
  
  // Map media types to directories
  const typeMap: Record<string, string> = {
    'image': 'images',
    'video': 'videos', 
    'audio': 'audio',
    'pdf': 'documents',
    'text': 'text',
    'json': 'text',
    'xml': 'text',
    'zip': 'archives',
    'tar': 'archives',
    'gzip': 'archives'
  };

  // Check for matches
  for (const [key, dir] of Object.entries(typeMap)) {
    if (type.includes(key)) {
      return dir;
    }
  }
  
  return 'other';
}

/**
 * Build attachment directory structure for a given strategy
 */
export function buildAttachmentStructure(
  attachments: Attachment[],
  config: AttachmentStorageConfig
): Map<string, Attachment[]> {
  const structure = new Map<string, Attachment[]>();

  for (const attachment of attachments) {
    const paths = getAttachmentPaths(attachment, config);
    const dir = paths.directory;

    if (!structure.has(dir)) {
      structure.set(dir, []);
    }

    const dirAttachments = structure.get(dir);
    if (dirAttachments) {
      dirAttachments.push(attachment);
    }
  }

  return structure;
}

/**
 * Validate attachment storage configuration
 */
export function validateAttachmentConfig(config: AttachmentStorageConfig): void {
  if (!config.baseDir) {
    throw new Error('Attachment storage baseDir is required');
  }

  if (!['flat', 'by-page', 'by-type'].includes(config.strategy)) {
    throw new Error(`Invalid attachment storage strategy: ${config.strategy}`);
  }

  if (config.maxFilenameLength && config.maxFilenameLength < 10) {
    throw new Error('maxFilenameLength must be at least 10 characters');
  }
}
