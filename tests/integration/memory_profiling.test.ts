/**
 * T154: Memory profiling and leak detection tests
 * 
 * Comprehensive memory usage monitoring during export operations
 * to ensure no memory leaks and reasonable memory consumption.
 */

import { MarkdownCleanupService } from '../../src/cleanup/cleanupService.js';
import { createStandardQueue } from '../../src/queue/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

// Memory profiling utilities
interface MemorySnapshot {
  timestamp: number;
  rss: number;        // Resident Set Size
  heapUsed: number;   // Heap actually used
  heapTotal: number;  // Total heap allocated
  external: number;   // External memory usage
  arrayBuffers: number; // ArrayBuffer memory
}

interface MemoryProfile {
  baseline: MemorySnapshot;
  peak: MemorySnapshot;
  final: MemorySnapshot;
  samples: MemorySnapshot[];
  leakDetected: boolean;
  growthRate: number; // MB per second
  peakIncrease: number; // MB increase from baseline
}

class MemoryProfiler {
  private samples: MemorySnapshot[] = [];
  private baseline?: MemorySnapshot;
  private intervalId?: NodeJS.Timeout;

  start(): void {
    // Force garbage collection if available (for more accurate measurements)
    if (global.gc) {
      global.gc();
    }
    
    this.baseline = this.takeSnapshot();
    this.samples = [this.baseline];
    
    // Sample memory every 100ms during profiling
    this.intervalId = setInterval(() => {
      this.samples.push(this.takeSnapshot());
    }, 100);
  }

  stop(): MemoryProfile {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Force GC before final measurement
    if (global.gc) {
      global.gc();
    }

    const final = this.takeSnapshot();
    this.samples.push(final);

    if (!this.baseline) {
      throw new Error('Profiler not started');
    }

    const peak = this.samples.reduce((max, sample) => 
      sample.heapUsed > max.heapUsed ? sample : max
    );

    const duration = (final.timestamp - this.baseline.timestamp) / 1000; // seconds
    const baselineHeapMB = this.baseline.heapUsed / 1024 / 1024;
    const finalHeapMB = final.heapUsed / 1024 / 1024;
    const peakHeapMB = peak.heapUsed / 1024 / 1024;

    const growthRate = duration > 0 ? (finalHeapMB - baselineHeapMB) / duration : 0;
    const peakIncrease = peakHeapMB - baselineHeapMB;
    
    // Simple leak detection: if final memory is significantly higher than baseline
    // after GC, there might be a leak
    const leakThreshold = 10; // MB
    const leakDetected = (finalHeapMB - baselineHeapMB) > leakThreshold;

    return {
      baseline: this.baseline,
      peak,
      final,
      samples: this.samples,
      leakDetected,
      growthRate,
      peakIncrease
    };
  }

  private takeSnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    return {
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    };
  }
}

