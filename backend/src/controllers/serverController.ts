import { Request, Response } from 'express';
import { MCPServer, MCPServerConfig, ApiResponse, PaginatedResponse } from '@/types';
import { getMCPBridgeClient } from '@/services/mcpBridgeClient';
import { ServerRepository } from '@/repositories/serverRepository';
import Logger from '@/utils/logger';
import { z } from 'zod';

/**
 * MCP Server Management Controller
 * 
 * Manages the metadata layer for MCP servers while maintaining
 * read-only access to the existing MCP Bridge at 185.163.117.155:3001
 * 
 * CRITICAL: This controller does NOT modify the existing bridge servers
 * It only manages our own metadata and observes the bridge
 */

// Validation schemas
const CreateServerSchema = z.object({
  name: z.string().min(1).max(255),
  displayName: z.string().optional(),
  description: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).default('production'),
  tags: z.array(z.string()).default([]),
  ownerTeam: z.string().optional(),
  maintenanceWindow: z.object({
    start: z.string(),
    end: z.string(),
    timezone: z.string().default('UTC')
  }).optional(),
  healthCheckEnabled: z.boolean().default(true),
  healthCheckInterval: z.number().min(10).max(3600).default(30),
  alertThresholds: z.object({
    responseTime: z.number().optional(),
    errorRate: z.number().min(0).max(1).optional(),
    availability: z.number().min(0).max(1).optional()
  }).default({})
});

const UpdateServerSchema = CreateServerSchema.partial();

const QuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  environment: z.enum(['development', 'staging', 'production']).optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  tags: z.string().optional().transform(val => val ? val.split(',') : undefined)
});

export class ServerController {
  private serverRepository: ServerRepository;
  private mcpBridge: any;

  constructor() {
    this.serverRepository = new ServerRepository();
    this.mcpBridge = getMCPBridgeClient();
  }

  /**
   * GET /api/servers - List all managed servers with bridge status
   */
  public getServers = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = QuerySchema.parse(req.query);
      
      Logger.api('Fetching servers list', req.requestId, {
        user_id: req.user?.id,
        query: query
      });

      // Get managed servers from our database
      const managedServers = await this.serverRepository.findAll({
        page: query.page,
        limit: query.limit,
        environment: query.environment,
        status: query.status,
        search: query.search,
        tags: query.tags
      }, req.requestId);

      // Get real-time status from MCP Bridge (read-only)
      let bridgeData = null;
      try {
        bridgeData = await this.mcpBridge.aggregateBridgeData();
      } catch (error) {
        Logger.warn('Failed to get bridge data, continuing with managed servers only', {
          error: error instanceof Error ? error.message : 'Unknown error',
          request_id: req.requestId
        });
      }

      // Enhance managed servers with bridge data
      const enhancedServers = managedServers.data.map(server => ({
        ...server,
        bridgeStatus: bridgeData ? {
          connected: bridgeData.health,
          lastSeen: new Date(),
          metrics: bridgeData.metrics
        } : null
      }));

      const response: ApiResponse<PaginatedResponse<MCPServer>> = {
        success: true,
        data: {
          data: enhancedServers,
          pagination: managedServers.pagination
        },
        message: 'Servers retrieved successfully',
        timestamp: new Date().toISOString(),
        requestId: req.requestId!
      };

      Logger.api('Servers list retrieved', req.requestId, {
        user_id: req.user?.id,
        count: enhancedServers.length,
        bridge_connected: bridgeData?.health || false
      });

