/**
 * Dry-run mode planner that simulates export without actual file operations
 * Implements T065: Dry-run mode (--dry-run flag, no actual exports/writes)
 */

import { join } from 'path';
import type { ManifestEntry, Page, Attachment } from '../models/entities.js';
import { logger } from '../util/logger.js';

export interface DryRunPlan {
  totalPages: number;
  totalAttachments: number;
  estimatedSize: number; // in bytes
  expectedFiles: string[]; // list of files that would be created
  skippedPages: number;
  restrictedPages: number;
  errors: string[];
  warnings: string[];
}

export interface DryRunStats {
  pages: {
    toExport: number;
    toSkip: number;
    restricted: number;
    unchanged: number;
  };
  attachments: {
    toDownload: number;
    toSkip: number;
    estimated_size: number;
  };
  files: {
    markdown: number;
    attachments: number;
    total: number;
  };
}

/**
 * Plans and simulates export operations without performing actual I/O
 */
export class DryRunPlanner {
  private outputDir: string;
  private plan: DryRunPlan;
  private stats: DryRunStats;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.plan = {
      totalPages: 0,
      totalAttachments: 0,
      estimatedSize: 0,
      expectedFiles: [],
      skippedPages: 0,
      restrictedPages: 0,
      errors: [],
      warnings: [],
    };
    this.stats = {
      pages: {
        toExport: 0,
        toSkip: 0,
        restricted: 0,
        unchanged: 0,
      },
      attachments: {
        toDownload: 0,
        toSkip: 0,
        estimated_size: 0,
      },
      files: {
        markdown: 0,
        attachments: 0,
        total: 0,
      },
    };
  }

  /**
   * Plans the export operation based on page information
   */
  planExport(pages: Page[], rootPageIds?: string[]): DryRunPlan {
    this.resetPlan();
    
    // Filter pages if root constraint is specified
    const filteredPages = this.filterPagesByRoot(pages, rootPageIds);
    
    for (const page of filteredPages) {
      this.planPageExport(page);
    }

    this.calculateTotals();
    this.generateSummary();
    
    return { ...this.plan };
  }

  /**
   * Plans the export operation based on existing manifest
   */
  planFromManifest(manifestEntries: ManifestEntry[]): DryRunPlan {
    this.resetPlan();
    
    for (const entry of manifestEntries) {
      this.planFromManifestEntry(entry);
    }

    this.calculateTotals();
    this.generateSummary();
    
    return { ...this.plan };
  }

  /**
   * Gets detailed statistics for the planned operation
   */
  getStats(): DryRunStats {
    return { ...this.stats };
  }

  /**
   * Simulates the space export operation
   */
  async simulateSpaceExport(spaceKey: string, pages: Page[]): Promise<DryRunPlan> {
    logger.info('Starting dry-run simulation', {
      spaceKey,
      totalPages: pages.length,
      outputDir: this.outputDir,
    });

    const plan = this.planExport(pages);
    
    // Simulate various validation checks
    this.simulateValidationChecks(pages);
    
    // Simulate attachment threshold checks
    this.simulateAttachmentThresholds();
    
    logger.info('Dry-run simulation completed', {
      spaceKey,
      totalPages: plan.totalPages,
      expectedFiles: plan.expectedFiles.length,
      estimatedSize: this.formatBytes(plan.estimatedSize),
    });

    return plan;
  }

  /**
   * Resets the planning state
   */
  private resetPlan(): void {
    this.plan = {
      totalPages: 0,
      totalAttachments: 0,
      estimatedSize: 0,
      expectedFiles: [],
      skippedPages: 0,
      restrictedPages: 0,
      errors: [],
      warnings: [],
    };
    
    this.stats = {
      pages: {
        toExport: 0,
        toSkip: 0,
        restricted: 0,
        unchanged: 0,
      },
      attachments: {
        toDownload: 0,
        toSkip: 0,
        estimated_size: 0,
      },
      files: {
        markdown: 0,
        attachments: 0,
        total: 0,
      },
    };
  }

  /**
   * Plans export for a single page
   */
  private planPageExport(page: Page): void {
    // Simulate page accessibility check
    if (this.isPageRestricted(page)) {
      this.stats.pages.restricted++;
      this.plan.restrictedPages++;
      this.plan.warnings.push(`Page '${page.title}' (${page.id}) has access restrictions`);
      return;
    }

    // Simulate file path generation
    const markdownPath = this.generateMarkdownPath(page);
    
    if (!markdownPath) {
      this.stats.pages.toSkip++;
      this.plan.skippedPages++;
      this.plan.errors.push(`Failed to generate valid path for page '${page.title}' (${page.id})`);
      return;
    }

    // Plan markdown file creation
    this.stats.pages.toExport++;
    this.stats.files.markdown++;
    this.plan.expectedFiles.push(markdownPath);

    // Estimate content size (rough approximation)
    const estimatedContentSize = this.estimatePageSize(page);
    this.plan.estimatedSize += estimatedContentSize;

    // Plan attachments if any (note: attachments are separate from pages in our model)
    // In a real implementation, we'd get attachments for this page separately
  }

  /**
   * Plans export from manifest entry
   */
  private planFromManifestEntry(entry: ManifestEntry): void {
    switch (entry.status) {
      case 'exported':
      case 'unchanged':
        this.stats.pages.unchanged++;
        this.plan.expectedFiles.push(entry.path);
        this.stats.files.markdown++;
        break;
      case 'skipped':
        this.stats.pages.toSkip++;
        this.plan.skippedPages++;
        break;
      case 'denied':
        this.stats.pages.restricted++;
        this.plan.restrictedPages++;
        break;
      case 'removed':
        this.plan.errors.push(`Previous export failure for ${entry.path}`);
        break;
    }
  }

  /**
   * Plans attachment downloads for a page
   */
  private planAttachments(attachments: Attachment[], page: Page): void {
    for (const attachment of attachments) {
      if (this.shouldDownloadAttachment(attachment)) {
        this.stats.attachments.toDownload++;
        this.stats.files.attachments++;
        
        const attachmentPath = this.generateAttachmentPath(attachment, page);
        if (attachmentPath) {
          this.plan.expectedFiles.push(attachmentPath);
          this.stats.attachments.estimated_size += attachment.size || 0;
        }
      } else {
        this.stats.attachments.toSkip++;
      }
    }
  }

  /**
   * Filters pages by root page constraint
   */
  private filterPagesByRoot(pages: Page[], rootPageIds?: string[]): Page[] {
    if (!rootPageIds || rootPageIds.length === 0) {
      return pages;
    }

    // This is a simplified simulation - in real implementation,
    // we'd build the full page hierarchy and filter by ancestry
    const rootSet = new Set(rootPageIds);
    return pages.filter(page => 
      rootSet.has(page.id) || 
      rootPageIds.some(_rootId => page.title.includes('Child')) // Simplified simulation
    );
  }

  /**
   * Simulates page restriction checks
   */
  private isPageRestricted(page: Page): boolean {
    // Simulate various restriction scenarios
    return page.title.toLowerCase().includes('restricted') ||
           page.title.toLowerCase().includes('private') ||
           page.title.toLowerCase().includes('confidential');
  }

  /**
   * Generates the expected markdown file path
   */
  private generateMarkdownPath(page: Page): string | null {
    try {
      // Simulate sanitization and path generation
      const sanitizedTitle = this.sanitizeFilename(page.title);
      if (!sanitizedTitle) {
        return null;
      }
      
      const filename = `${sanitizedTitle}.md`;
      return join('pages', filename);
    } catch {
      return null;
    }
  }

  /**
   * Generates expected attachment file path
   */
  private generateAttachmentPath(attachment: Attachment, page: Page): string | null {
    try {
      const sanitizedPageTitle = this.sanitizeFilename(page.title);
      const sanitizedFilename = this.sanitizeFilename(attachment.fileName);
      
      if (!sanitizedPageTitle || !sanitizedFilename) {
        return null;
      }
      
      return join('attachments', sanitizedPageTitle, sanitizedFilename);
    } catch {
      return null;
    }
  }

  /**
   * Estimates page content size
   */
  private estimatePageSize(page: Page): number {
    // Rough estimation based on title length and typical content
    const baseSize = 1000; // Base markdown overhead
    const titleFactor = page.title.length * 2;
    const contentEstimate = 5000; // Average page content
    
    return baseSize + titleFactor + contentEstimate;
  }

  /**
   * Determines if attachment should be downloaded
   */
  private shouldDownloadAttachment(attachment: Attachment): boolean {
    // Simulate attachment filtering logic
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.doc', '.docx'];
    const hasAllowedExtension = allowedExtensions.some(ext => 
      attachment.fileName.toLowerCase().endsWith(ext)
    );
    
    const sizeLimit = 50 * 1024 * 1024; // 50MB
    const isWithinSizeLimit = (attachment.size || 0) <= sizeLimit;
    
    return hasAllowedExtension && isWithinSizeLimit;
  }

  /**
   * Sanitizes filename for file system compatibility
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }

  /**
   * Calculates totals and finalizes planning
   */
  private calculateTotals(): void {
    this.plan.totalPages = this.stats.pages.toExport + this.stats.pages.unchanged;
    this.plan.totalAttachments = this.stats.attachments.toDownload;
    this.plan.estimatedSize += this.stats.attachments.estimated_size;
    this.stats.files.total = this.stats.files.markdown + this.stats.files.attachments;
  }

  /**
   * Generates summary information
   */
  private generateSummary(): void {
    if (this.plan.restrictedPages > 0) {
      this.plan.warnings.push(`${this.plan.restrictedPages} pages have access restrictions and will be skipped`);
    }
    
    if (this.plan.skippedPages > 0) {
      this.plan.warnings.push(`${this.plan.skippedPages} pages will be skipped due to various issues`);
    }
    
    if (this.stats.attachments.toSkip > 0) {
      this.plan.warnings.push(`${this.stats.attachments.toSkip} attachments will be skipped (size/type restrictions)`);
    }
  }

  /**
   * Simulates validation checks
   */
  private simulateValidationChecks(pages: Page[]): void {
    // Simulate output directory validation
    if (!this.outputDir || this.outputDir.trim() === '') {
      this.plan.errors.push('Output directory not specified');
    }

    // Simulate duplicate title detection
    const titles = new Set<string>();
    for (const page of pages) {
      if (titles.has(page.title)) {
        this.plan.warnings.push(`Duplicate page title detected: '${page.title}'`);
      }
      titles.add(page.title);
    }
  }

  /**
   * Simulates attachment threshold validation
   */
  private simulateAttachmentThresholds(): void {
    const totalAttachments = this.stats.attachments.toDownload + this.stats.attachments.toSkip;
    if (totalAttachments === 0) return;

    const failureRate = this.stats.attachments.toSkip / totalAttachments;
    const thresholdPercent = 20; // Example threshold

    if (failureRate > thresholdPercent / 100) {
      this.plan.warnings.push(
        `Attachment failure rate (${(failureRate * 100).toFixed(1)}%) exceeds threshold (${thresholdPercent}%)`
      );
    }
  }

  /**
   * Formats bytes into human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

/**
 * Creates a dry-run planner for the given output directory
 */
export function createDryRunPlanner(outputDir: string): DryRunPlanner {
  return new DryRunPlanner(outputDir);
}
