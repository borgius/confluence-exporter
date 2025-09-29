import type { AttachmentReference } from './markdownTransformer.js';
import type { Attachment } from '../models/entities.js';

export interface AttachmentMap {
  [attachmentId: string]: string; // attachmentId -> relative path to downloaded file
}

export interface AttachmentRewriteResult {
  content: string;
  unresolvedAttachments: AttachmentReference[];
}

export class AttachmentRewriter {
  private attachmentMap: AttachmentMap;

  constructor(attachmentMap: AttachmentMap) {
    this.attachmentMap = attachmentMap;
  }

  /**
   * Rewrite attachment references in markdown content
   */
  rewriteAttachments(
    content: string,
    attachments: AttachmentReference[],
    sourcePagePath: string
  ): AttachmentRewriteResult {
    let result = content;
    const unresolvedAttachments: AttachmentReference[] = [];

    for (const attachment of attachments) {
      const rewriteResult = this.rewriteAttachment(attachment, sourcePagePath);
      
      if (rewriteResult.newPath) {
        // Replace in content - look for image references with this filename
        const pattern = new RegExp(
          `!\\[([^\\]]*)\\]\\(${this.escapeRegExp(attachment.fileName)}\\)`,
          'g'
        );
        result = result.replace(pattern, `![$1](${rewriteResult.newPath})`);
      } else {
        // Attachment not found or not downloaded
        unresolvedAttachments.push(attachment);
      }
    }

    return {
      content: result,
      unresolvedAttachments
    };
  }

  private rewriteAttachment(
    attachment: AttachmentReference,
    sourcePagePath: string
  ): { newPath?: string } {
    // Find attachment by filename if we don't have the ID
    let attachmentPath: string | undefined;

    if (attachment.attachmentId) {
      attachmentPath = this.attachmentMap[attachment.attachmentId];
    } else {
      // Search by filename (less reliable but sometimes necessary)
      attachmentPath = this.findAttachmentByFilename(attachment.fileName);
    }

    if (!attachmentPath) {
      return {};
    }

    // Calculate relative path from source page to attachment
    const relativePath = this.calculateRelativePath(sourcePagePath, attachmentPath);
    
    return { newPath: relativePath };
  }

  private findAttachmentByFilename(fileName: string): string | undefined {
    // Look for attachment by filename (case-insensitive)
    const normalizedFileName = fileName.toLowerCase();
    
    for (const [_id, path] of Object.entries(this.attachmentMap)) {
      const attachmentFileName = path.split('/').pop()?.toLowerCase();
      if (attachmentFileName === normalizedFileName) {
        return path;
      }
    }
    
    return undefined;
  }

  private calculateRelativePath(sourcePagePath: string, attachmentPath: string): string {
    const sourceDir = this.getDirectoryPath(sourcePagePath);
    return this.getRelativePath(sourceDir, attachmentPath);
  }

  private getDirectoryPath(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash === -1 ? '' : filePath.substring(0, lastSlash);
  }

  private getRelativePath(fromDir: string, toFile: string): string {
    if (!fromDir) {
      return toFile;
    }

    const fromParts = fromDir.split('/').filter(p => p);
    const toParts = toFile.split('/').filter(p => p);

    // Find common base
    let commonLength = 0;
    for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
      if (fromParts[i] === toParts[i]) {
        commonLength++;
      } else {
        break;
      }
    }

    // Calculate relative path
    const upSteps = fromParts.length - commonLength;
    const downParts = toParts.slice(commonLength);

    const relativeParts = Array(upSteps).fill('..').concat(downParts);
    return relativeParts.join('/') || './';
  }

  private escapeRegExp(string: string): string {
    // Escape special regex characters
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Build an attachment map from a list of attachments
   */
  static buildAttachmentMap(attachments: Attachment[]): AttachmentMap {
    const attachmentMap: AttachmentMap = {};
    
    for (const attachment of attachments) {
      if (attachment.localPath) {
        attachmentMap[attachment.id] = attachment.localPath;
      }
    }
    
    return attachmentMap;
  }

  /**
   * Extract attachment IDs from attachment references that contain the original source
   */
  static extractAttachmentIds(
    attachmentRefs: AttachmentReference[],
    pageAttachments: Attachment[]
  ): AttachmentReference[] {
    return attachmentRefs.map(ref => {
      if (ref.attachmentId) {
        return ref; // Already has ID
      }

      // Find matching attachment by filename
      const matchingAttachment = pageAttachments.find(att => 
        att.fileName.toLowerCase() === ref.fileName.toLowerCase()
      );

      if (matchingAttachment) {
        return {
          ...ref,
          attachmentId: matchingAttachment.id
        };
      }

      return ref; // No match found
    });
  }
}
