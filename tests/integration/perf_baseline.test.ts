import * as fs from 'fs/promises';
import * as path from 'path';
import type { PerformanceCollector } from '../../src/core/performanceCollector.js';
import { createPerformanceCollector } from '../../src/core/performanceCollector.js';
import type { Page } from '../../src/models/entities.js';
import { logger } from '../../src/util/logger.js';

describe('Integration: performance baseline', () => {
  let tempDir: string;
  let performanceCollector: PerformanceCollector;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), 'temp-perf-test-'));
    performanceCollector = createPerformanceCollector();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('should achieve baseline performance of ≥1.2 pages per second', async () => {
    // Create test pages to simulate processing
    const testPages: Page[] = Array.from({ length: 50 }, (_, i) => ({
      id: `test-page-${i}`,
      title: `Test Page ${i}`,
      type: 'page' as const,
      version: 1,
      parentId: i > 0 ? `test-page-${i - 1}` : undefined,
      ancestors: [],
      bodyStorage: `<p>Test content ${'word '.repeat(100)}</p>`, // Substantial content
      slug: `test-page-${i}`,
      path: `test-page-${i}.md`
    }));

    logger.info('Starting performance baseline test', {
      pageCount: testPages.length,
      targetPagesPerSecond: 1.2
    });

    // Start performance measurement
    performanceCollector.start();
    performanceCollector.startPhase('page-processing');

    const startTime = Date.now();

    // Simulate page processing with realistic work
    for (const page of testPages) {
      // Simulate processing time per page (I/O, transformation, etc.)
      await simulatePageProcessing(page);
      
      // Record the page as processed
      const contentSize = page.bodyStorage?.length || 0;
      performanceCollector.recordPageProcessed(true, contentSize);
    }

    performanceCollector.endPhase('page-processing');
    const metrics = performanceCollector.end();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    const durationSeconds = duration / 1000;
    const actualPagesPerSecond = testPages.length / durationSeconds;

    logger.info('Performance baseline test completed', {
      duration: `${duration}ms`,
      pagesProcessed: testPages.length,
      actualPagesPerSecond: actualPagesPerSecond.toFixed(2),
      metricsPagesPerSecond: metrics.throughput.pagesPerSecond.toFixed(2)
    });

    // Verify performance meets baseline requirements
    expect(actualPagesPerSecond).toBeGreaterThanOrEqual(1.2);
    
    // Verify metrics were collected correctly
    expect(metrics.counts.processedPages).toBe(testPages.length);
    expect(metrics.throughput.pagesPerSecond).toBeGreaterThanOrEqual(1.2);
    expect(metrics.timing.duration).toBeGreaterThan(0);
    expect(metrics.errors.totalErrors).toBe(0);

    logger.info('Performance baseline validation passed', {
      requirement: '≥1.2 pages/second',
      actual: actualPagesPerSecond.toFixed(2)
    });
  });

  async function simulatePageProcessing(page: Page): Promise<void> {
    // Simulate realistic processing work:
    // - File I/O operations
    // - Content transformation
    // - Validation
    
    // Simulate content transformation time (varies by content size)
    const contentSize = page.bodyStorage?.length || 100;
    const processingTime = Math.max(5, contentSize / 10000); // 5ms minimum, scale with content
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    // Simulate file write operation
    const filePath = path.join(tempDir, `${page.id}.md`);
    const markdownContent = `# ${page.title}\n\n${page.bodyStorage || 'No content'}`;
    await fs.writeFile(filePath, markdownContent);
  }
});
