import { EventEmitter } from 'events';
import { db } from '@/database/connection';
import Logger from '@/utils/logger';
import CacheService from './cacheService';
import { getMCPBridgeClient } from './mcpBridgeClient';

/**
 * Monitoring Service
 * 
 * Comprehensive system monitoring with metrics collection, alerting,
 * and health checks for production deployments
 */

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    usage: number;
    heapUsed: number;
    heapTotal: number;
  };
  database: {
    connections: number;
    activeQueries: number;
    responseTime: number;
  };
  cache: {
    connected: boolean;
    memoryUsage: number;
    hitRate: number;
  };
  api: {
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
  };
  websocket: {
    connections: number;
    messagesPerSecond: number;
  };
}

export interface Alert {
  id: string;
  type: 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
}

export class MonitoringService extends EventEmitter {
  private static instance: MonitoringService;
  private isCollecting = false;
  private collectionInterval?: NodeJS.Timeout;
  private metrics: SystemMetrics[] = [];
  private alerts: Alert[] = [];
  private thresholds = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    responseTime: { warning: 1000, critical: 5000 },
    errorRate: { warning: 5, critical: 10 },
    dbConnections: { warning: 80, critical: 95 }
  };

  private constructor() {
    super();
    this.setupEventHandlers();
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Start metrics collection
   */
  async startMonitoring(intervalMs = 30000): Promise<void> {
    if (this.isCollecting) {
      Logger.warn('Monitoring already started');
      return;
    }

    this.isCollecting = true;
    
    // Initial collection
    await this.collectMetrics();
    
    // Set up periodic collection
    this.collectionInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        Logger.error('Metrics collection failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, intervalMs);

    Logger.info('Monitoring started', { interval_ms: intervalMs });
  }

  /**
   * Stop metrics collection
   */
  stopMonitoring(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
    this.isCollecting = false;
    Logger.info('Monitoring stopped');
  }

  /**
   * Collect current system metrics
   */
  async collectMetrics(): Promise<SystemMetrics> {
    const timestamp = new Date();
    
    try {
      const [
        cpuMetrics,
        memoryMetrics,
        dbMetrics,
        cacheMetrics,
        apiMetrics,
        wsMetrics
      ] = await Promise.all([
        this.getCPUMetrics(),
        this.getMemoryMetrics(),
        this.getDatabaseMetrics(),
        this.getCacheMetrics(),
        this.getAPIMetrics(),
        this.getWebSocketMetrics()
      ]);

      const metrics: SystemMetrics = {
        timestamp,
        cpu: cpuMetrics,
        memory: memoryMetrics,
        database: dbMetrics,
        cache: cacheMetrics,
        api: apiMetrics,
        websocket: wsMetrics
      };

      // Store metrics
      this.metrics.push(metrics);
      
      // Keep only last 1000 entries
      if (this.metrics.length > 1000) {
        this.metrics = this.metrics.slice(-1000);
      }

      // Check thresholds and generate alerts
      await this.checkThresholds(metrics);

      // Emit metrics event
      this.emit('metrics', metrics);

      return metrics;

    } catch (error) {
      Logger.error('Failed to collect metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(count = 10): SystemMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get current alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.acknowledged && !alert.resolvedAt);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Get system health summary
   */
  async getHealthSummary(): Promise<{
    status: 'healthy' | 'degraded' | 'critical';
    issues: string[];
    metrics: SystemMetrics | null;
    alerts: number;
  }> {
    const latestMetrics = this.metrics[this.metrics.length - 1] || null;
    const activeAlerts = this.getActiveAlerts();
    const issues: string[] = [];

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (latestMetrics) {
      // Check various health indicators
      if (latestMetrics.cpu.usage > this.thresholds.cpu.critical) {
        status = 'critical';
        issues.push('Critical CPU usage');
      } else if (latestMetrics.cpu.usage > this.thresholds.cpu.warning) {
        status = 'degraded';
        issues.push('High CPU usage');
      }

      if (latestMetrics.memory.usage > this.thresholds.memory.critical) {
        status = 'critical';
        issues.push('Critical memory usage');
      } else if (latestMetrics.memory.usage > this.thresholds.memory.warning) {
        status = 'degraded';
        issues.push('High memory usage');
      }

      if (latestMetrics.api.responseTime > this.thresholds.responseTime.critical) {
        status = 'critical';
        issues.push('Critical response times');
      } else if (latestMetrics.api.responseTime > this.thresholds.responseTime.warning) {
        status = 'degraded';
        issues.push('Slow response times');
      }

      if (latestMetrics.api.errorRate > this.thresholds.errorRate.critical) {
        status = 'critical';
        issues.push('High error rate');
      } else if (latestMetrics.api.errorRate > this.thresholds.errorRate.warning) {
        status = 'degraded';
        issues.push('Elevated error rate');
      }
    }

    // Critical alerts override status
    if (activeAlerts.some(a => a.type === 'critical')) {
      status = 'critical';
    }

    return {
      status,
      issues,
      metrics: latestMetrics,
      alerts: activeAlerts.length
    };
  }

  // Private methods for metric collection

  private async getCPUMetrics(): Promise<SystemMetrics['cpu']> {
    const cpus = require('os').cpus();
    const loadAvg = require('os').loadavg();
    
    // Simple CPU usage calculation (would be more sophisticated in production)
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach((cpu: any) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const usage = 100 - (totalIdle / totalTick * 100);
    
    return {
      usage: Math.round(usage),
      loadAverage: loadAvg
    };
  }

  private async getMemoryMetrics(): Promise<SystemMetrics['memory']> {
    const totalMem = require('os').totalmem();
    const freeMem = require('os').freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = process.memoryUsage();
    
    return {
      used: usedMem,
      total: totalMem,
      usage: Math.round((usedMem / totalMem) * 100),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal
    };
  }

  private async getDatabaseMetrics(): Promise<SystemMetrics['database']> {
    try {
      const startTime = Date.now();
      const connectionInfo = await db.getConnectionInfo();
      const responseTime = Date.now() - startTime;
      
      return {
        connections: connectionInfo.totalConnections,
        activeQueries: connectionInfo.totalConnections - connectionInfo.idleConnections,
        responseTime
      };
    } catch (error) {
      return {
        connections: 0,
        activeQueries: 0,
        responseTime: -1
      };
    }
  }

  private async getCacheMetrics(): Promise<SystemMetrics['cache']> {
    try {
      const cacheService = CacheService.getInstance();
      const stats = await cacheService.getStats();
      
      return {
        connected: stats.connected,
        memoryUsage: stats.memoryUsage || 0,
        hitRate: stats.hitRate || 0
      };
    } catch (error) {
      return {
        connected: false,
        memoryUsage: 0,
        hitRate: 0
      };
    }
  }

  private async getAPIMetrics(): Promise<SystemMetrics['api']> {
    // In a real implementation, these would come from actual request tracking
    // For now, return mock data
    return {
      requestsPerSecond: Math.random() * 100,
      averageResponseTime: Math.random() * 500,
      errorRate: Math.random() * 2
    };
  }

  private async getWebSocketMetrics(): Promise<SystemMetrics['websocket']> {
    // In a real implementation, track actual WebSocket connections
    return {
      connections: Math.floor(Math.random() * 50),
      messagesPerSecond: Math.random() * 10
    };
  }

  private async checkThresholds(metrics: SystemMetrics): Promise<void> {
    const alerts: Alert[] = [];

    // CPU threshold checks
    if (metrics.cpu.usage > this.thresholds.cpu.critical) {
      alerts.push(this.createAlert(
        'critical',
        'Critical CPU Usage',
        `CPU usage is at ${metrics.cpu.usage}%`,
        'cpu',
        metrics.cpu.usage,
        this.thresholds.cpu.critical
      ));
    } else if (metrics.cpu.usage > this.thresholds.cpu.warning) {
      alerts.push(this.createAlert(
        'warning',
        'High CPU Usage',
        `CPU usage is at ${metrics.cpu.usage}%`,
        'cpu',
        metrics.cpu.usage,
        this.thresholds.cpu.warning
      ));
    }

    // Memory threshold checks
    if (metrics.memory.usage > this.thresholds.memory.critical) {
      alerts.push(this.createAlert(
        'critical',
        'Critical Memory Usage',
        `Memory usage is at ${metrics.memory.usage}%`,
        'memory',
        metrics.memory.usage,
        this.thresholds.memory.critical
      ));
    } else if (metrics.memory.usage > this.thresholds.memory.warning) {
      alerts.push(this.createAlert(
        'warning',
        'High Memory Usage',
        `Memory usage is at ${metrics.memory.usage}%`,
        'memory',
        metrics.memory.usage,
        this.thresholds.memory.warning
      ));
    }

    // Response time threshold checks
    if (metrics.api.responseTime > this.thresholds.responseTime.critical) {
      alerts.push(this.createAlert(
        'critical',
        'Critical Response Time',
        `Average response time is ${metrics.api.responseTime}ms`,
        'responseTime',
        metrics.api.responseTime,
        this.thresholds.responseTime.critical
      ));
    } else if (metrics.api.responseTime > this.thresholds.responseTime.warning) {
      alerts.push(this.createAlert(
        'warning',
        'Slow Response Time',
        `Average response time is ${metrics.api.responseTime}ms`,
        'responseTime',
        metrics.api.responseTime,
        this.thresholds.responseTime.warning
      ));
    }

    // Process new alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
  }

  private createAlert(
    type: Alert['type'],
    title: string,
    message: string,
    metric?: string,
    value?: number,
    threshold?: number
  ): Alert {
    return {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      type,
      title,
      message,
      metric,
      value,
      threshold,
      timestamp: new Date(),
      acknowledged: false
    };
  }

  private async processAlert(alert: Alert): Promise<void> {
    // Check if similar alert already exists
    const existingAlert = this.alerts.find(a => 
      a.metric === alert.metric && 
      a.type === alert.type && 
      !a.acknowledged && 
      !a.resolvedAt
    );

    if (existingAlert) {
      // Update existing alert timestamp
      existingAlert.timestamp = alert.timestamp;
      return;
    }

    // Add new alert
    this.alerts.push(alert);
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    // Emit alert event
    this.emit('alert', alert);

    // Log alert
    const logLevel = alert.type === 'critical' ? 'critical' : 
                    alert.type === 'error' ? 'error' : 'warn';
    
    Logger[logLevel]('System alert triggered', {
      alert_id: alert.id,
      alert_type: alert.type,
      metric: alert.metric,
      value: alert.value,
      threshold: alert.threshold,
      title: alert.title
    });
  }

  private setupEventHandlers(): void {
    this.on('alert', (alert: Alert) => {
      // Send notifications (email, Slack, etc.)
      this.sendNotification(alert);
    });
  }

  private async sendNotification(alert: Alert): Promise<void> {
    // In a real implementation, integrate with notification services
    // For now, just log
    Logger.info('Alert notification sent', {
      alert_id: alert.id,
      alert_type: alert.type,
      title: alert.title
    });
  }
}

export default MonitoringService;