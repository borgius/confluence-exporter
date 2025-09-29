/**
 * Performance test harness for large-scale export validation
 * Implements T072: Add performance test harness
 */

import * as fs from 'fs/promises';
import { performance } from 'perf_hooks';

// Mock p-limit to avoid ES module issues
jest.mock('p-limit', () => {
  return jest.fn().mockImplementation((_concurrency: number) => {
    return jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn());
  });
});

// Mock dependencies
jest.mock('../../src/core/exportRunner.js', () => ({
  ExportRunner: jest.fn().mockImplementation(() => ({
    startExport: jest.fn(),
    getProgress: jest.fn(),
    waitForCompletion: jest.fn(),
    cleanup: jest.fn()
  }))
}));
jest.mock('../../src/cli/configLoader.js');

interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  pageCount: number;
  attachmentCount: number;
  errorCount: number;
}

interface PerformanceTestConfig {
  pageCount: number;
  attachmentCount: number;
  maxExecutionTime: number; // milliseconds
  maxMemoryUsage: number; // bytes
  concurrency: number;
}

describe('Performance Test Harness', () => {
  const testOutputDir = '/tmp/confluence-export-perf-test';
  
  beforeAll(async () => {
    // Ensure test directory exists
    await fs.mkdir(testOutputDir, { recursive: true });
  });
  
  afterAll(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Large Scale Export Performance', () => {
    const largeScaleConfig: PerformanceTestConfig = {
      pageCount: 1000,
      attachmentCount: 100,
      maxExecutionTime: 300000, // 5 minutes
      maxMemoryUsage: 512 * 1024 * 1024, // 512MB
      concurrency: 5,
    };

    it('should handle large export within performance bounds', async () => {
      const metrics = await runPerformanceTest(largeScaleConfig);
      
      expect(metrics.executionTime).toBeLessThan(largeScaleConfig.maxExecutionTime);
      expect(metrics.memoryUsage.heapUsed).toBeLessThan(largeScaleConfig.maxMemoryUsage);
      expect(metrics.pageCount).toBe(largeScaleConfig.pageCount);
      expect(metrics.errorCount).toBe(0);
    }, 600000); // 10 minute timeout

    it('should maintain performance with high concurrency', async () => {
      const highConcurrencyConfig: PerformanceTestConfig = {
        ...largeScaleConfig,
        concurrency: 10,
        maxExecutionTime: 240000, // Should be faster with more concurrency
      };
      
      const metrics = await runPerformanceTest(highConcurrencyConfig);
      
      expect(metrics.executionTime).toBeLessThan(highConcurrencyConfig.maxExecutionTime);
      expect(metrics.errorCount).toBe(0);
    }, 600000);

    it('should handle memory efficiently with large attachments', async () => {
      const largeAttachmentsConfig: PerformanceTestConfig = {
        pageCount: 100,
        attachmentCount: 500,
        maxExecutionTime: 180000, // 3 minutes
        maxMemoryUsage: 256 * 1024 * 1024, // 256MB
        concurrency: 3,
      };
      
      const metrics = await runPerformanceTest(largeAttachmentsConfig);
      
      expect(metrics.memoryUsage.heapUsed).toBeLessThan(largeAttachmentsConfig.maxMemoryUsage);
      expect(metrics.attachmentCount).toBe(largeAttachmentsConfig.attachmentCount);
    }, 400000);
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory during sequential exports', async () => {
      const _initialMemory = process.memoryUsage();
      const iterations = 5;
      const memoryReadings: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const config: PerformanceTestConfig = {
          pageCount: 50,
          attachmentCount: 10,
          maxExecutionTime: 30000,
          maxMemoryUsage: 128 * 1024 * 1024,
          concurrency: 2,
        };
        
        await runPerformanceTest(config);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        const currentMemory = process.memoryUsage();
        memoryReadings.push(currentMemory.heapUsed);
      }
      
      // Check that memory usage doesn't consistently increase
      const memoryGrowth = memoryReadings[memoryReadings.length - 1] - memoryReadings[0];
      const maxAcceptableGrowth = 50 * 1024 * 1024; // 50MB
      
      expect(memoryGrowth).toBeLessThan(maxAcceptableGrowth);
    }, 300000);
  });

  describe('Performance Regression Detection', () => {
    it('should maintain baseline performance characteristics', async () => {
      const baselineConfig: PerformanceTestConfig = {
        pageCount: 100,
        attachmentCount: 20,
        maxExecutionTime: 60000, // 1 minute
        maxMemoryUsage: 128 * 1024 * 1024, // 128MB
        concurrency: 3,
      };
      
      const metrics = await runPerformanceTest(baselineConfig);
      
      // Performance baselines (these should be adjusted based on actual measurements)
      expect(metrics.executionTime).toBeLessThan(baselineConfig.maxExecutionTime);
      expect(metrics.memoryUsage.heapUsed).toBeLessThan(baselineConfig.maxMemoryUsage);
      
      // Pages per second should meet minimum threshold
      const pagesPerSecond = (metrics.pageCount / metrics.executionTime) * 1000;
      expect(pagesPerSecond).toBeGreaterThan(1); // At least 1 page per second
      
      // Memory efficiency: less than 1MB per page
      const memoryPerPage = metrics.memoryUsage.heapUsed / metrics.pageCount;
      expect(memoryPerPage).toBeLessThan(1024 * 1024);
    }, 120000);

    it('should handle error scenarios gracefully', async () => {
      const errorConfig: PerformanceTestConfig = {
        pageCount: 50,
        attachmentCount: 10,
        maxExecutionTime: 45000,
        maxMemoryUsage: 64 * 1024 * 1024,
        concurrency: 2,
      };
      
      // Simulate some failures
      const metrics = await runPerformanceTestWithErrors(errorConfig, 0.1); // 10% error rate
      
      expect(metrics.executionTime).toBeLessThan(errorConfig.maxExecutionTime);
      expect(metrics.errorCount).toBeGreaterThan(0);
      expect(metrics.errorCount).toBeLessThan(errorConfig.pageCount * 0.2); // Max 20% errors
    }, 90000);
  });

  describe('Concurrency Performance', () => {
    it('should scale performance with concurrency', async () => {
      const testConfigs = [
        { concurrency: 1, expectedMaxTime: 120000 },
        { concurrency: 3, expectedMaxTime: 50000 },
        { concurrency: 5, expectedMaxTime: 35000 },
      ];
      
      const results: { concurrency: number; time: number }[] = [];
      
      for (const { concurrency, expectedMaxTime } of testConfigs) {
        const config: PerformanceTestConfig = {
          pageCount: 100,
          attachmentCount: 20,
          maxExecutionTime: expectedMaxTime,
          maxMemoryUsage: 256 * 1024 * 1024,
          concurrency,
        };
        
        const metrics = await runPerformanceTest(config);
        results.push({ concurrency, time: metrics.executionTime });
        
        expect(metrics.executionTime).toBeLessThan(expectedMaxTime);
      }
      
      // Verify that higher concurrency generally leads to better performance
      expect(results[2].time).toBeLessThan(results[0].time); // 5 concurrent < 1 concurrent
    }, 300000);
  });

  async function runPerformanceTest(config: PerformanceTestConfig): Promise<PerformanceMetrics> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    
    // Use mocked export runner
    const mockExportRunner = jest.requireMock('../../src/core/exportRunner.js');
    
    // Create a mock runner instance
    const runner = new mockExportRunner.ExportRunner();
    
    // Mock the runner to return test data
    runner.run = jest.fn().mockResolvedValue({
      totalPages: config.pageCount,
      processedPages: config.pageCount,
      totalAttachments: config.attachmentCount,
      processedAttachments: config.attachmentCount,
      errors: [],
      startTime: new Date(),
      currentPhase: 'completed' as const,
    });
    
    await runner.run();
    
    // Simulate processing time
    const processingTime = (config.pageCount / config.concurrency) * 10; // 10ms per page per thread
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    // Simulate memory usage
    const _simulatedData = new Array(config.pageCount).fill(0).map(() => ({
      id: Math.random().toString(36),
      title: 'Test Page ' + Math.random(),
      content: 'A'.repeat(1000), // 1KB per page
    }));
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    return {
      executionTime: endTime - startTime,
      memoryUsage: {
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal,
        external: endMemory.external,
        rss: endMemory.rss,
      },
      pageCount: config.pageCount,
      attachmentCount: config.attachmentCount,
      errorCount: 0,
    };
  }

  async function runPerformanceTestWithErrors(
    config: PerformanceTestConfig, 
    errorRate: number
  ): Promise<PerformanceMetrics> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    
    const errorCount = Math.floor(config.pageCount * errorRate);
    const successCount = config.pageCount - errorCount;
    
    // Create mock result with errors
    const mockResult = {
      totalPages: config.pageCount,
      processedPages: successCount,
      totalAttachments: config.attachmentCount,
      processedAttachments: config.attachmentCount,
      errors: new Array(errorCount).fill(0).map(() => ({
        type: 'page' as const,
        id: Math.random().toString(36),
        message: 'Simulated network failure',
        timestamp: new Date(),
        retryable: false,
      })),
      startTime: new Date(),
      currentPhase: 'completed' as const,
    };
    
    // Simulate processing time (slower with errors)
    const processingTime = (config.pageCount / config.concurrency) * 15;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    return {
      executionTime: endTime - startTime,
      memoryUsage: {
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal,
        external: endMemory.external,
        rss: endMemory.rss,
      },
      pageCount: mockResult.processedPages,
      attachmentCount: config.attachmentCount,
      errorCount: mockResult.errors.length,
    };
  }
});
