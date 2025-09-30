/**
 * T138: Queue size monitoring and alerting thresholds
 * Supports FR-040 for queue performance monitoring and alerting
 */

import type { QueueMetrics, DownloadQueue } from '../models/queueEntities.js';
import { logger } from '../util/logger.js';

export interface MonitoringThresholds {
  maxQueueSize: number;
  maxProcessingTime: number; // milliseconds
  maxFailureRate: number; // 0-1 (percentage as decimal)
  maxRetryRate: number; // 0-1 (percentage as decimal)
  minProcessingRate: number; // items per second
  stalledProcessingTimeout: number; // milliseconds
}

export interface AlertLevel {
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
  actionRequired: boolean;
}

export interface MonitoringState {
  isHealthy: boolean;
  currentAlerts: AlertLevel[];
  lastCheckTime: Date;
  healthScore: number; // 0-100
  recommendations: string[];
}

export class QueueMonitoringService {
  private readonly thresholds: MonitoringThresholds;
  private state: MonitoringState;
  private alertHistory: AlertLevel[] = [];
  private readonly maxAlertHistory = 100;
  private lastMetrics: QueueMetrics | null = null;
  private lastProcessingTime = Date.now();

  constructor(thresholds: Partial<MonitoringThresholds> = {}) {
    this.thresholds = {
      maxQueueSize: 10000,
      maxProcessingTime: 30000, // 30 seconds
      maxFailureRate: 0.2, // 20%
      maxRetryRate: 0.1, // 10%
      minProcessingRate: 0.1, // 0.1 items per second minimum
      stalledProcessingTimeout: 300000, // 5 minutes
      ...thresholds,
    };

    this.state = {
      isHealthy: true,
      currentAlerts: [],
      lastCheckTime: new Date(),
      healthScore: 100,
      recommendations: [],
    };
  }

  /**
   * Check queue health and generate alerts
   */
  checkHealth(queue: DownloadQueue, metrics: QueueMetrics): MonitoringState {
    const startTime = Date.now();
    this.state.currentAlerts = [];
    this.state.recommendations = [];

    // Check queue size
    this.checkQueueSize(queue, metrics);

    // Check failure rates
    this.checkFailureRates(metrics);

    // Check processing rates
    this.checkProcessingRates(metrics);

    // Check for stalled processing
    this.checkStalledProcessing(metrics);

    // Calculate health score
    this.calculateHealthScore(metrics);

    // Generate recommendations
    this.generateRecommendations(queue, metrics);

    // Update state
    this.state.isHealthy = this.state.currentAlerts.every(alert => alert.level !== 'critical');
    this.state.lastCheckTime = new Date();

    // Add alerts to history
    for (const alert of this.state.currentAlerts) {
      this.addAlertToHistory(alert);
    }

    this.lastMetrics = { ...metrics };
    const checkDuration = Date.now() - startTime;

    logger.debug('Queue health check completed', {
      isHealthy: this.state.isHealthy,
      alerts: this.state.currentAlerts.length,
      healthScore: this.state.healthScore,
      checkDurationMs: checkDuration,
    });

    return { ...this.state };
  }

  /**
   * Check if queue size exceeds thresholds
   */
  private checkQueueSize(_queue: DownloadQueue, metrics: QueueMetrics): void {
    const currentSize = metrics.currentQueueSize;
    const maxSize = this.thresholds.maxQueueSize;

    if (currentSize >= maxSize) {
      this.addAlert({
        level: 'critical',
        message: `Queue size (${currentSize}) has reached maximum capacity (${maxSize})`,
        metric: 'queueSize',
        value: currentSize,
        threshold: maxSize,
        timestamp: new Date(),
        actionRequired: true,
      });
    } else if (currentSize >= maxSize * 0.9) {
      this.addAlert({
        level: 'warning',
        message: `Queue size (${currentSize}) is approaching capacity (${maxSize})`,
        metric: 'queueSize',
        value: currentSize,
        threshold: maxSize * 0.9,
        timestamp: new Date(),
        actionRequired: true,
      });
    } else if (currentSize >= maxSize * 0.75) {
      this.addAlert({
        level: 'info',
        message: `Queue size (${currentSize}) is moderately high (${Math.round((currentSize / maxSize) * 100)}% of capacity)`,
        metric: 'queueSize',
        value: currentSize,
        threshold: maxSize * 0.75,
        timestamp: new Date(),
        actionRequired: false,
      });
    }
  }

