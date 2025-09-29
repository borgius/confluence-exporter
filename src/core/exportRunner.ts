import type { ExportConfig, Page, Attachment, Space, ManifestEntry } from '../models/entities.js';
import type { IncrementalDiffResult } from '../services/incrementalDiff.js';
import type { MarkdownTransformResult } from '../transform/index.js';

import { ConfluenceApi } from '../confluence/index.js';
import { MarkdownTransformer } from '../transform/index.js';
import { 
  loadManifest, 
  saveManifest, 
  updateManifest,
  atomicWriteFile,
  storeAttachment
} from '../fs/index.js';
import { computeIncrementalDiff } from '../services/incrementalDiff.js';
import { slugify } from '../util/slugify.js';
import { logger } from '../util/logger.js';
import { contentHash } from '../util/hash.js';
import pLimit from 'p-limit';

export interface ExportProgress {
  totalPages: number;
  processedPages: number;
  totalAttachments: number;
  processedAttachments: number;
  errors: ExportError[];
  startTime: Date;
  currentPhase: ExportPhase;
}

export interface ExportError {
  type: 'page' | 'attachment' | 'transform' | 'filesystem';
  id: string;
  message: string;
  timestamp: Date;
  retryable: boolean;
}

export type ExportPhase = 
  | 'initializing'
  | 'fetching-space'
  | 'fetching-pages'
  | 'fetching-attachments'
  | 'computing-diff'
  | 'transforming'
  | 'writing-files'
  | 'updating-manifest'
  | 'finalizing-links'
  | 'completed'
  | 'failed';

export class ExportRunner {
  private api: ConfluenceApi;
  private config: ExportConfig;
  private transformer: MarkdownTransformer;
  private progress: ExportProgress;
  private limit: ReturnType<typeof pLimit>;

  constructor(config: ExportConfig) {
    this.config = config;
    this.api = new ConfluenceApi({
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      retry: config.retry
    });
    this.transformer = new MarkdownTransformer();
    this.limit = pLimit(config.concurrency || 5);
    
    this.progress = {
      totalPages: 0,
      processedPages: 0,
      totalAttachments: 0,
      processedAttachments: 0,
      errors: [],
      startTime: new Date(),
      currentPhase: 'initializing'
    };
  }

