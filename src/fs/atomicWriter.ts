import { writeFile, mkdir, rename, unlink } from 'fs/promises';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import { logger } from '../util/logger.js';

export interface AtomicWriteOptions {
  encoding?: BufferEncoding;
  mode?: number;
  ensureDir?: boolean;
}

/**
 * Atomically write content to a file using a temporary file and rename
 */
export async function atomicWriteFile(
  filePath: string,
  content: string | Buffer,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const {
    encoding = 'utf8',
    mode,
    ensureDir = true
  } = options;

  // Generate temporary file path
  const tempPath = generateTempPath(filePath);

  try {
    // Ensure directory exists if requested
    if (ensureDir) {
      await ensureDirectory(dirname(filePath));
    }

    // Write to temporary file
    if (typeof content === 'string') {
      await writeFile(tempPath, content, { encoding, mode });
    } else {
      await writeFile(tempPath, content, { mode });
    }

    // Atomically move to final location
    await rename(tempPath, filePath);

    logger.debug('Atomic write completed', {
      path: filePath,
      size: content.length,
      tempPath
    });

  } catch (error) {
    // Clean up temporary file on error
    try {
      await unlink(tempPath);
    } catch (cleanupError) {
      logger.warn('Failed to cleanup temp file', {
        tempPath,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      });
    }

    logger.error('Atomic write failed', {
      path: filePath,
      tempPath,
      error: error instanceof Error ? error.message : String(error)
    });

    throw error;
  }
}

/**
 * Atomically write JSON data to a file
 */
export async function atomicWriteJson(
  filePath: string,
  data: unknown,
  options: Omit<AtomicWriteOptions, 'encoding'> = {}
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  await atomicWriteFile(filePath, content, {
    ...options,
    encoding: 'utf8'
  });
}

function generateTempPath(filePath: string): string {
  const dir = dirname(filePath);
  const randomSuffix = randomBytes(8).toString('hex');
  const tempName = `.tmp-${randomSuffix}`;
  return `${dir}/${tempName}`;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
    if (error instanceof Error && 'code' in error && error.code !== 'EEXIST') {
      throw error;
    }
  }
}