      res.status(200).json(response);

    } catch (error) {
      Logger.error('Failed to get servers', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve servers',
        requestId: req.requestId
      });
    }
  };

  /**
   * GET /api/servers/:id - Get specific server with real-time bridge data
   */
  public getServerById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      Logger.api('Fetching server by ID', req.requestId, {
        user_id: req.user?.id,
        server_id: id
      });

      // Get managed server from our database
      const server = await this.serverRepository.findById(id, req.requestId);
      
      if (!server) {
        res.status(404).json({
          success: false,
          error: 'Server not found',
          requestId: req.requestId
        });
        return;
      }

      // Get real-time bridge data for this server
      let bridgeData = null;
      try {
        bridgeData = await this.mcpBridge.aggregateBridgeData();
        
        // Get specific metrics if server is connected to bridge
        if (server.bridgeServerId && bridgeData.health) {
          // This would get server-specific data from bridge
          // For now, use aggregated data
        }
      } catch (error) {
        Logger.warn('Failed to get bridge data for server', {
          error: error instanceof Error ? error.message : 'Unknown error',
          server_id: id,
          request_id: req.requestId
        });
      }

      const enhancedServer = {
        ...server,
        bridgeStatus: bridgeData ? {
          connected: bridgeData.health,
          lastSeen: new Date(),
          metrics: bridgeData.metrics,
          activeConnections: bridgeData.activeConnections,
          memoryOperations: bridgeData.memoryOperations
        } : null
      };

      const response: ApiResponse<MCPServer> = {
        success: true,
        data: enhancedServer,
        message: 'Server retrieved successfully',
        timestamp: new Date().toISOString(),
        requestId: req.requestId!
      };

      res.status(200).json(response);

    } catch (error) {
      Logger.error('Failed to get server by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        server_id: req.params.id,
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve server',
        requestId: req.requestId
      });
    }
  };

  /**
   * POST /api/servers - Create new managed server (metadata only)
   */
  public createServer = async (req: Request, res: Response): Promise<void> => {
    try {
      const serverData = CreateServerSchema.parse(req.body);
      
      Logger.api('Creating new managed server', req.requestId, {
        user_id: req.user?.id,
        server_name: serverData.name
      });

      // Check if server name already exists
      const existingServer = await this.serverRepository.findByName(serverData.name, req.requestId);
      if (existingServer) {
        res.status(409).json({
          success: false,
          error: 'Server with this name already exists',
          requestId: req.requestId
        });
        return;
      }

      // Create server in our management database
      const newServer = await this.serverRepository.create({
        ...serverData,
        createdBy: req.user!.id,
        observedStatus: 'unknown' // Will be updated by monitoring
      }, req.requestId);

      Logger.audit('Server created', {
        user_id: req.user?.id,
        server_id: newServer.id,
        server_name: newServer.name,
        request_id: req.requestId
      });

      const response: ApiResponse<MCPServer> = {
        success: true,
        data: newServer,
        message: 'Server created successfully',
        timestamp: new Date().toISOString(),
        requestId: req.requestId!
      };

      res.status(201).json(response);

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
          requestId: req.requestId
        });
        return;
      }

      Logger.error('Failed to create server', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create server',
        requestId: req.requestId
      });
    }
  };

  /**
   * PUT /api/servers/:id - Update managed server metadata
   */
  public updateServer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = UpdateServerSchema.parse(req.body);
      
      Logger.api('Updating managed server', req.requestId, {
        user_id: req.user?.id,
        server_id: id
      });

      // Check if server exists
      const existingServer = await this.serverRepository.findById(id, req.requestId);
      if (!existingServer) {
        res.status(404).json({
          success: false,
          error: 'Server not found',
          requestId: req.requestId
        });
        return;
      }

      // Check if new name conflicts (if name is being changed)
      if (updateData.name && updateData.name !== existingServer.name) {
        const nameConflict = await this.serverRepository.findByName(updateData.name, req.requestId);
        if (nameConflict) {
          res.status(409).json({
            success: false,
            error: 'Server with this name already exists',
            requestId: req.requestId
          });
          return;
        }
      }

      // Update server
      const updatedServer = await this.serverRepository.update(id, updateData, req.requestId);

      Logger.audit('Server updated', {
        user_id: req.user?.id,
        server_id: id,
        changes: Object.keys(updateData),
        request_id: req.requestId
      });

      const response: ApiResponse<MCPServer> = {
        success: true,
        data: updatedServer,
        message: 'Server updated successfully',
        timestamp: new Date().toISOString(),
        requestId: req.requestId!
      };

      res.status(200).json(response);

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
          requestId: req.requestId
        });
        return;
      }

      Logger.error('Failed to update server', {
        error: error instanceof Error ? error.message : 'Unknown error',
        server_id: req.params.id,
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update server',
        requestId: req.requestId
      });
    }
  };

  /**
   * DELETE /api/servers/:id - Delete managed server (metadata only)
   */
  public deleteServer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      Logger.api('Deleting managed server', req.requestId, {
        user_id: req.user?.id,
        server_id: id
      });

      // Check if server exists
      const existingServer = await this.serverRepository.findById(id, req.requestId);
      if (!existingServer) {
        res.status(404).json({
          success: false,
          error: 'Server not found',
          requestId: req.requestId
        });
        return;
      }

      // Delete server (this only removes our metadata, not the actual bridge server)
      const deleted = await this.serverRepository.delete(id, req.requestId);

      if (!deleted) {
        res.status(500).json({
          success: false,
          error: 'Failed to delete server',
          requestId: req.requestId
        });
        return;
      }

      Logger.audit('Server deleted', {
        user_id: req.user?.id,
        server_id: id,
        server_name: existingServer.name,
        request_id: req.requestId
      });

      res.status(204).send();

    } catch (error) {
      Logger.error('Failed to delete server', {
        error: error instanceof Error ? error.message : 'Unknown error',
        server_id: req.params.id,
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to delete server',
        requestId: req.requestId
      });
    }
  };

  /**
   * GET /api/servers/:id/status - Get real-time server status from bridge
   */
  public getServerStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      Logger.api('Fetching server status', req.requestId, {
        user_id: req.user?.id,
        server_id: id
      });

      // Get server from our database
      const server = await this.serverRepository.findById(id, req.requestId);
      if (!server) {
        res.status(404).json({
          success: false,
          error: 'Server not found',
          requestId: req.requestId
        });
        return;
      }

      // Get real-time status from bridge
      try {
        const bridgeData = await this.mcpBridge.aggregateBridgeData();
        
        const status = {
          serverId: id,
          serverName: server.name,
          bridgeConnected: bridgeData.health,
          lastChecked: new Date(),
          status: bridgeData.health ? 'healthy' : 'disconnected',
          metrics: bridgeData.metrics,
          activeConnections: bridgeData.activeConnections,
          memoryOperations: bridgeData.memoryOperations,
          semanticSearches: bridgeData.semanticSearches,
          uptime: bridgeData.uptime
        };

        res.status(200).json({
          success: true,
          data: status,
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });

      } catch (bridgeError) {
        Logger.error('Failed to get bridge status', {
          error: bridgeError instanceof Error ? bridgeError.message : 'Unknown error',
          server_id: id,
          request_id: req.requestId
        });

        res.status(503).json({
          success: false,
          error: 'MCP Bridge is unreachable',
          data: {
            serverId: id,
            serverName: server.name,
            bridgeConnected: false,
            lastChecked: new Date(),
            status: 'bridge_unreachable'
          },
          requestId: req.requestId
        });
      }

    } catch (error) {
      Logger.error('Failed to get server status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        server_id: req.params.id,
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve server status',
        requestId: req.requestId
      });
    }
  };

  /**
   * POST /api/servers/:id/health-check - Trigger manual health check
   */
  public triggerHealthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      Logger.api('Triggering health check', req.requestId, {
        user_id: req.user?.id,
        server_id: id
      });

      // Get server from our database
      const server = await this.serverRepository.findById(id, req.requestId);
      if (!server) {
        res.status(404).json({
          success: false,
          error: 'Server not found',
          requestId: req.requestId
        });
        return;
      }

      // Perform health check against bridge
      const healthCheck = await this.mcpBridge.testConnection();
      
      // Update server status in our database
      const updatedServer = await this.serverRepository.update(id, {
        observedStatus: healthCheck.connected ? 'healthy' : 'unhealthy'
      }, req.requestId);

      Logger.audit('Health check triggered', {
        user_id: req.user?.id,
        server_id: id,
        result: healthCheck.connected ? 'healthy' : 'unhealthy',
        response_time: healthCheck.responseTime,
        request_id: req.requestId
      });

      res.status(200).json({
        success: true,
        data: {
          serverId: id,
          connected: healthCheck.connected,
          responseTime: healthCheck.responseTime,
          version: healthCheck.version,
          error: healthCheck.error,
          timestamp: new Date()
        },
        message: 'Health check completed',
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });

    } catch (error) {
      Logger.error('Failed to trigger health check', {
        error: error instanceof Error ? error.message : 'Unknown error',
        server_id: req.params.id,
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform health check',
        requestId: req.requestId
      });
    }
  };
}

export default ServerController;