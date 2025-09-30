import type { ExportConfig, Page, Attachment, Space, ManifestEntry } from '../models/entities.js';
import type { IncrementalDiffResult } from '../services/incrementalDiff.js';
import type { MarkdownTransformResult, TransformContext } from '../transform/index.js';

import { ConfluenceApi } from '../confluence/index.js';
import { EnhancedMarkdownTransformer } from '../transform/enhancedMarkdownTransformer.js';
import { MarkdownTransformer } from '../transform/markdownTransformer.js';
import { MarkdownCleanupService } from '../cleanup/cleanupService.js';
import { type DownloadQueueOrchestrator, createStandardQueue } from '../queue/index.js';
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
  | 'initializing-queue'
  | 'processing-queue'
  | 'transforming'
  | 'writing-files'
  | 'updating-manifest'
  | 'finalizing-links'
  | 'post-processing-cleanup'
  | 'completed'
  | 'failed';

export class ExportRunner {
  private api: ConfluenceApi;
  private config: ExportConfig;
  private transformer: EnhancedMarkdownTransformer;
  private cleanupService: MarkdownCleanupService;
  private downloadQueue?: DownloadQueueOrchestrator;
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
    
    // Create async wrapper for base transformer
    const baseTransformer = new MarkdownTransformer();
    const asyncTransformer = {
      async transform(page: Page, context: TransformContext): Promise<MarkdownTransformResult> {
        return baseTransformer.transform(page, context);
      }
    };
    
    this.transformer = new EnhancedMarkdownTransformer(asyncTransformer, {
      enableCleanup: true,
      enableQueueDiscovery: true, // Enable queue discovery when using queue mode
    });
    
    // Initialize cleanup service for post-processing
    this.cleanupService = new MarkdownCleanupService();
    
    // Initialize queue if queue mode is enabled
    const configWithQueue = this.config as ExportConfig & { enableQueue?: boolean };
    if (configWithQueue.enableQueue) {
      this.downloadQueue = createStandardQueue(this.config.spaceKey, this.config.outputDir);
    }
    
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
        outputDir: this.config.outputDir,
        queueMode: !!this.downloadQueue
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

      // Decide between queue-based and traditional processing
      if (this.downloadQueue) {
        await this.runQueueBasedProcessing(diffResult);
      } else {
        await this.runTraditionalProcessing(diffResult);
      }

      // Final phases (common to both modes)
      await this.updatePhase('completed');
      
