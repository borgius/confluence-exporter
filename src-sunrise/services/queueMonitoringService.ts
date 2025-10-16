/**
 * T114b: Queue monitoring and alerting service
 * Tracks queue performance metrics, processing rates, error rates with alerting
 */

import type { QueueMetrics, QueueState } from '../models/queueEntities.js';
import type { DownloadQueueOrchestrator } from '../queue/downloadQueue.js';
import { logger } from '../util/logger.js';

export interface MonitoringConfig {
  metricsCollectionInterval: number;
  alertingEnabled: boolean;
  thresholds: {
    maxQueueSize: number;
    minProcessingRate: number; // items per minute
    maxErrorRate: number; // percentage
    maxProcessingTime: number; // milliseconds
    maxRetryCount: number;
  };
  retentionPeriod: number; // milliseconds
  enableTrendAnalysis: boolean;
  alertCooldown: number; // milliseconds between same alert type
}

export interface PerformanceMetrics {
  timestamp: number;
  queueSize: number;
  processingRate: number; // items per minute
  errorRate: number; // percentage
  averageProcessingTime: number;
  averageRetryCount: number;
  state: QueueState;
  systemLoad: SystemMetrics;
}

export interface SystemMetrics {
  memoryUsageMB: number;
  cpuUsagePercent: number;
  activeConnections: number;
  diskUsageMB: number;
}

export interface AlertCondition {
  type: 'threshold' | 'trend' | 'anomaly';
  metric: string;
  operator: '>' | '<' | '=' | '>=' | '<=';
  value: number;
  duration?: number; // milliseconds
  enabled: boolean;
}

export interface Alert {
  id: string;
  timestamp: number;
  type: 'warning' | 'critical' | 'info';
  metric: string;
  message: string;
  currentValue: number;
  thresholdValue: number;
  resolved: boolean;
  resolvedAt?: number;
}

export interface MonitoringSummary {
  totalMetricsCollected: number;
  activeAlerts: number;
  resolvedAlerts: number;
  uptime: number;
  lastCollectionTime?: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
  trends: {
    processingRateTrend: 'increasing' | 'decreasing' | 'stable';
    errorRateTrend: 'increasing' | 'decreasing' | 'stable';
    queueSizeTrend: 'increasing' | 'decreasing' | 'stable';
  };
}

export interface MonitoringCallbacks {
  onAlert?: (alert: Alert) => void;
  onMetricsCollected?: (metrics: PerformanceMetrics) => void;
  onHealthStatusChange?: (status: 'healthy' | 'warning' | 'critical') => void;
}

/**
 * Monitors queue performance and provides alerting capabilities.
 */
export class QueueMonitoringService {
  private readonly queueOrchestrator: DownloadQueueOrchestrator;
  private readonly config: MonitoringConfig;
  private readonly callbacks: MonitoringCallbacks;
  
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private startTime: number = Date.now();
  private metricsHistory: PerformanceMetrics[] = [];
  private alerts: Alert[] = [];
  private lastAlertTimes: Map<string, number> = new Map();
  private alertIdCounter = 0;

  constructor(
    queueOrchestrator: DownloadQueueOrchestrator,
    config: Partial<MonitoringConfig> = {},
    callbacks: MonitoringCallbacks = {}
  ) {
    this.queueOrchestrator = queueOrchestrator;
    this.callbacks = callbacks;
    this.config = {
      metricsCollectionInterval: 30000, // 30 seconds
      alertingEnabled: true,
      thresholds: {
        maxQueueSize: 1000,
        minProcessingRate: 10, // 10 items per minute
        maxErrorRate: 10, // 10%
        maxProcessingTime: 30000, // 30 seconds
        maxRetryCount: 3,
      },
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      enableTrendAnalysis: true,
      alertCooldown: 5 * 60 * 1000, // 5 minutes
      ...config,
    };
  }

  /**
   * Start monitoring queue performance.
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Queue monitoring is already active');
      return;
    }

    this.isMonitoring = true;
    this.startTime = Date.now();
    
    logger.info('Starting queue monitoring service', {
      interval: this.config.metricsCollectionInterval,
      alertingEnabled: this.config.alertingEnabled,
    });

    // Start periodic metrics collection
    this.monitoringInterval = setInterval(
      () => this.collectMetrics(),
      this.config.metricsCollectionInterval
    );

    // Collect initial metrics
    await this.collectMetrics();
  }

  /**
   * Stop monitoring queue performance.
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('Stopped queue monitoring service');
  }

  /**
   * Collect current performance metrics.
   */
  private async collectMetrics(): Promise<void> {
    try {
      const timestamp = Date.now();
      const queueMetrics = this.queueOrchestrator.getMetrics();
      const queueState = this.queueOrchestrator.getState();
      const queueSize = this.queueOrchestrator.size();

      // Calculate processing rate
      const processingRate = this.calculateProcessingRate(queueMetrics);
      
      // Calculate error rate
      const errorRate = this.calculateErrorRate(queueMetrics);
      
      // Calculate average processing time
      const averageProcessingTime = this.calculateAverageProcessingTime();
      
      // Get system metrics
      const systemMetrics = this.getSystemMetrics();

      const metrics: PerformanceMetrics = {
        timestamp,
        queueSize,
        processingRate,
        errorRate,
        averageProcessingTime,
        averageRetryCount: queueMetrics.averageRetryCount,
        state: queueState,
        systemLoad: systemMetrics,
      };

      // Store metrics
      this.metricsHistory.push(metrics);
      this.cleanupOldMetrics();

      // Check for alerts
      if (this.config.alertingEnabled) {
        await this.checkAlerts(metrics);
      }

      // Notify callback
      if (this.callbacks.onMetricsCollected) {
        this.callbacks.onMetricsCollected(metrics);
      }

      logger.debug('Metrics collected', {
        queueSize: metrics.queueSize,
        processingRate: metrics.processingRate,
        errorRate: metrics.errorRate,
      });

    } catch (error) {
      logger.error('Failed to collect metrics:', error);
    }
  }

