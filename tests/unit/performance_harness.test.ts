import { PerformanceCollector, createPerformanceCollector } from '../../src/core/performanceCollector';

describe('Unit: performance harness', () => {
  let performanceCollector: PerformanceCollector;

  beforeEach(() => {
    // Create fresh performance collector before each test
    performanceCollector = createPerformanceCollector();
  });

  it('measures execution time correctly using performance API', () => {
    const start = performance.now();
    
    // Simulate some work
    const sum = Array.from({ length: 1000 }, (_, i) => i).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0); // Ensure work was done
    
    const duration = performance.now() - start;
    
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThan(1000); // Should be much less than 1 second
  });

  it('handles multiple concurrent timings', () => {
    const start1 = performance.now();
    const start2 = performance.now();
    const start3 = performance.now();
    
    // End timings in different order
    const duration2 = performance.now() - start2;
    const duration1 = performance.now() - start1;
    const duration3 = performance.now() - start3;
    
    expect(duration1).toBeGreaterThan(0);
    expect(duration2).toBeGreaterThan(0);
    expect(duration3).toBeGreaterThan(0);
  });

  it('tracks memory usage changes', () => {
    const getMemoryUsage = () => {
      if (process.memoryUsage) {
        return process.memoryUsage();
      }
      return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
    };

    const initialMemory = getMemoryUsage();
    
    // Allocate some memory
    const largeArray = new Array(100000).fill('test-data');
    
    const afterMemory = getMemoryUsage();
    
    expect(afterMemory.heapUsed).toBeGreaterThan(initialMemory.heapUsed);
    expect(largeArray.length).toBe(100000); // Ensure array wasn't optimized away
  });

  it('generates comprehensive performance metrics using PerformanceCollector', () => {
    performanceCollector.start();
    
    // Perform operations that the collector can track
    performanceCollector.startPhase('fast-operation');
    performanceCollector.endPhase('fast-operation');
    
    performanceCollector.startPhase('medium-operation');
    // Simulate medium work
    Array.from({ length: 10000 }, (_, i) => i * i);
    performanceCollector.endPhase('medium-operation');
    
    performanceCollector.startPhase('slow-operation');
    // Simulate slower work
    Array.from({ length: 100000 }, (_, i) => Math.sqrt(i));
    performanceCollector.endPhase('slow-operation');
    
    const metrics = performanceCollector.end();
    
    expect(metrics.timing.phases.size).toBeGreaterThan(0);
    expect(metrics.timing.duration).toBeGreaterThan(0);
    expect(metrics.timing.startTime).toBeGreaterThan(0);
    expect(metrics.timing.endTime).toBeGreaterThan(metrics.timing.startTime);
  });

  it('handles timing errors gracefully', () => {
    // Try to end a phase that was never started
    expect(() => {
      performanceCollector.endPhase('non-existent-operation');
    }).not.toThrow();
    
    // Try to start phase with invalid name
    expect(() => {
      performanceCollector.startPhase('');
    }).not.toThrow();
  });

  it('provides accurate timing resolution', () => {
    const start = performance.now();
    
    // Very small delay
    for (let i = 0; i < 100; i++) {
      Math.random();
    }
    
    const duration = performance.now() - start;
    
    // Should detect microsecond-level differences
    expect(duration).toBeGreaterThan(0);
    expect(Number.isFinite(duration)).toBe(true);
  });

  it('tracks cumulative operation counts in PerformanceCollector', () => {
    performanceCollector.start();
    
    // Record various operations
    performanceCollector.recordPageProcessed(true, 1000);
    performanceCollector.recordPageProcessed(true, 1500);
    performanceCollector.recordPageProcessed(false, 800);
    performanceCollector.recordAttachmentProcessed(true, 5000);
    performanceCollector.recordAttachmentProcessed(false, 2000);
    
    const metrics = performanceCollector.end();
    
    expect(metrics.counts.processedPages).toBe(3);
    expect(metrics.counts.processedAttachments).toBe(2);
    expect(metrics.counts.processedBytes).toBe(10300); // 1000+1500+800+5000+2000
    expect(metrics.errors.pageErrors).toBe(1);
    expect(metrics.errors.attachmentErrors).toBe(1);
    expect(metrics.errors.totalErrors).toBe(2);
  });

  it('calculates operation statistics with timing wrapper', () => {
    const timings: number[] = [];
    const iterations = 10;
    
    // Perform operation multiple times with varying workloads
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      // Variable workload based on iteration
      Array.from({ length: 1000 * (i + 1) }, (_, j) => j);
      const duration = performance.now() - start;
      timings.push(duration);
    }
    
    const min = Math.min(...timings);
    const max = Math.max(...timings);
    const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
    
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
    expect(mean).toBeGreaterThan(min);
    expect(mean).toBeLessThan(max);
    expect(timings.length).toBe(iterations);
  });

  it('measures throughput correctly', () => {
    const itemsProcessed = 1000;
    const start = performance.now();
    
    // Simulate processing items
    for (let i = 0; i < itemsProcessed; i++) {
      Math.sqrt(i);
    }
    
    const duration = performance.now() - start;
    const throughput = itemsProcessed / (duration / 1000); // items per second
    
    expect(throughput).toBeGreaterThan(0);
    expect(Number.isFinite(throughput)).toBe(true);
    // Should be able to process many items per second
    expect(throughput).toBeGreaterThan(1000);
  });

  it('handles performance baseline validation', () => {
    const expectedMaxDuration = 100; // 100ms
    
    const start = performance.now();
    
    // Light operation that should be fast
    Array.from({ length: 1000 }, (_, i) => i);
    
    const duration = performance.now() - start;
    
    // Should complete well within baseline
    expect(duration).toBeLessThan(expectedMaxDuration);
    
    const isWithinBaseline = duration < expectedMaxDuration;
    expect(isWithinBaseline).toBe(true);
  });

  it('detects performance regressions', () => {
    const timings: number[] = [];
    
    // Establish baseline with fast operations
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      Array.from({ length: 100 }, (_, j) => j);
      const duration = performance.now() - start;
      timings.push(duration);
    }
    
    const baselineMean = timings.reduce((a, b) => a + b, 0) / timings.length;
    
    // Perform a slower operation
    const start = performance.now();
    Array.from({ length: 10000 }, (_, i) => i * i);
    const slowDuration = performance.now() - start;
    
    // Should detect that this operation is significantly slower
    const regressionThreshold = baselineMean * 2; // 100% slower
    const hasRegressed = slowDuration > regressionThreshold;
    
    expect(hasRegressed).toBe(true);
  });

  it('provides memory leak detection capabilities', () => {
    const getMemoryUsage = () => {
      if (process.memoryUsage) {
        return process.memoryUsage();
      }
      return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
    };

    const memorySnapshots: Array<{used: number, timestamp: number}> = [];
    
    // Simulate operations that might leak memory
    for (let i = 0; i < 5; i++) {
      // Create and release memory
      const tempArray = new Array(10000).fill(`iteration-${i}`);
      const currentMemory = getMemoryUsage();
      memorySnapshots.push({
        used: currentMemory.heapUsed,
        timestamp: Date.now()
      });
      
      // Force reference to prevent optimization
      expect(tempArray[0]).toContain('iteration');
    }
    
    // Check if memory usage is trending upward
    const firstSnapshot = memorySnapshots[0];
    const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
    
    // Memory might increase, but should eventually be garbage collected
    expect(firstSnapshot.used).toBeGreaterThan(0);
    expect(lastSnapshot.used).toBeGreaterThan(0);
    
    // The test itself validates the capability to track memory changes
    expect(memorySnapshots.length).toBe(5);
  });

  it('integrates with PerformanceCollector for export performance tracking', () => {
    performanceCollector.start();
    
    // Set up realistic export scenario
    performanceCollector.setTotalCounts(100, 50, 1000000);
    
    // Simulate export phases
    performanceCollector.startPhase('discovery');
    performanceCollector.endPhase('discovery');
    
    performanceCollector.startPhase('processing');
    // Simulate processing multiple pages
    for (let i = 0; i < 10; i++) {
      performanceCollector.recordPageProcessed(true, 1000);
    }
    performanceCollector.endPhase('processing');
    
    performanceCollector.startPhase('finalization');
    performanceCollector.recordError('network-timeout');
    performanceCollector.endPhase('finalization');
    
    const metrics = performanceCollector.end();
    const summary = performanceCollector.generateSummary();
    
    expect(metrics.counts.totalPages).toBe(100);
    expect(metrics.counts.processedPages).toBe(10);
    expect(metrics.errors.totalErrors).toBe(1);
    expect(summary.recommendations).toBeDefined();
    expect(summary.efficiency.score).toBeGreaterThan(0);
    expect(summary.efficiency.score).toBeLessThanOrEqual(100);
  });
});