      logger.info('Export completed successfully', {
        processedPages: this.progress.processedPages,
        processedAttachments: this.progress.processedAttachments,
        errors: this.progress.errors.length,
        queueMode: !!this.downloadQueue
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
          
          const result = await this.transformer.transform(page, {
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
            attachments: result.attachments.length,
            users: result.users.length
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
    attachments: Attachment[],
    pages: Page[]
  ): Promise<void> {
    logger.info('Starting file writing', { 
      markdownFiles: transformResults.size,
      attachments: attachments.length 
    });
    
    // Write markdown and HTML files
    const writeMarkdownTasks = Array.from(transformResults.entries()).map(([pageId, result]) =>
      this.limit(async () => {
        try {
          const page = pages.find(p => p.id === pageId);
          if (!page) return;

          const slug = slugify(result.frontMatter.title as string);
          const markdownFilePath = `${this.config.outputDir}/${slug}.md`;
          const htmlFilePath = `${this.config.outputDir}/${slug}.html`;
          
          logger.info('Writing markdown and HTML files', { 
            pageId, 
            title: result.frontMatter.title,
            markdownFilePath,
            htmlFilePath,
            contentLength: result.content.length
          });
          
          // Write markdown file
          const frontMatterStr = Object.entries(result.frontMatter)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('\n');
          
          const markdownContent = `---\n${frontMatterStr}\n---\n\n${result.content}`;
          await atomicWriteFile(markdownFilePath, markdownContent);
          
          // Write HTML file (source Confluence storage format)
          if (page.bodyStorage) {
            await atomicWriteFile(htmlFilePath, page.bodyStorage);
            logger.info('HTML file saved successfully', { 
              pageId, 
              title: result.frontMatter.title,
              htmlFilePath,
              htmlFileSize: page.bodyStorage.length
            });
          }
          
          logger.info('Markdown file saved successfully', { 
            pageId, 
            title: result.frontMatter.title,
            markdownFilePath,
            markdownFileSize: markdownContent.length
          });
          
        } catch (error) {
          this.addError('filesystem', pageId, 'Failed to write markdown/HTML files', true);
          logger.error('Failed to write markdown/HTML files', {
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

  /**
   * Performs post-processing cleanup on all exported markdown files
   */
  private async performPostProcessingCleanup(transformResults: Map<string, MarkdownTransformResult>): Promise<void> {
    // Enable cleanup by default, allow override in config
    const configWithCleanup = this.config as ExportConfig & { enableCleanup?: boolean };
    const enableCleanup = configWithCleanup.enableCleanup ?? true;
    
    if (!enableCleanup) {
      logger.info('Post-processing cleanup disabled');
      return;
    }

    logger.info('Starting post-processing cleanup', {
      totalFiles: transformResults.size,
      outputDir: this.config.outputDir
    });

    const cleanupTasks = Array.from(transformResults.entries()).map(([pageId, result]) =>
      this.limit(async () => {
        try {
          // Generate file path
          const slug = slugify(result.frontMatter.title as string);
          const markdownFilePath = `${this.config.outputDir}/${slug}.md`;
          
          // Read current file content
          const currentContent = await this.readFileContent(markdownFilePath);
          if (!currentContent) {
            logger.warn('Could not read file for cleanup', { filePath: markdownFilePath });
            return;
          }

          // Apply cleanup rules
          const cleanupResult = await this.cleanupService.process({
            content: currentContent,
            filePath: markdownFilePath,
            sourcePageId: pageId,
            metadata: {
              language: 'en',
              frontmatter: true,
              hasMath: false,
              hasCode: false,
              wordCount: currentContent.split(/\s+/).length,
              lineCount: currentContent.split('\n').length
            }
          }, {
            enabled: true,
            intensity: 'medium',
            rules: [],
            lineLength: 120,
            locale: 'en',
            preserveFormatting: false
          });

          // Write back if content changed
          if (cleanupResult.success && cleanupResult.cleanedContent !== currentContent) {
            await atomicWriteFile(markdownFilePath, cleanupResult.cleanedContent);
            logger.debug('Post-processing cleanup applied', {
              pageId,
              filePath: markdownFilePath,
              rulesApplied: cleanupResult.appliedRules.length,
              sizeChange: cleanupResult.cleanedContent.length - currentContent.length
            });
          }

        } catch (error) {
          this.addError('filesystem', pageId, 'Post-processing cleanup failed', false);
          logger.error('Failed to apply post-processing cleanup', {
            pageId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );

    await Promise.all(cleanupTasks);
    
    logger.info('Post-processing cleanup completed', {
      processedFiles: transformResults.size,
      errors: this.progress.errors.filter(e => e.message.includes('cleanup')).length
    });
  }

  /**
   * Reads file content safely
   */
  private async readFileContent(filePath: string): Promise<string | null> {
    try {
      const fs = await import('fs/promises');
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      logger.debug('Could not read file', { filePath, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Runs traditional sequential processing (legacy mode)
   */
  private async runTraditionalProcessing(diffResult: IncrementalDiffResult): Promise<void> {
    // Phase 3: Transform and write
    await this.updatePhase('transforming');
    const transformResults = await this.transformPages(diffResult.pagesToProcess);
    
    await this.updatePhase('writing-files');
    await this.writeFiles(transformResults, diffResult.attachmentsToProcess, diffResult.pagesToProcess);

    // Phase 4: Update manifest
    await this.updatePhase('updating-manifest');
    await this.updateManifest(diffResult, transformResults);

    // Phase 5: Finalize links
    await this.updatePhase('finalizing-links');
    await this.finalizeLinks(transformResults);

    // Phase 6: Post-processing cleanup
    await this.updatePhase('post-processing-cleanup');
    await this.performPostProcessingCleanup(transformResults);
  }

  /**
   * Runs queue-based processing with discovery
   */
  private async runQueueBasedProcessing(diffResult: IncrementalDiffResult): Promise<void> {
    if (!this.downloadQueue) {
      throw new Error('Queue not initialized for queue-based processing');
    }

    // Phase 3: Initialize queue
    await this.updatePhase('initializing-queue');
    await this.initializeQueue(diffResult.pagesToProcess);

    // Phase 4: Process queue with discovery
    await this.updatePhase('processing-queue');
    const allTransformResults = await this.processQueueWithDiscovery();

    // Phase 5: Write all files
    await this.updatePhase('writing-files');
    await this.writeAllFiles(allTransformResults, diffResult.attachmentsToProcess);

    // Phase 6: Update manifest
    await this.updatePhase('updating-manifest');
    await this.updateManifestFromQueue(allTransformResults);

    // Phase 7: Finalize links
    await this.updatePhase('finalizing-links');
    await this.finalizeLinks(allTransformResults);

    // Phase 8: Post-processing cleanup
    await this.updatePhase('post-processing-cleanup');
    await this.performPostProcessingCleanup(allTransformResults);
  }

  /**
   * Initialize queue with initial pages
   */
  private async initializeQueue(initialPages: Page[]): Promise<void> {
    if (!this.downloadQueue) return;

    logger.info('Initializing download queue', { 
      initialPages: initialPages.length,
      spaceKey: this.config.spaceKey
    });

    // Add initial pages to queue
    for (const page of initialPages) {
      await this.downloadQueue.add({
        pageId: page.id,
        sourceType: 'initial',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      });
    }

    // Persist initial queue state
    await this.downloadQueue.persist();

    logger.info('Queue initialized', {
      queueSize: this.downloadQueue.size(),
      state: this.downloadQueue.getState()
    });
  }

  /**
   * Process queue with discovery loop
   */
  private async processQueueWithDiscovery(): Promise<Map<string, MarkdownTransformResult>> {
    if (!this.downloadQueue) {
      throw new Error('Queue not initialized');
    }

    const allResults = new Map<string, MarkdownTransformResult>();
    let discoveryPhase = 1;
    const maxDiscoveryPhases = 10; // Prevent infinite loops

    while (!this.downloadQueue.isEmpty() && discoveryPhase <= maxDiscoveryPhases) {
      logger.info(`Starting discovery phase ${discoveryPhase}`, {
        queueSize: this.downloadQueue.size(),
        processedSoFar: allResults.size
      });

      // Process current queue items
      const phaseResults = await this.processCurrentQueueItems();
      
      // Merge results
      for (const [pageId, result] of phaseResults) {
        allResults.set(pageId, result);
      }

      // Check if new items were discovered and added to queue
      const currentQueueSize = this.downloadQueue.size();
      if (currentQueueSize === 0) {
        logger.info('Queue empty, discovery complete', { 
          totalPagesProcessed: allResults.size,
          discoveryPhases: discoveryPhase
        });
        break;
      }

      logger.info(`Discovery phase ${discoveryPhase} complete`, {
        pagesProcessedInPhase: phaseResults.size,
        remainingInQueue: currentQueueSize,
        totalPagesProcessed: allResults.size
      });

      discoveryPhase++;
    }

    if (discoveryPhase > maxDiscoveryPhases) {
      logger.warn('Max discovery phases reached, stopping', {
        maxPhases: maxDiscoveryPhases,
        remainingInQueue: this.downloadQueue.size()
      });
    }

    return allResults;
  }

  /**
   * Process current items in queue
   */
  private async processCurrentQueueItems(): Promise<Map<string, MarkdownTransformResult>> {
    if (!this.downloadQueue) {
      throw new Error('Queue not initialized');
    }

    const results = new Map<string, MarkdownTransformResult>();
    const processingTasks: Promise<void>[] = [];

    // Process items concurrently
    while (!this.downloadQueue.isEmpty()) {
      const queueItem = await this.downloadQueue.next();
      if (!queueItem) break;

      const task = this.limit(async () => {
        try {
          // Fetch page if not already fetched
          const page = await this.api.getPageWithBody(queueItem.pageId);
          
          // Transform page
          const result = await this.transformer.transform(page, {
            currentPageId: page.id,
            spaceKey: this.config.spaceKey,
            baseUrl: this.config.baseUrl
          });

          // Queue discovery might have added new items to the queue
          // This happens inside the enhanced transformer

          results.set(page.id, result);
          this.progress.processedPages++;
          
          // Mark as processed in queue
          if (this.downloadQueue) {
            await this.downloadQueue.markProcessed(queueItem.pageId);
          }
          
          logger.debug('Queue item processed', {
            pageId: queueItem.pageId,
            title: page.title,
            sourceType: queueItem.sourceType
          });

        } catch (error) {
          // Mark as failed in queue
          if (this.downloadQueue) {
            await this.downloadQueue.markFailed(queueItem.pageId, error as Error);
          }
          this.addError('page', queueItem.pageId, 'Failed to process queue item', true);
          
          logger.error('Failed to process queue item', {
            pageId: queueItem.pageId,
            sourceType: queueItem.sourceType,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      processingTasks.push(task);
    }

    await Promise.all(processingTasks);
    return results;
  }

  /**
   * Write all files from queue processing
   */
  private async writeAllFiles(
    transformResults: Map<string, MarkdownTransformResult>,
    attachments: Attachment[]
  ): Promise<void> {
    // Find pages for the transform results
    const pageMap = new Map<string, Page>();
    for (const pageId of transformResults.keys()) {
      try {
        const page = await this.api.getPageWithBody(pageId);
        pageMap.set(pageId, page);
      } catch (error) {
        logger.warn('Could not fetch page for writing', { pageId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const pages = Array.from(pageMap.values());
    await this.writeFiles(transformResults, attachments, pages);
  }

  /**
   * Update manifest from queue processing results
   */
  private async updateManifestFromQueue(transformResults: Map<string, MarkdownTransformResult>): Promise<void> {
    // Create a synthetic diff result for manifest update
    const pageMap = new Map<string, Page>();
    for (const pageId of transformResults.keys()) {
      try {
        const page = await this.api.getPageWithBody(pageId);
        pageMap.set(pageId, page);
      } catch (error) {
        logger.warn('Could not fetch page for manifest', { pageId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const pages = Array.from(pageMap.values());
    const syntheticDiffResult: IncrementalDiffResult = {
      manifestDiff: { 
        added: pages.map(p => ({
          id: p.id,
          title: p.title,
          path: `${slugify(p.title)}.md`,
          hash: contentHash(p.bodyStorage || ''),
          status: 'exported' as const,
          lastModified: new Date().toISOString()
        })),
        modified: [],
        deleted: [],
        unchanged: []
      },
      pagesToProcess: pages,
      attachmentsToProcess: [],
      skippedPages: [],
      summary: {
        totalPages: pages.length,
        pagesToUpdate: pages.length,
        pagesSkipped: 0,
        totalAttachments: 0,
        attachmentsToUpdate: 0
      }
    };

    await this.updateManifest(syntheticDiffResult, transformResults);
  }
}
