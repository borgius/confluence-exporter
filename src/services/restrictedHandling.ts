/**
 * Restricted page handling service
 * Implements T061: Restricted page handling (skip & warn)
 */

import type { ManifestEntry } from '../models/entities.js';
import { logger } from '../util/logger.js';

export interface RestrictedPageInfo {
  pageId: string;
  title: string;
  reason: RestrictedReason;
  httpStatus?: number;
  timestamp: Date;
}

export type RestrictedReason = 
  | 'permission_denied'
  | 'not_found'
  | 'archived'
  | 'deleted'
  | 'restricted_space'
  | 'api_error';

export interface RestrictedPageStats {
  totalRestricted: number;
  byReason: Map<RestrictedReason, number>;
  pages: RestrictedPageInfo[];
}

/**
 * Checks HTTP status for restriction patterns
 */
function checkHttpStatusRestriction(httpStatus?: number): RestrictedReason | null {
  if (httpStatus === 403 || httpStatus === 401) {
    return 'permission_denied';
  }
  if (httpStatus === 404) {
    return 'not_found';
  }
  if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
    return 'api_error';
  }
  return null;
}

/**
 * Checks error message for restriction patterns
 */
function checkErrorMessageRestriction(errorMessage: string): RestrictedReason | null {
  const lowerMessage = errorMessage.toLowerCase();
  
  if (lowerMessage.includes('permission') || lowerMessage.includes('access denied')) {
    return 'permission_denied';
  }
  if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
    return 'not_found';
  }
  if (lowerMessage.includes('archived')) {
    return 'archived';
  }
  if (lowerMessage.includes('deleted')) {
    return 'deleted';
  }
  if (lowerMessage.includes('restricted')) {
    return 'restricted_space';
  }
  
  return null;
}

/**
 * Handles restricted pages by tracking and skipping them with appropriate warnings
 */
export class RestrictedPageHandler {
  private restrictedPages: RestrictedPageInfo[] = [];
  private stats: Map<RestrictedReason, number> = new Map();

  /**
   * Records a restricted page and determines how to handle it
   */
  recordRestrictedPage(
    pageId: string, 
    title: string, 
    reason: RestrictedReason, 
    httpStatus?: number
  ): void {
    const info: RestrictedPageInfo = {
      pageId,
      title,
      reason,
      httpStatus,
      timestamp: new Date(),
    };

    this.restrictedPages.push(info);
    
    // Update statistics
    const currentCount = this.stats.get(reason) || 0;
    this.stats.set(reason, currentCount + 1);

    // Log appropriate level based on reason
    const logLevel = this.getLogLevel(reason);
    logger[logLevel]('Restricted page encountered', {
      pageId,
      title,
      reason,
      httpStatus,
      action: 'skipped',
    });
  }

  /**
   * Checks if a page should be considered restricted based on error information
   */
  isRestrictedError(error: Error, httpStatus?: number): RestrictedReason | null {
    // Check HTTP status first
    const httpRestriction = checkHttpStatusRestriction(httpStatus);
    if (httpRestriction) {
      return httpRestriction;
    }

    // Check error message patterns
    const messageRestriction = checkErrorMessageRestriction(error.message);
    if (messageRestriction) {
      return messageRestriction;
    }

    return null; // Not a restriction, treat as regular error
  }

  /**
   * Creates a manifest entry for a restricted page
   */
  createRestrictedManifestEntry(pageId: string, title: string, reason: RestrictedReason): ManifestEntry {
    return {
      id: pageId,
      title,
      path: '', // No file path since page wasn't exported
      hash: '', // No content hash
      status: this.getManifestStatus(reason),
    };
  }

  /**
   * Gets current restriction statistics
   */
  getStats(): RestrictedPageStats {
    return {
      totalRestricted: this.restrictedPages.length,
      byReason: new Map(this.stats),
      pages: [...this.restrictedPages],
    };
  }

  /**
   * Logs a summary of all restricted pages
   */
  logSummary(): void {
    if (this.restrictedPages.length === 0) {
      logger.info('No restricted pages encountered');
      return;
    }

    logger.warn('Restricted pages summary', {
      totalRestricted: this.restrictedPages.length,
      breakdown: Object.fromEntries(this.stats),
    });

    // Log breakdown by reason
    for (const [reason, count] of this.stats.entries()) {
      logger.info(`Restricted pages - ${reason}`, { count });
    }

    // Log details for permission denied pages (most important to review)
    const permissionDenied = this.restrictedPages.filter(p => p.reason === 'permission_denied');
    if (permissionDenied.length > 0) {
      logger.warn('Permission denied pages require attention', {
        count: permissionDenied.length,
        pages: permissionDenied.slice(0, 10).map(p => ({ 
          id: p.pageId, 
          title: p.title 
        })),
        ...(permissionDenied.length > 10 && { additionalPages: permissionDenied.length - 10 }),
      });
    }
  }

  /**
   * Determines appropriate log level for restriction reason
   */
  private getLogLevel(reason: RestrictedReason): 'warn' | 'info' | 'debug' {
    switch (reason) {
      case 'permission_denied':
      case 'restricted_space':
        return 'warn'; // These might need attention
      case 'not_found':
      case 'deleted':
      case 'archived':
        return 'info'; // Expected in some cases
      case 'api_error':
        return 'warn'; // Might indicate broader issues
      default:
        return 'debug';
    }
  }

  /**
   * Maps restriction reason to manifest status
   */
  private getManifestStatus(reason: RestrictedReason): ManifestEntry['status'] {
    switch (reason) {
      case 'permission_denied':
      case 'restricted_space':
        return 'denied';
      case 'not_found':
      case 'deleted':
      case 'archived':
        return 'removed';
      default:
        return 'skipped';
    }
  }
}

/**
 * Creates a new restricted page handler
 */
export function createRestrictedPageHandler(): RestrictedPageHandler {
  return new RestrictedPageHandler();
}