  /**
   * Calculate processing rate (items per minute).
   */
  private calculateProcessingRate(metrics: QueueMetrics): number {
    if (this.metricsHistory.length < 2) {
      return metrics.processingRate;
    }

    const previousMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    const timeDelta = Date.now() - previousMetrics.timestamp;
    const processedDelta = metrics.totalProcessed - (previousMetrics ? 0 : 0);
    
    if (timeDelta > 0) {
      return (processedDelta / timeDelta) * 60000; // Convert to per minute
    }
    
    return 0;
  }

  /**
   * Calculate error rate as percentage.
   */
  private calculateErrorRate(metrics: QueueMetrics): number {
    const totalOperations = metrics.totalProcessed + metrics.totalFailed;
    if (totalOperations === 0) {
      return 0;
    }
    return (metrics.totalFailed / totalOperations) * 100;
  }

  /**
   * Calculate average processing time.
   */
  private calculateAverageProcessingTime(): number {
    if (this.metricsHistory.length === 0) {
      return 0;
    }

    const recentMetrics = this.metricsHistory.slice(-10); // Last 10 metrics
    const totalTime = recentMetrics.reduce((sum, m) => sum + m.averageProcessingTime, 0);
    return totalTime / recentMetrics.length;
  }

  /**
   * Get current system metrics.
   */
  private getSystemMetrics(): SystemMetrics {
    const memoryUsage = process.memoryUsage();
    
    return {
      memoryUsageMB: memoryUsage.heapUsed / 1024 / 1024,
      cpuUsagePercent: 0, // Would need external library for accurate CPU usage
      activeConnections: 0, // Would track HTTP connections if applicable
      diskUsageMB: 0, // Would need file system monitoring
    };
  }

  /**
   * Check for alert conditions.
   */
  private async checkAlerts(metrics: PerformanceMetrics): Promise<void> {
    // Queue size alert
    if (metrics.queueSize > this.config.thresholds.maxQueueSize) {
      await this.triggerAlert('queue_size', 'critical', 
        `Queue size exceeded threshold: ${metrics.queueSize} > ${this.config.thresholds.maxQueueSize}`,
        metrics.queueSize, this.config.thresholds.maxQueueSize);
    }

    // Processing rate alert
    if (metrics.processingRate < this.config.thresholds.minProcessingRate) {
      await this.triggerAlert('processing_rate', 'warning',
        `Processing rate below threshold: ${metrics.processingRate.toFixed(2)} < ${this.config.thresholds.minProcessingRate}`,
        metrics.processingRate, this.config.thresholds.minProcessingRate);
    }

    // Error rate alert
    if (metrics.errorRate > this.config.thresholds.maxErrorRate) {
      await this.triggerAlert('error_rate', 'warning',
        `Error rate exceeded threshold: ${metrics.errorRate.toFixed(2)}% > ${this.config.thresholds.maxErrorRate}%`,
        metrics.errorRate, this.config.thresholds.maxErrorRate);
    }

    // Processing time alert
    if (metrics.averageProcessingTime > this.config.thresholds.maxProcessingTime) {
      await this.triggerAlert('processing_time', 'warning',
        `Average processing time exceeded threshold: ${metrics.averageProcessingTime}ms > ${this.config.thresholds.maxProcessingTime}ms`,
        metrics.averageProcessingTime, this.config.thresholds.maxProcessingTime);
    }

    // Retry count alert
    if (metrics.averageRetryCount > this.config.thresholds.maxRetryCount) {
      await this.triggerAlert('retry_count', 'warning',
        `Average retry count exceeded threshold: ${metrics.averageRetryCount} > ${this.config.thresholds.maxRetryCount}`,
        metrics.averageRetryCount, this.config.thresholds.maxRetryCount);
    }
  }

