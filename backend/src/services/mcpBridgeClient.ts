import axios, { AxiosInstance, AxiosError } from 'axios';
import { MCPServer, MCPServerConfig, ServerMetrics, APIError } from '@/types';
import config from '@/config';
import logger from '@/utils/logger';

/**
 * MCP Bridge Client Service
 * 
 * This service acts as a READ-ONLY interface to the existing MCP Bridge at 185.163.117.155:3001
 * CRITICAL: This service does NOT modify the existing bridge - it only observes and manages
 * additional metadata in our own database. The existing bridge remains completely intact.
 */
export class MCPBridgeClient {
  private client: AxiosInstance;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.client = axios.create({
      baseURL: config.mcpBridge.baseUrl,
      timeout: config.mcpBridge.timeout,
      headers: {
        'Authorization': `Bearer ${config.mcpBridge.authToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'MCP-Management-WebApp/1.0.0'
      }
    });

    this.setupInterceptors();
    this.startHealthCheck();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('MCP Bridge Request', {
          method: config.method,
          url: config.url,
          timestamp: new Date().toISOString()
        });
        return config;
      },
      (error) => {
        logger.error('MCP Bridge Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('MCP Bridge Response', {
          status: response.status,
          url: response.config.url,
          timestamp: new Date().toISOString()
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('MCP Bridge Response Error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: AxiosError): APIError {
    if (error.response) {
      return new APIError(
        `MCP Bridge Error: ${error.response.data || error.message}`,
        error.response.status,
        'MCP_BRIDGE_ERROR'
      );
    } else if (error.request) {
      return new APIError(
        'MCP Bridge is unreachable',
        503,
        'MCP_BRIDGE_UNREACHABLE'
      );
    } else {
      return new APIError(
        `MCP Bridge Request Error: ${error.message}`,
        500,
        'MCP_BRIDGE_REQUEST_ERROR'
      );
    }
  }

  /**
   * HEALTH CHECK - Monitor existing bridge without modification
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.warn('MCP Bridge health check failed', { error });
      return false;
    }
  }

  /**
   * GET SERVER STATUS - Read-only access to existing bridge servers
   */
  async getServerStatus(): Promise<any> {
    try {
      const response = await this.client.get('/status');
      return response.data;
    } catch (error) {
      logger.error('Failed to get MCP Bridge status', { error });
      throw error;
    }
  }

  /**
   * GET METRICS - Read-only metrics from existing bridge
   */
  async getMetrics(timeRange?: { start: Date; end: Date }): Promise<any> {
    try {
      const params = timeRange ? {
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString()
      } : {};

      const response = await this.client.get('/metrics', { params });
      return response.data;
    } catch (error) {
      logger.error('Failed to get MCP Bridge metrics', { error });
      throw error;
    }
  }

  /**
   * GET MEMORY OPERATIONS - Read-only access to memory operations
   */
  async getMemoryOperations(limit: number = 100): Promise<any> {
    try {
      const response = await this.client.get('/memory/operations', {
        params: { limit }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to get memory operations', { error });
      throw error;
    }
  }

  /**
   * GET ACTIVE CONNECTIONS - Monitor WebSocket connections
   */
  async getActiveConnections(): Promise<any> {
    try {
      const response = await this.client.get('/connections');
      return response.data;
    } catch (error) {
      logger.error('Failed to get active connections', { error });
      throw error;
    }
  }

  /**
   * GET SEMANTIC SEARCH STATS - Read-only semantic search metrics
   */
  async getSemanticSearchStats(): Promise<any> {
    try {
      const response = await this.client.get('/semantic/stats');
      return response.data;
    } catch (error) {
      logger.error('Failed to get semantic search stats', { error });
      throw error;
    }
  }

  /**
   * GET SYSTEM INFO - Read-only system information
   */
  async getSystemInfo(): Promise<any> {
    try {
      const response = await this.client.get('/system/info');
      return response.data;
    } catch (error) {
      logger.error('Failed to get system info', { error });
      throw error;
    }
  }

  /**
   * START HEALTH CHECK - Continuous monitoring without disruption
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        logger.warn('Health check failed', { error });
      }
    }, config.mcpBridge.healthCheckInterval);
  }

  /**
   * STOP HEALTH CHECK - Clean shutdown
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * AGGREGATE BRIDGE DATA - Combine bridge data with our metadata
   * This method safely aggregates read-only data from the bridge
   */
  async aggregateBridgeData(): Promise<{
    health: boolean;
    status: any;
    metrics: any;
    activeConnections: number;
    memoryOperations: number;
    semanticSearches: number;
    uptime: number;
  }> {
    try {
      const [
        health,
        status,
        metrics,
        connections,
        memoryOps,
        semanticStats,
        systemInfo
      ] = await Promise.allSettled([
        this.checkHealth(),
        this.getServerStatus(),
        this.getMetrics(),
        this.getActiveConnections(),
        this.getMemoryOperations(10),
        this.getSemanticSearchStats(),
        this.getSystemInfo()
      ]);

      return {
        health: health.status === 'fulfilled' ? health.value : false,
        status: status.status === 'fulfilled' ? status.value : null,
        metrics: metrics.status === 'fulfilled' ? metrics.value : null,
        activeConnections: connections.status === 'fulfilled' 
          ? (connections.value?.length || 0) : 0,
        memoryOperations: memoryOps.status === 'fulfilled' 
          ? (memoryOps.value?.length || 0) : 0,
        semanticSearches: semanticStats.status === 'fulfilled' 
          ? (semanticStats.value?.totalSearches || 0) : 0,
        uptime: systemInfo.status === 'fulfilled' 
          ? (systemInfo.value?.uptime || 0) : 0
      };
    } catch (error) {
      logger.error('Failed to aggregate bridge data', { error });
      throw new APIError('Failed to collect bridge data', 503, 'BRIDGE_AGGREGATION_ERROR');
    }
  }

  /**
   * TEST CONNECTION - Verify bridge connectivity without impact
   */
  async testConnection(): Promise<{
    connected: boolean;
    responseTime: number;
    version?: string;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.get('/health');
      const responseTime = Date.now() - startTime;
      
      return {
        connected: true,
        responseTime,
        version: response.data?.version || 'unknown'
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        connected: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * CLEAN SHUTDOWN - Properly close connections
   */
  async shutdown(): Promise<void> {
    this.stopHealthCheck();
    logger.info('MCP Bridge Client shutdown complete');
  }
}

// Singleton instance
let mcpBridgeClient: MCPBridgeClient | null = null;

export const getMCPBridgeClient = (): MCPBridgeClient => {
  if (!mcpBridgeClient) {
    mcpBridgeClient = new MCPBridgeClient();
  }
  return mcpBridgeClient;
};

export const shutdownMCPBridgeClient = async (): Promise<void> => {
  if (mcpBridgeClient) {
    await mcpBridgeClient.shutdown();
    mcpBridgeClient = null;
  }
};

export default MCPBridgeClient;