  /**
   * Check failure and retry rates
   */
  private checkFailureRates(metrics: QueueMetrics): void {
    const totalProcessed = metrics.totalProcessed + metrics.totalFailed;
    if (totalProcessed === 0) return;

    const failureRate = metrics.totalFailed / totalProcessed;
    const retryRate = metrics.averageRetryCount > 0 ? metrics.averageRetryCount / totalProcessed : 0;

    // Check failure rate
    if (failureRate >= this.thresholds.maxFailureRate) {
      this.addAlert({
        level: failureRate >= this.thresholds.maxFailureRate * 1.5 ? 'critical' : 'error',
        message: `High failure rate: ${(failureRate * 100).toFixed(1)}% (threshold: ${(this.thresholds.maxFailureRate * 100).toFixed(1)}%)`,
        metric: 'failureRate',
        value: failureRate,
        threshold: this.thresholds.maxFailureRate,
        timestamp: new Date(),
        actionRequired: true,
      });
    }

    // Check retry rate
    if (retryRate >= this.thresholds.maxRetryRate) {
      this.addAlert({
        level: 'warning',
        message: `High retry rate: ${(retryRate * 100).toFixed(1)}% (threshold: ${(this.thresholds.maxRetryRate * 100).toFixed(1)}%)`,
        metric: 'retryRate',
        value: retryRate,
        threshold: this.thresholds.maxRetryRate,
        timestamp: new Date(),
        actionRequired: false,
      });
    }
  }

  /**
   * Check processing rates
   */
  private checkProcessingRates(metrics: QueueMetrics): void {
    const processingRate = metrics.processingRate;

    if (processingRate < this.thresholds.minProcessingRate && metrics.currentQueueSize > 0) {
      this.addAlert({
        level: processingRate === 0 ? 'critical' : 'warning',
        message: `Low processing rate: ${processingRate.toFixed(3)} items/sec (minimum: ${this.thresholds.minProcessingRate})`,
        metric: 'processingRate',
        value: processingRate,
        threshold: this.thresholds.minProcessingRate,
        timestamp: new Date(),
        actionRequired: true,
      });
    }

    // Check for processing rate degradation
    if (this.lastMetrics && this.lastMetrics.processingRate > 0) {
      const degradation = (this.lastMetrics.processingRate - processingRate) / this.lastMetrics.processingRate;
      if (degradation > 0.5) { // 50% degradation
        this.addAlert({
          level: 'warning',
          message: `Processing rate degraded by ${(degradation * 100).toFixed(1)}% since last check`,
          metric: 'processingRateDegradation',
          value: degradation,
          threshold: 0.5,
          timestamp: new Date(),
          actionRequired: false,
        });
      }
    }
  }

  /**
   * Check for stalled processing
   */
  private checkStalledProcessing(metrics: QueueMetrics): void {
    const now = Date.now();
    const timeSinceLastProcessing = this.lastMetrics 
      ? now - this.lastProcessingTime
      : 0;

    // Update last processing time if items were processed
    if (!this.lastMetrics || metrics.totalProcessed > this.lastMetrics.totalProcessed) {
      this.lastProcessingTime = now;
      return;
    }

    // Check if processing has stalled
    if (timeSinceLastProcessing > this.thresholds.stalledProcessingTimeout && metrics.currentQueueSize > 0) {
      this.addAlert({
        level: 'critical',
        message: `Processing appears stalled: no progress for ${Math.round(timeSinceLastProcessing / 1000)}s`,
        metric: 'stalledProcessing',
        value: timeSinceLastProcessing,
        threshold: this.thresholds.stalledProcessingTimeout,
        timestamp: new Date(),
        actionRequired: true,
      });
    }
  }

