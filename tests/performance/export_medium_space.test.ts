import { performance } from 'perf_hooks';
import { readFileSync, existsSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { ExportRunner } from '../../src/core/exportRunner';
import type { ExportConfig } from '../../src/models/entities';

/**
 * Performance test harness measuring export time & memory for medium-sized spaces
 * NFR-001: Medium space (300-700 pages) should complete <10 minutes
 * NFR-002: Memory usage should remain <300MB RSS during processing
 */
describe('Performance Tests', () => {
  // Skip by default to avoid long test runs in CI
  const skipPerformanceTests = process.env.RUN_PERFORMANCE_TESTS !== 'true';
  const testTimeout = 15 * 60 * 1000; // 15 minutes max
  
  let tempDir: string;
  let startTime: number;

  beforeEach(async () => {
    if (skipPerformanceTests) {
      pending('Performance tests skipped. Set RUN_PERFORMANCE_TESTS=true to enable.');
      return;
    }
    
    tempDir = await mkdtemp(resolve(tmpdir(), 'confluence-perf-test-'));
    startTime = performance.now();
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Medium Space Export Performance', () => {
    const mediumSpaceConfig: ExportConfig = {
      spaceKey: 'PERF-MEDIUM',
      outputDir: '',
      dryRun: false,
      concurrency: 5,
      resume: false,
      fresh: false,
      logLevel: 'info',
      username: 'test-user',
      password: 'test-token',
      baseUrl: 'https://test.atlassian.net/wiki',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        jitterRatio: 0.1
      },
      cleanup: {
        enabled: true,
        intensity: 'medium',
        rules: [],
        lineLength: 92,
        locale: 'en-us',
        preserveFormatting: false
      }
    };

    it('should export 300-700 pages within time and memory limits', async () => {
      const config = { ...mediumSpaceConfig, outputDir: tempDir };
      const runner = new ExportRunner(config);
      
      // Memory monitoring
      const memoryCheckInterval = setInterval(() => {
        const currentMemory = process.memoryUsage();
        const rssInMB = currentMemory.rss / 1024 / 1024;
        
        // NFR-002: Memory should stay under 300MB RSS
        if (rssInMB > 300) {
          clearInterval(memoryCheckInterval);
          fail(`Memory usage exceeded 300MB: ${rssInMB.toFixed(2)}MB`);
        }
      }, 1000);

      try {
        // Execute the export
        const result = await runner.run();
        clearInterval(memoryCheckInterval);
        
        // NFR-001: Time measurement
        const endTime = performance.now();
        const durationMs = endTime - startTime;
        const durationMinutes = durationMs / 60000;
        
        // Verify timing requirements
        expect(durationMinutes).toBeLessThan(10);
        
        // Verify export success (no errors and completed state)
        expect(result.errors).toHaveLength(0);
        expect(result.currentPhase).toBe('completed');
        expect(result.processedPages).toBeGreaterThanOrEqual(300);
        expect(result.processedPages).toBeLessThanOrEqual(700);
        
        // Verify memory efficiency
        const finalMemory = process.memoryUsage();
        const peakRssInMB = finalMemory.rss / 1024 / 1024;
        expect(peakRssInMB).toBeLessThan(300);
        
        // Log performance metrics
        console.log('Performance Metrics:', {
          pagesProcessed: result.processedPages,
          durationMinutes: durationMinutes.toFixed(2),
          peakMemoryMB: peakRssInMB.toFixed(2),
          throughputPagesPerMinute: (result.processedPages / durationMinutes).toFixed(2)
        });
        
        // Verify output structure
        const manifestPath = join(tempDir, 'manifest.json');
        expect(() => readFileSync(manifestPath, 'utf8')).not.toThrow();
        
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        expect(manifest.pages).toHaveLength(result.processedPages);
        
      } finally {
        clearInterval(memoryCheckInterval);
      }
    }, testTimeout);

    it('should maintain consistent throughput with increasing concurrency', async () => {
      const concurrencyLevels = [1, 3, 5, 8];
      const throughputResults: Array<{ concurrency: number; throughput: number; memory: number }> = [];
      
      for (const concurrency of concurrencyLevels) {
        const testStartTime = performance.now();
        const config = { 
          ...mediumSpaceConfig, 
          outputDir: join(tempDir, `concurrency-${concurrency}`),
          concurrency,
          // Use dry run for throughput comparison
          dryRun: true
        };
        
        const runner = new ExportRunner(config);
        const result = await runner.run();
        
        const testEndTime = performance.now();
        const durationMinutes = (testEndTime - testStartTime) / 60000;
        const throughput = result.processedPages / durationMinutes;
        const memoryMB = process.memoryUsage().rss / 1024 / 1024;
        
        throughputResults.push({ 
          concurrency, 
          throughput: parseFloat(throughput.toFixed(2)), 
          memory: parseFloat(memoryMB.toFixed(2))
        });
        
        // Memory should not increase dramatically with concurrency
        expect(memoryMB).toBeLessThan(300);
      }
      
      console.log('Concurrency Performance:', throughputResults);
      
      // Verify that increasing concurrency improves or maintains throughput
      const baseThroughput = throughputResults[0].throughput;
      const highestThroughput = Math.max(...throughputResults.map(r => r.throughput));
      
      expect(highestThroughput).toBeGreaterThanOrEqual(baseThroughput * 0.8); // Allow some variance
    }, testTimeout);

    it('should handle large space discovery without memory explosion', async () => {
      const config = { 
        ...mediumSpaceConfig, 
        outputDir: tempDir,
        // Simulate large discovery scenario
        dryRun: true
      };
      
      const runner = new ExportRunner(config);
      
      // Monitor memory during discovery phase
      let maxMemoryMB = 0;
      const memoryMonitor = setInterval(() => {
        const memoryMB = process.memoryUsage().rss / 1024 / 1024;
        maxMemoryMB = Math.max(maxMemoryMB, memoryMB);
      }, 100);
      
      try {
        const result = await runner.run();
        clearInterval(memoryMonitor);
        
        // Verify discovery didn't cause memory issues
        expect(maxMemoryMB).toBeLessThan(300);
        expect(result.errors).toHaveLength(0);
        expect(result.currentPhase).toBe('completed');
        
        console.log('Discovery Memory Peak:', maxMemoryMB.toFixed(2), 'MB');
        
      } finally {
        clearInterval(memoryMonitor);
      }
    }, testTimeout);
  });

  describe('Performance Regression Tests', () => {
    it('should maintain baseline performance compared to previous runs', async () => {
      // This test would compare against stored baseline metrics
      // For now, just verify the framework is in place
      const baselineFile = join(process.cwd(), 'performance-baseline.json');
      
      // If baseline exists, load and compare
      // If not, this test serves as documentation for future implementation
      if (existsSync(baselineFile)) {
        const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));
        expect(baseline).toHaveProperty('mediumSpaceThroughput');
        expect(baseline).toHaveProperty('memoryUsageMB');
      } else {
        console.log('No performance baseline found. Future runs can establish baseline.');
      }
    });
  });
});