describe('Memory Profiling and Leak Detection', () => {
  let tempDir: string;
  let profiler: MemoryProfiler;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'confluence-memory-test-'));
    profiler = new MemoryProfiler();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Cleanup Service Memory Usage', () => {
    it('should not accumulate memory during repeated cleanup operations', async () => {
      const cleanupService = new MarkdownCleanupService();
      const testDocument = {
        filePath: '/test/document.md',
        content: 'This is a test document with "quotes" and -- dashes.\n\n\n\nMultiple blank lines.',
        metadata: {
          language: 'en',
          frontmatter: false,
          hasMath: false,
          hasCode: false,
          wordCount: 15,
          lineCount: 4
        }
      };

      profiler.start();

      // Perform 100 cleanup operations
      for (let i = 0; i < 100; i++) {
        await cleanupService.process(testDocument, {
          enabled: true,
          intensity: 'heavy',
          lineLength: 80,
          locale: 'en-US',
          preserveFormatting: true
        });
        
        // Occasional GC to test for genuine leaks
        if (i % 20 === 0 && global.gc) {
          global.gc();
        }
      }

      const profile = profiler.stop();

      expect(profile.leakDetected).toBe(false);
      expect(profile.peakIncrease).toBeLessThan(20); // Less than 20MB for cleanup operations
      expect(Math.abs(profile.growthRate)).toBeLessThan(2); // Minimal growth rate

      console.log('Cleanup service memory profile:', {
        peakIncreaseMB: profile.peakIncrease.toFixed(2),
        growthRateMBps: profile.growthRate.toFixed(2),
        operationsCompleted: 100
      });
    }, 30000);
  });

  describe('Queue Processing Memory Usage', () => {
    it('should handle queue operations without memory leaks', async () => {
      const queue = createStandardQueue('MEMTEST', tempDir);
      
      profiler.start();

      // Add many items to queue
      const items = Array.from({ length: 1000 }, (_, i) => ({
        pageId: `queue-page-${i}`,
        sourceType: 'macro' as const,
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        status: 'pending' as const
      }));

      // Process items in batches
      for (let i = 0; i < items.length; i += 100) {
        const batch = items.slice(i, i + 100);
        await queue.add(batch);
        
        // Process some items
        for (let j = 0; j < 50 && j < batch.length; j++) {
          const item = await queue.next();
          if (item) {
            await queue.markProcessed(item.pageId);
          }
        }

        // Force GC periodically
        if (i % 200 === 0 && global.gc) {
          global.gc();
        }
      }

      const profile = profiler.stop();

      expect(profile.leakDetected).toBe(false);
      expect(profile.peakIncrease).toBeLessThan(50); // Less than 50MB for queue operations

      console.log('Queue processing memory profile:', {
        peakIncreaseMB: profile.peakIncrease.toFixed(2),
        growthRateMBps: profile.growthRate.toFixed(2),
        itemsProcessed: 500
      });

      await queue.clear();
    }, 45000);
  });

  describe('Stress Testing Memory Usage', () => {
    it('should handle repeated operations without excessive memory growth', async () => {
      const cleanupService = new MarkdownCleanupService();
      const queue = createStandardQueue('STRESS', tempDir);

      const largeDocument = {
        filePath: '/test/large-document.md',
        content: 'This is a large test document.\n'.repeat(1000),
        metadata: {
          language: 'en',
          frontmatter: false,
          hasMath: false,
          hasCode: false,
          wordCount: 8000,
          lineCount: 1000
        }
      };

      profiler.start();

      // Perform mixed operations for stress testing
      for (let i = 0; i < 50; i++) {
        // Cleanup operation
        await cleanupService.process(largeDocument, {
          enabled: true,
          intensity: 'medium',
          lineLength: 100,
          locale: 'en-US',
          preserveFormatting: true
        });

        // Queue operations
        const queueItems = Array.from({ length: 10 }, (_, j) => ({
          pageId: `stress-${i}-${j}`,
          sourceType: 'reference' as const,
          discoveryTimestamp: Date.now(),
          retryCount: 0,
          status: 'pending' as const
        }));

        await queue.add(queueItems);

        // Process some items
        for (let k = 0; k < 5; k++) {
          const item = await queue.next();
          if (item) {
            await queue.markProcessed(item.pageId);
          }
        }

        // Force GC occasionally
        if (i % 10 === 0 && global.gc) {
          global.gc();
        }
      }

      const profile = profiler.stop();

      expect(profile.leakDetected).toBe(false);
      expect(profile.peakIncrease).toBeLessThan(100); // Less than 100MB for stress test
      expect(Math.abs(profile.growthRate)).toBeLessThan(5); // Reasonable growth rate

      console.log('Stress test memory profile:', {
        peakIncreaseMB: profile.peakIncrease.toFixed(2),
        growthRateMBps: profile.growthRate.toFixed(2),
        operationsCompleted: 50
      });

      await queue.clear();
    }, 60000);
  });

  describe('Memory Usage Reporting', () => {
    it('should provide comprehensive memory usage statistics', async () => {
      const cleanupService = new MarkdownCleanupService();
      
      profiler.start();

      // Perform some operations
      for (let i = 0; i < 20; i++) {
        await cleanupService.process({
          filePath: `/test/doc-${i}.md`,
          content: `Test document ${i} content.`,
          metadata: {
            language: 'en',
            frontmatter: false,
            hasMath: false,
            hasCode: false,
            wordCount: 3,
            lineCount: 1
          }
        }, {
          enabled: true,
          intensity: 'light',
          lineLength: 80,
          locale: 'en-US',
          preserveFormatting: true
        });
      }

      const profile = profiler.stop();

      // Verify we can generate comprehensive memory report
      const memoryReport = {
        memory: {
          baseline: {
            heapUsedMB: (profile.baseline.heapUsed / 1024 / 1024).toFixed(2),
            rssMB: (profile.baseline.rss / 1024 / 1024).toFixed(2)
          },
          peak: {
            heapUsedMB: (profile.peak.heapUsed / 1024 / 1024).toFixed(2),
            rssMB: (profile.peak.rss / 1024 / 1024).toFixed(2)
          },
          final: {
            heapUsedMB: (profile.final.heapUsed / 1024 / 1024).toFixed(2),
            rssMB: (profile.final.rss / 1024 / 1024).toFixed(2)
          },
          analysis: {
            peakIncreaseMB: profile.peakIncrease.toFixed(2),
            growthRateMBps: profile.growthRate.toFixed(2),
            leakDetected: profile.leakDetected,
            samplesCollected: profile.samples.length
          }
        }
      };

      expect(memoryReport.memory.analysis.samplesCollected).toBeGreaterThan(5);
      expect(profile.leakDetected).toBe(false);

      console.log('Memory usage report:', JSON.stringify(memoryReport, null, 2));
    }, 30000);
  });
});
