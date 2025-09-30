/**
 * T064 Unit: Metrics edge cases (empty queues, rapid interrupts)
 * Testing boundary conditions and error scenarios for metrics collection
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { performance } from 'perf_hooks';

interface MetricsCollector {
  startTimer(): void;
  endTimer(): number;
  recordQueueEvent(type: 'add' | 'process' | 'fail', count?: number): void;
  recordMemorySnapshot(): void;
  recordInterrupt(graceful: boolean): void;
  getMetrics(): QueueMetrics;
  reset(): void;
}

interface QueueMetrics {
  totalQueued: number;
  totalProcessed: number;
  totalFailed: number;
  currentQueueSize: number;
  avgTransitionLatency: number;
  memoryPeakMB: number;
  interruptCount: number;
  gracefulInterrupts: number;
  uptime: number;
}

// Mock metrics collector for edge case testing
class MockMetricsCollector implements MetricsCollector {
  private startTime = performance.now();
  private timers: number[] = [];
  private metrics: QueueMetrics = {
    totalQueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    currentQueueSize: 0,
    avgTransitionLatency: 0,
    memoryPeakMB: 0,
    interruptCount: 0,
    gracefulInterrupts: 0,
    uptime: 0
  };
  private currentTimer?: number;
  private transitionLatencies: number[] = [];

  startTimer(): void {
    this.currentTimer = performance.now();
  }

  endTimer(): number {
    if (!this.currentTimer) {
      throw new Error('Timer not started');
    }
    const duration = performance.now() - this.currentTimer;
    this.transitionLatencies.push(duration);
    this.updateAvgLatency();
    this.currentTimer = undefined;
    return duration;
  }

  recordQueueEvent(type: 'add' | 'process' | 'fail', count = 1): void {
    switch (type) {
      case 'add':
        this.metrics.totalQueued += count;
        this.metrics.currentQueueSize += count;
        break;
      case 'process':
        this.metrics.totalProcessed += count;
        this.metrics.currentQueueSize = Math.max(0, this.metrics.currentQueueSize - count);
        break;
      case 'fail':
        this.metrics.totalFailed += count;
        this.metrics.currentQueueSize = Math.max(0, this.metrics.currentQueueSize - count);
        break;
    }
  }

  recordMemorySnapshot(): void {
    const memoryMB = process.memoryUsage().rss / 1024 / 1024;
    this.metrics.memoryPeakMB = Math.max(this.metrics.memoryPeakMB, memoryMB);
  }

  recordInterrupt(graceful: boolean): void {
    this.metrics.interruptCount++;
    if (graceful) {
      this.metrics.gracefulInterrupts++;
    }
  }

  getMetrics(): QueueMetrics {
    return {
      ...this.metrics,
      uptime: performance.now() - this.startTime
    };
  }

  reset(): void {
    this.startTime = performance.now();
    this.timers = [];
    this.transitionLatencies = [];
    this.currentTimer = undefined;
    this.metrics = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      currentQueueSize: 0,
      avgTransitionLatency: 0,
      memoryPeakMB: 0,
      interruptCount: 0,
      gracefulInterrupts: 0,
      uptime: 0
    };
  }

  private updateAvgLatency(): void {
    if (this.transitionLatencies.length === 0) {
      this.metrics.avgTransitionLatency = 0;
      return;
    }
    const sum = this.transitionLatencies.reduce((a, b) => a + b, 0);
    this.metrics.avgTransitionLatency = sum / this.transitionLatencies.length;
  }
}

describe('Metrics Edge Cases', () => {
  let collector: MockMetricsCollector;

  beforeEach(() => {
    collector = new MockMetricsCollector();
  });

  afterEach(() => {
    collector.reset();
  });

  describe('Empty Queue Scenarios', () => {
    test('handles metrics with completely empty queue', () => {
      const metrics = collector.getMetrics();
      
      expect(metrics.totalQueued).toBe(0);
      expect(metrics.totalProcessed).toBe(0);
      expect(metrics.totalFailed).toBe(0);
      expect(metrics.currentQueueSize).toBe(0);
      expect(metrics.avgTransitionLatency).toBe(0);
    });

    test('handles processing from empty queue gracefully', () => {
      // Try to process items when queue is empty
      expect(() => {
        collector.recordQueueEvent('process', 5);
      }).not.toThrow();
      
      const metrics = collector.getMetrics();
      expect(metrics.totalProcessed).toBe(5);
      expect(metrics.currentQueueSize).toBe(0); // Should not go negative
    });

    test('handles failure events on empty queue', () => {
      // Try to fail items when queue is empty
      expect(() => {
        collector.recordQueueEvent('fail', 3);
      }).not.toThrow();
      
      const metrics = collector.getMetrics();
      expect(metrics.totalFailed).toBe(3);
      expect(metrics.currentQueueSize).toBe(0); // Should not go negative
    });

    test('calculates latency correctly with no transitions', () => {
      const metrics = collector.getMetrics();
      expect(metrics.avgTransitionLatency).toBe(0);
      expect(Number.isNaN(metrics.avgTransitionLatency)).toBe(false);
    });

    test('handles timer operations on empty queue', () => {
      // Start and end timer without any queue operations
      collector.startTimer();
      
      // Small delay to ensure measurable duration
      const start = performance.now();
      while (performance.now() - start < 1) {
        // Busy wait
      }
      
      const duration = collector.endTimer();
      expect(duration).toBeGreaterThan(0);
      
      const metrics = collector.getMetrics();
      expect(metrics.avgTransitionLatency).toBeGreaterThan(0);
    });
  });

  describe('Rapid Interrupt Scenarios', () => {
    test('handles multiple rapid graceful interrupts', () => {
      // Simulate rapid Ctrl+C presses
      for (let i = 0; i < 10; i++) {
        collector.recordInterrupt(true);
      }
      
      const metrics = collector.getMetrics();
      expect(metrics.interruptCount).toBe(10);
      expect(metrics.gracefulInterrupts).toBe(10);
    });

    test('handles mixed graceful and forced interrupts', () => {
      // Simulate realistic interrupt patterns
      collector.recordInterrupt(true);  // First Ctrl+C
      collector.recordInterrupt(false); // Second Ctrl+C (forced)
      collector.recordInterrupt(true);  // Another session
      collector.recordInterrupt(false); // Forced again
      
      const metrics = collector.getMetrics();
      expect(metrics.interruptCount).toBe(4);
      expect(metrics.gracefulInterrupts).toBe(2);
    });

    test('handles interrupts during active processing', () => {
      // Add some work to the queue
      collector.recordQueueEvent('add', 100);
      collector.startTimer();
      
      // Simulate processing some items
      collector.recordQueueEvent('process', 25);
      
      // Interrupt during processing
      collector.recordInterrupt(true);
      
      const duration = collector.endTimer();
      const metrics = collector.getMetrics();
      
      expect(metrics.currentQueueSize).toBe(75);
      expect(metrics.interruptCount).toBe(1);
      expect(duration).toBeGreaterThan(0);
    });

    test('tracks interrupt frequency patterns', async () => {
      const interruptTimes: number[] = [];
      
      // Simulate interrupts with varying timing
      for (let i = 0; i < 5; i++) {
        interruptTimes.push(performance.now());
        collector.recordInterrupt(i % 2 === 0); // Alternate graceful/forced
        
        if (i < 4) { // Don't wait after last interrupt
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      const metrics = collector.getMetrics();
      expect(metrics.interruptCount).toBe(5);
      expect(metrics.gracefulInterrupts).toBe(3); // 0, 2, 4 are even (graceful)
      
      // Verify timing captured correctly
      expect(metrics.uptime).toBeGreaterThan(30); // At least 4 * 10ms waits
    });
  });

  describe('Memory Edge Cases', () => {
    test('tracks memory spikes correctly', () => {
      // Initial memory snapshot
      collector.recordMemorySnapshot();
      const initialMetrics = collector.getMetrics();
      const initialMemory = initialMetrics.memoryPeakMB;
      
      // Allocate some memory to simulate peak
      const bigArray = new Array(10000).fill('memory-test-data');
      collector.recordMemorySnapshot();
      
      const metrics = collector.getMetrics();
      expect(metrics.memoryPeakMB).toBeGreaterThanOrEqual(initialMemory);
      
      // Cleanup to avoid memory leaks in tests
      bigArray.length = 0;
    });

    test('handles memory tracking with no snapshots', () => {
      const metrics = collector.getMetrics();
      expect(metrics.memoryPeakMB).toBe(0);
      expect(Number.isNaN(metrics.memoryPeakMB)).toBe(false);
    });

    test('memory peak monotonically increases', () => {
      const snapshots: number[] = [];
      
      // Take multiple memory snapshots
      for (let i = 0; i < 5; i++) {
        collector.recordMemorySnapshot();
        snapshots.push(collector.getMetrics().memoryPeakMB);
      }
      
      // Memory peak should be non-decreasing
      for (let i = 1; i < snapshots.length; i++) {
        expect(snapshots[i]).toBeGreaterThanOrEqual(snapshots[i - 1]);
      }
    });
  });

  describe('Timer Edge Cases', () => {
    test('handles timer without start', () => {
      expect(() => {
        collector.endTimer();
      }).toThrow('Timer not started');
    });

    test('handles multiple timer starts without end', () => {
      collector.startTimer();
      collector.startTimer(); // Should overwrite previous
      
      const duration = collector.endTimer();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    test('handles very short timing intervals', () => {
      collector.startTimer();
      const duration = collector.endTimer(); // Immediate end
      
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(duration)).toBe(true);
      
      const metrics = collector.getMetrics();
      expect(metrics.avgTransitionLatency).toBeGreaterThanOrEqual(0);
    });

    test('calculates average correctly with outliers', () => {
      const durations: number[] = [];
      
      // Mix of normal and outlier timings
      const delays = [0, 1, 0, 100, 0, 1, 0]; // Include one long delay
      
      for (const delay of delays) {
        collector.startTimer();
        
        if (delay > 0) {
          const start = performance.now();
          while (performance.now() - start < delay) {
            // Busy wait for precise timing
          }
        }
        
        durations.push(collector.endTimer());
      }
      
      const metrics = collector.getMetrics();
      const expectedAvg = durations.reduce((a, b) => a + b, 0) / durations.length;
      
      // Allow for small timing variance
      expect(Math.abs(metrics.avgTransitionLatency - expectedAvg)).toBeLessThan(5);
    });
  });

  describe('Counter Overflow and Boundary Cases', () => {
    test('handles very large queue counts', () => {
      const largeCount = Number.MAX_SAFE_INTEGER - 1;
      
      collector.recordQueueEvent('add', largeCount);
      const metrics = collector.getMetrics();
      
      expect(metrics.totalQueued).toBe(largeCount);
      expect(metrics.currentQueueSize).toBe(largeCount);
    });

    test('handles rapid counter updates', () => {
      // Rapidly update counters
      for (let i = 0; i < 1000; i++) {
        collector.recordQueueEvent('add', 1);
        collector.recordQueueEvent('process', 1);
      }
      
      const metrics = collector.getMetrics();
      expect(metrics.totalQueued).toBe(1000);
      expect(metrics.totalProcessed).toBe(1000);
      expect(metrics.currentQueueSize).toBe(0);
    });

    test('maintains consistency under concurrent-like operations', () => {
      // Simulate concurrent-like operations (add/process/fail in random order)
      const operations = [
        () => collector.recordQueueEvent('add', 5),
        () => collector.recordQueueEvent('process', 2),
        () => collector.recordQueueEvent('fail', 1),
        () => collector.recordQueueEvent('add', 3),
        () => collector.recordQueueEvent('process', 4)
      ];
      
      operations.forEach(op => op());
      
      const metrics = collector.getMetrics();
      expect(metrics.totalQueued).toBe(8);
      expect(metrics.totalProcessed).toBe(6);
      expect(metrics.totalFailed).toBe(1);
      expect(metrics.currentQueueSize).toBe(1); // 8 added - 6 processed - 1 failed
    });
  });

  describe('Reset and State Management', () => {
    test('reset clears all metrics', () => {
      // Build up some state
      collector.recordQueueEvent('add', 10);
      collector.recordQueueEvent('process', 5);
      collector.recordInterrupt(true);
      collector.recordMemorySnapshot();
      
      collector.reset();
      
      const metrics = collector.getMetrics();
      expect(metrics.totalQueued).toBe(0);
      expect(metrics.totalProcessed).toBe(0);
      expect(metrics.totalFailed).toBe(0);
      expect(metrics.currentQueueSize).toBe(0);
      expect(metrics.avgTransitionLatency).toBe(0);
      expect(metrics.memoryPeakMB).toBe(0);
      expect(metrics.interruptCount).toBe(0);
      expect(metrics.gracefulInterrupts).toBe(0);
      expect(metrics.uptime).toBeLessThan(10); // Should be very small after reset
    });

    test('reset during active timer', () => {
      collector.startTimer();
      
      expect(() => {
        collector.reset();
      }).not.toThrow();
      
      // Should be able to start new timer after reset
      collector.startTimer();
      const duration = collector.endTimer();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    test('multiple resets work correctly', () => {
      for (let i = 0; i < 3; i++) {
        collector.recordQueueEvent('add', 10);
        collector.reset();
        
        const metrics = collector.getMetrics();
        expect(metrics.totalQueued).toBe(0);
      }
    });
  });
});