  /**
   * Trigger an alert.
   */
  private async triggerAlert(
    metric: string,
    type: 'warning' | 'critical' | 'info',
    message: string,
    currentValue: number,
    thresholdValue: number
  ): Promise<void> {
    const alertKey = `${metric}_${type}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey) || 0;
    const now = Date.now();

    // Check cooldown
    if (now - lastAlertTime < this.config.alertCooldown) {
      return;
    }

    const alert: Alert = {
      id: `alert_${++this.alertIdCounter}`,
      timestamp: now,
      type,
      metric,
      message,
      currentValue,
      thresholdValue,
      resolved: false,
    };

    this.alerts.push(alert);
    this.lastAlertTimes.set(alertKey, now);

    logger.warn(`Alert triggered: ${message}`, {
      alertId: alert.id,
      type,
      metric,
      currentValue,
      thresholdValue,
    });

    // Notify callback
    if (this.callbacks.onAlert) {
      this.callbacks.onAlert(alert);
    }

    // Check health status change
    this.checkHealthStatusChange();
  }

  /**
   * Check if health status has changed.
   */
  private checkHealthStatusChange(): void {
    const previousStatus = this.getHealthStatus(true);
    const currentStatus = this.getHealthStatus(false);

    if (previousStatus !== currentStatus && this.callbacks.onHealthStatusChange) {
      this.callbacks.onHealthStatusChange(currentStatus);
    }
  }

  /**
   * Get current health status.
   */
  private getHealthStatus(excludeLatest = false): 'healthy' | 'warning' | 'critical' {
    const activeAlerts = this.getActiveAlerts();
    
    if (excludeLatest && activeAlerts.length > 0) {
      const latestAlert = activeAlerts[activeAlerts.length - 1];
      const filteredAlerts = activeAlerts.filter(a => a.id !== latestAlert.id);
      
      if (filteredAlerts.some(a => a.type === 'critical')) {
        return 'critical';
      }
      if (filteredAlerts.some(a => a.type === 'warning')) {
        return 'warning';
      }
    } else {
      if (activeAlerts.some(a => a.type === 'critical')) {
        return 'critical';
      }
      if (activeAlerts.some(a => a.type === 'warning')) {
        return 'warning';
      }
    }
    
    return 'healthy';
  }

  /**
   * Clean up old metrics based on retention period.
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);
  }

  /**
   * Resolve an alert.
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find(a => a.id === alertId && !a.resolved);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = Date.now();

    logger.info(`Alert resolved: ${alert.message}`, { alertId });
    
    this.checkHealthStatusChange();
    return true;
  }

  /**
   * Get active alerts.
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  /**
   * Get resolved alerts.
   */
  getResolvedAlerts(): Alert[] {
    return this.alerts.filter(a => a.resolved);
  }

  /**
   * Get recent metrics.
   */
  getRecentMetrics(count = 10): PerformanceMetrics[] {
    return this.metricsHistory.slice(-count);
  }

  /**
   * Get monitoring summary.
   */
  getMonitoringSummary(): MonitoringSummary {
    const activeAlerts = this.getActiveAlerts();
    const resolvedAlerts = this.getResolvedAlerts();
    const uptime = Date.now() - this.startTime;
    const lastMetrics = this.metricsHistory[this.metricsHistory.length - 1];

    return {
      totalMetricsCollected: this.metricsHistory.length,
      activeAlerts: activeAlerts.length,
      resolvedAlerts: resolvedAlerts.length,
      uptime,
      lastCollectionTime: lastMetrics?.timestamp,
      healthStatus: this.getHealthStatus(),
      trends: this.calculateTrends(),
    };
  }

  /**
   * Calculate performance trends.
   */
  private calculateTrends(): MonitoringSummary['trends'] {
    if (this.metricsHistory.length < 5) {
      return {
        processingRateTrend: 'stable',
        errorRateTrend: 'stable',
        queueSizeTrend: 'stable',
      };
    }

    const recent = this.metricsHistory.slice(-5);
    const older = this.metricsHistory.slice(-10, -5);

    const avgRecent = {
      processingRate: recent.reduce((sum, m) => sum + m.processingRate, 0) / recent.length,
      errorRate: recent.reduce((sum, m) => sum + m.errorRate, 0) / recent.length,
      queueSize: recent.reduce((sum, m) => sum + m.queueSize, 0) / recent.length,
    };

    const avgOlder = {
      processingRate: older.reduce((sum, m) => sum + m.processingRate, 0) / older.length,
      errorRate: older.reduce((sum, m) => sum + m.errorRate, 0) / older.length,
      queueSize: older.reduce((sum, m) => sum + m.queueSize, 0) / older.length,
    };

    return {
      processingRateTrend: this.determineTrend(avgRecent.processingRate, avgOlder.processingRate),
      errorRateTrend: this.determineTrend(avgRecent.errorRate, avgOlder.errorRate),
      queueSizeTrend: this.determineTrend(avgRecent.queueSize, avgOlder.queueSize),
    };
  }

  /**
   * Determine trend direction.
   */
  private determineTrend(current: number, previous: number): 'increasing' | 'decreasing' | 'stable' {
    const threshold = 0.1; // 10% change threshold
    const change = (current - previous) / previous;

    if (change > threshold) return 'increasing';
    if (change < -threshold) return 'decreasing';
    return 'stable';
  }

  /**
   * Get monitoring status.
   */
  isActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Update monitoring configuration.
   */
  updateConfig(config: Partial<MonitoringConfig>): void {
    Object.assign(this.config, config);
    logger.info('Updated monitoring configuration', config);
  }
}