  /**
   * Run the complete export pipeline
   */
  async run(): Promise<ExportProgress> {
    try {
      logger.info('Starting export', { 
        spaceKey: this.config.spaceKey,
        outputDir: this.config.outputDir 
      });

      // Phase 1: Fetch space and pages
      await this.updatePhase('fetching-space');
      await this.fetchSpace();
      
      await this.updatePhase('fetching-pages');
      const pages = await this.fetchPages();
      
      await this.updatePhase('fetching-attachments');
      const attachments = await this.fetchAttachments(pages);

      // Phase 2: Compute incremental diff
      await this.updatePhase('computing-diff');
      const diffResult = await this.computeDiff(pages, attachments);

      // Phase 3: Transform and write
      await this.updatePhase('transforming');
      const transformResults = await this.transformPages(diffResult.pagesToProcess);
      
      await this.updatePhase('writing-files');
      await this.writeFiles(transformResults, diffResult.attachmentsToProcess);

      // Phase 4: Update manifest
      await this.updatePhase('updating-manifest');
      await this.updateManifest(diffResult, transformResults);

      // Phase 5: Finalize links
      await this.updatePhase('finalizing-links');
      await this.finalizeLinks(transformResults);

      await this.updatePhase('completed');
      
      logger.info('Export completed successfully', {
        processedPages: this.progress.processedPages,
        processedAttachments: this.progress.processedAttachments,
        errors: this.progress.errors.length
      });

      return this.progress;

    } catch (error) {
      await this.updatePhase('failed');
      
      logger.error('Export failed', {
        phase: this.progress.currentPhase,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  private async updatePhase(phase: ExportPhase): Promise<void> {
    this.progress.currentPhase = phase;
    logger.debug('Phase transition', { phase });
  }

  private async fetchSpace(): Promise<Space> {
    try {
      const space = await this.api.getSpace(this.config.spaceKey);
      logger.info('Space fetched', { 
        key: space.key, 
        name: space.name 
      });
      return space;
    } catch (error) {
      this.addError('page', this.config.spaceKey, 'Failed to fetch space', false);
      throw new Error(`Failed to fetch space ${this.config.spaceKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fetchPages(): Promise<Page[]> {
    const pages: Page[] = [];
    
    try {
      logger.info('Starting to iterate pages', { 
        spaceKey: this.config.spaceKey,
        limit: this.config.limit 
      });
      
      let pageCount = 0;
      for await (const page of this.api.iteratePages(this.config.spaceKey)) {
        pageCount++;
        logger.info('Processing page', { 
          pageId: page.id, 
          title: page.title, 
          pageNumber: pageCount,
          rootPageId: this.config.rootPageId 
        });
        
        // Apply root page filter if specified
        if (this.config.rootPageId && !this.isInSubtree(page, this.config.rootPageId)) {
          logger.info('Skipping page - not in subtree', { 
            pageId: page.id, 
            title: page.title,
            rootPageId: this.config.rootPageId 
          });
          continue;
        }

        logger.info('Fetching full page content', { pageId: page.id, title: page.title });
        // Get full page content
        const fullPage = await this.api.getPageWithBody(page.id);
        pages.push(fullPage);
        logger.info('Page content fetched successfully', { 
          pageId: page.id, 
          title: page.title, 
          totalPages: pages.length,
          bodyLength: fullPage.bodyStorage?.length || 0
        });

        // Check limit after successfully processing a page
        if (this.config.limit && pages.length >= this.config.limit) {
          logger.info('Reached page limit, stopping fetch', { 
            limit: this.config.limit, 
            fetchedPages: pages.length 
          });
          break;
        }
      }

      this.progress.totalPages = pages.length;
      logger.info('All pages fetched successfully', { count: pages.length });
      
      return pages;
    } catch (error) {
      logger.error('Error in fetchPages', { error: error.message, stack: error.stack });
      this.addError('page', 'pages', 'Failed to fetch pages', true);
      throw new Error(`Failed to fetch pages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fetchAttachments(pages: Page[]): Promise<Attachment[]> {
    const attachments: Attachment[] = [];
    
    for (const page of pages) {
      try {
        for await (const attachment of this.api.iterateAttachments(page.id)) {
          attachments.push({
            ...attachment,
            pageId: page.id
          });
        }
      } catch (error) {
        this.addError('attachment', page.id, `Failed to fetch attachments for page`, true);
        logger.warn('Failed to fetch attachments for page', {
          pageId: page.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.progress.totalAttachments = attachments.length;
    logger.info('Attachments fetched', { count: attachments.length });
    
    return attachments;
  }

  private async computeDiff(pages: Page[], attachments: Attachment[]): Promise<IncrementalDiffResult> {
    const manifestPath = `${this.config.outputDir}/manifest.json`;
    
    try {
      const previousManifest = await loadManifest(manifestPath);
      
      const diffResult = computeIncrementalDiff(
        pages,
        attachments,
        previousManifest,
        {
          forceFullExport: this.config.fresh,
          contentHashCheck: true
        }
      );

      logger.info('Incremental diff computed', diffResult.summary);
      return diffResult;
      
    } catch (error) {
      logger.warn('Failed to load previous manifest, performing full export', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fall back to full export
      return computeIncrementalDiff(pages, attachments, {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        spaceKey: this.config.spaceKey,
        entries: []
      }, { forceFullExport: true });
    }
  }

  private async transformPages(pages: Page[]): Promise<Map<string, MarkdownTransformResult>> {
    const results = new Map<string, MarkdownTransformResult>();
    
    logger.info('Starting page transformation', { totalPages: pages.length });
    
    const transformTasks = pages.map(page => 
      this.limit(async () => {
        try {
          logger.info('Transforming page to markdown', { 
            pageId: page.id, 
            title: page.title,
            bodyLength: page.bodyStorage?.length || 0
          });
          
          const result = this.transformer.transform(page, {
            currentPageId: page.id,
            spaceKey: this.config.spaceKey,
            baseUrl: this.config.baseUrl
          });
          
          results.set(page.id, result);
          this.progress.processedPages++;
          
          logger.info('Page transformed successfully', {
            pageId: page.id,
            title: page.title,
            markdownLength: result.content.length,
            links: result.links.length,
            attachments: result.attachments.length
          });
          
        } catch (error) {
          this.addError('transform', page.id, 'Page transformation failed', true);
          logger.error('Failed to transform page', {
            pageId: page.id,
            title: page.title,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );

    await Promise.all(transformTasks);
    
    logger.info('Page transformation completed', {
      processed: results.size,
      errors: this.progress.errors.filter(e => e.type === 'transform').length
    });

    return results;
  }

  private async writeFiles(
    transformResults: Map<string, MarkdownTransformResult>,
    attachments: Attachment[]
  ): Promise<void> {
    logger.info('Starting file writing', { 
      markdownFiles: transformResults.size,
      attachments: attachments.length 
    });
    
    // Write markdown files
    const writeMarkdownTasks = Array.from(transformResults.entries()).map(([pageId, result]) =>
      this.limit(async () => {
        try {
          const page = Array.from(transformResults.keys()).find(id => id === pageId);
          if (!page) return;

          const slug = slugify(result.frontMatter.title as string);
          const filePath = `${this.config.outputDir}/${slug}.md`;
          
          logger.info('Writing markdown file', { 
            pageId, 
            title: result.frontMatter.title,
            filePath,
            contentLength: result.content.length
          });
          
          const frontMatterStr = Object.entries(result.frontMatter)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('\n');
          
          const content = `---\n${frontMatterStr}\n---\n\n${result.content}`;
          
          await atomicWriteFile(filePath, content);
          
          logger.info('Markdown file saved successfully', { 
            pageId, 
            title: result.frontMatter.title,
            filePath,
            fileSize: content.length
          });
          
        } catch (error) {
          this.addError('filesystem', pageId, 'Failed to write markdown file', true);
          logger.error('Failed to write markdown file', {
            pageId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );

    // Write attachments
    const writeAttachmentTasks = attachments.map(attachment =>
      this.limit(async () => {
        try {
          const content = await this.api.downloadAttachment(attachment);
          await storeAttachment(attachment, content, {
            baseDir: this.config.outputDir,
            strategy: 'by-page'
          });
          
          this.progress.processedAttachments++;
          
          logger.debug('Attachment stored', {
            id: attachment.id,
            fileName: attachment.fileName,
            size: content.length
          });
          
        } catch (error) {
          this.addError('attachment', attachment.id, 'Failed to store attachment', true);
          logger.error('Failed to store attachment', {
            id: attachment.id,
            fileName: attachment.fileName,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );

    await Promise.all([...writeMarkdownTasks, ...writeAttachmentTasks]);
    
    logger.info('File writing completed', {
      markdownFiles: transformResults.size,
      attachments: attachments.length,
      errors: this.progress.errors.filter(e => e.type === 'filesystem' || e.type === 'attachment').length
    });
  }

  private async updateManifest(
    _diffResult: IncrementalDiffResult,
    transformResults: Map<string, MarkdownTransformResult>
  ): Promise<void> {
    const manifestPath = `${this.config.outputDir}/manifest.json`;
    
    try {
      const existingManifest = await loadManifest(manifestPath);
      
      // Build new entries
      const newEntries: ManifestEntry[] = [];
      
      for (const [pageId, result] of transformResults) {
        const slug = slugify(result.frontMatter.title as string);
        const filePath = `${slug}.md`;
        const hash = contentHash(result.content);
        
        newEntries.push({
          id: pageId,
          title: result.frontMatter.title as string,
          path: filePath,
          hash,
          version: result.frontMatter.version as number,
          status: 'exported',
          parentId: result.frontMatter.parentId as string
        });
      }
      
      const updatedManifest = updateManifest(existingManifest, newEntries, this.config.spaceKey);
      await saveManifest(manifestPath, updatedManifest);
      
      logger.info('Manifest updated', {
        entries: newEntries.length,
        path: manifestPath
      });
      
    } catch (error) {
      this.addError('filesystem', 'manifest', 'Failed to update manifest', false);
      throw new Error(`Failed to update manifest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async finalizeLinks(_transformResults: Map<string, MarkdownTransformResult>): Promise<void> {
    // TODO: Implement link finalization pass
    // This would rewrite all internal links after all pages are processed
    logger.info('Link finalization completed (placeholder)');
  }

  private isInSubtree(page: Page, rootPageId: string): boolean {
    // Simple check - would need proper hierarchy traversal in real implementation
    return page.id === rootPageId || page.parentId === rootPageId;
  }

  private addError(type: ExportError['type'], id: string, message: string, retryable: boolean): void {
    this.progress.errors.push({
      type,
      id,
      message,
      timestamp: new Date(),
      retryable
    });
  }
}