  /**
   * Calculate overall health score (0-100)
   */
  private calculateHealthScore(metrics: QueueMetrics): void {
    let score = 100;

    // Deduct points for each alert
    for (const alert of this.state.currentAlerts) {
      switch (alert.level) {
        case 'critical':
          score -= 30;
          break;
        case 'error':
          score -= 20;
          break;
        case 'warning':
          score -= 10;
          break;
        case 'info':
          score -= 5;
          break;
      }
    }

    // Bonus points for good performance
    if (metrics.processingRate > this.thresholds.minProcessingRate * 2) {
      score += 5;
    }

    if (metrics.totalFailed === 0 && metrics.totalProcessed > 0) {
      score += 5;
    }

    this.state.healthScore = Math.max(0, Math.min(100, score));
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(_queue: DownloadQueue, metrics: QueueMetrics): void {
    const recommendations: string[] = [];

    // Queue size recommendations
    if (metrics.currentQueueSize > this.thresholds.maxQueueSize * 0.8) {
      recommendations.push('Consider increasing concurrency or batch size to process queue faster');
      recommendations.push('Monitor memory usage and consider queue size limits');
    }

    // Failure rate recommendations
    const totalProcessed = metrics.totalProcessed + metrics.totalFailed;
    if (totalProcessed > 0) {
      const failureRate = metrics.totalFailed / totalProcessed;
      if (failureRate > 0.1) {
        recommendations.push('High failure rate detected - check network connectivity and API limits');
        recommendations.push('Consider implementing exponential backoff for retries');
      }
    }

    // Processing rate recommendations
    if (metrics.processingRate < this.thresholds.minProcessingRate && metrics.currentQueueSize > 0) {
      recommendations.push('Low processing rate - consider increasing concurrency');
      recommendations.push('Check for bottlenecks in page fetching or transformation');
    }

    // Discovery rate recommendations
    if (metrics.discoveryRate > metrics.processingRate * 2) {
      recommendations.push('Discovery rate exceeds processing rate - queue will continue growing');
      recommendations.push('Consider throttling discovery or increasing processing capacity');
    }

    this.state.recommendations = recommendations;
  }

  /**
   * Add alert to current state
   */
  private addAlert(alert: AlertLevel): void {
    this.state.currentAlerts.push(alert);

    // Log alerts
    const logMethod = alert.level === 'critical' ? 'error' : 
                     alert.level === 'error' ? 'error' :
                     alert.level === 'warning' ? 'warn' : 'info';
    
    logger[logMethod]('Queue monitoring alert', {
      level: alert.level,
      metric: alert.metric,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold,
      actionRequired: alert.actionRequired,
    });
  }

  /**
   * Add alert to history
   */
  private addAlertToHistory(alert: AlertLevel): void {
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory = this.alertHistory.slice(0, this.maxAlertHistory);
    }
  }

  /**
   * Get alert history
   */
  getAlertHistory(maxItems = 50): AlertLevel[] {
    return this.alertHistory.slice(0, maxItems);
  }

  /**
   * Get current thresholds
   */
  getThresholds(): MonitoringThresholds {
    return { ...this.thresholds };
  }

  /**
   * Update monitoring thresholds
   */
  updateThresholds(newThresholds: Partial<MonitoringThresholds>): void {
    Object.assign(this.thresholds, newThresholds);
    logger.info('Queue monitoring thresholds updated', newThresholds);
  }

  /**
   * Get monitoring statistics
   */
  getStatistics(): {
    totalAlerts: number;
    alertsByLevel: Record<string, number>;
    avgHealthScore: number;
    checksPerformed: number;
  } {
    const alertsByLevel: Record<string, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };

    for (const alert of this.alertHistory) {
      alertsByLevel[alert.level]++;
    }

    return {
      totalAlerts: this.alertHistory.length,
      alertsByLevel,
      avgHealthScore: this.state.healthScore,
      checksPerformed: this.alertHistory.length, // Approximate
    };
  }

  /**
   * Reset monitoring state
   */
  reset(): void {
    this.state = {
      isHealthy: true,
      currentAlerts: [],
      lastCheckTime: new Date(),
      healthScore: 100,
      recommendations: [],
    };
    this.alertHistory = [];
    this.lastMetrics = null;
    this.lastProcessingTime = Date.now();
    
    logger.info('Queue monitoring state reset');
  }
}

/**
 * Create a queue monitoring service with default thresholds
 */
export function createQueueMonitoring(thresholds?: Partial<MonitoringThresholds>): QueueMonitoringService {
  return new QueueMonitoringService(thresholds);
}

/**
 * Create a conservative monitoring service for large queues
 */
export function createConservativeMonitoring(): QueueMonitoringService {
  return new QueueMonitoringService({
    maxQueueSize: 50000,
    maxProcessingTime: 60000,
    maxFailureRate: 0.1,
    maxRetryRate: 0.05,
    minProcessingRate: 0.05,
    stalledProcessingTimeout: 600000, // 10 minutes
  });
}

/**
 * Create a strict monitoring service for performance-critical scenarios
 */
export function createStrictMonitoring(): QueueMonitoringService {
  return new QueueMonitoringService({
    maxQueueSize: 1000,
    maxProcessingTime: 10000,
    maxFailureRate: 0.05,
    maxRetryRate: 0.02,
    minProcessingRate: 0.5,
    stalledProcessingTimeout: 120000, // 2 minutes
  });
}
