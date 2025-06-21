import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketClient, WebSocketMessage, WebSocketMessageType } from '@/types';
import Logger from '@/utils/logger';
import { verifyJWT } from '@/utils/auth';
import config from '@/config';

/**
 * WebSocket Manager for Real-time MCP Management Updates
 * 
 * Provides real-time communication between the management interface and clients
 * without interfering with the existing MCP Bridge WebSocket connections
 */
export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private static instance: WebSocketManager;

  private constructor(server?: any) {
    this.wss = new WebSocketServer({ 
      port: config.port + 1, // Use different port from main API
      path: '/ws',
      clientTracking: true,
      handleProtocols: this.handleProtocols.bind(this),
      verifyClient: this.verifyClient.bind(this)
    });

    this.setupEventHandlers();
    this.startHeartbeat();
    
    Logger.websocket('WebSocket Manager initialized', {
      port: config.port + 1,
      path: '/ws'
    });
  }

  public static getInstance(server?: any): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager(server);
    }
    return WebSocketManager.instance;
  }

  private handleProtocols(protocols: Set<string>): string | false {
    // Support MCP management protocol
    if (protocols.has('mcp-management-v1')) {
      return 'mcp-management-v1';
    }
    return false;
  }

  private verifyClient(info: { req: any; origin: string; secure: boolean }): boolean {
    // Basic origin verification
    const allowedOrigins = config.security.cors.origin;
    return allowedOrigins.includes(info.origin) || config.environment === 'development';
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', this.handleConnection.bind(this));
    
    this.wss.on('error', (error) => {
      Logger.error('WebSocket Server error', { error: error.message });
    });

    this.wss.on('close', () => {
      Logger.websocket('WebSocket Server closed');
      this.cleanup();
    });
  }

  private async handleConnection(ws: WebSocket, request: any): Promise<void> {
    const clientId = uuidv4();
    const ipAddress = request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];

    Logger.websocket('New WebSocket connection', { 
      clientId, 
      ipAddress, 
      userAgent 
    });

    // Set up client object (will be updated after authentication)
    const client: WebSocketClient = {
      id: clientId,
      userId: '', // Will be set after authentication
      socket: ws,
      subscriptions: [],
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      messages_sent: 0,
      messages_received: 0,
      bytes_sent: 0,
      bytes_received: 0
    };

    this.clients.set(clientId, client);

    // Set up client event handlers
    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnection(clientId, code, reason.toString());
    });

    ws.on('error', (error: Error) => {
      Logger.error('WebSocket client error', { 
        clientId, 
        error: error.message 
      });
      this.removeClient(clientId);
    });

    ws.on('pong', () => {
      this.updateHeartbeat(clientId);
    });

    // Send connection established message
    this.sendToClient(clientId, {
      type: 'connection_established',
      payload: { clientId, timestamp: new Date() },
      timestamp: new Date()
    });
  }

  private async handleMessage(clientId: string, data: Buffer): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      client.messages_received++;
      client.bytes_received += data.length;

      Logger.websocket('Message received', { 
        clientId, 
        type: message.type,
        payloadSize: data.length
      });

      await this.processMessage(clientId, message);

    } catch (error) {
      Logger.error('Failed to process WebSocket message', {
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error',
        dataSize: data.length
      });

      this.sendError(clientId, 'Invalid message format');
    }
  }

  private async processMessage(clientId: string, message: WebSocketMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'authenticate':
        await this.handleAuthentication(clientId, message.payload);
        break;

      case 'subscribe':
        await this.handleSubscription(clientId, message.payload);
        break;

      case 'unsubscribe':
        await this.handleUnsubscription(clientId, message.payload);
        break;

      case 'heartbeat':
        this.handleHeartbeat(clientId);
        break;

      case 'get_server_status':
        await this.handleServerStatusRequest(clientId, message.payload);
        break;

      case 'get_metrics':
        await this.handleMetricsRequest(clientId, message.payload);
        break;

      default:
        Logger.warn('Unknown WebSocket message type', { 
          clientId, 
          type: message.type 
        });
        this.sendError(clientId, `Unknown message type: ${message.type}`);
    }
  }

  private async handleAuthentication(clientId: string, payload: any): Promise<void> {
    try {
      const { token } = payload;
      
      if (!token) {
        this.sendError(clientId, 'Authentication token required');
        return;
      }

      // Verify JWT token
      const decoded = await verifyJWT(token);
      const client = this.clients.get(clientId);
      
      if (!client) return;

      client.userId = decoded.userId;
      
      Logger.websocket('Client authenticated', { 
        clientId, 
        userId: decoded.userId 
      });

      this.sendToClient(clientId, {
        type: 'authenticated',
        payload: { 
          success: true, 
          userId: decoded.userId,
          permissions: decoded.permissions || []
        },
        timestamp: new Date()
      });

    } catch (error) {
      Logger.security('WebSocket authentication failed', { 
        clientId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      this.sendError(clientId, 'Authentication failed');
      
      // Close connection after failed authentication
      setTimeout(() => {
        this.removeClient(clientId);
      }, 1000);
    }
  }

  private async handleSubscription(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.userId) {
      this.sendError(clientId, 'Authentication required');
      return;
    }

    const { serverIds } = payload;
    
    if (!Array.isArray(serverIds)) {
      this.sendError(clientId, 'serverIds must be an array');
      return;
    }

    // Add to subscriptions (avoid duplicates)
    const newSubscriptions = [...new Set([...client.subscriptions, ...serverIds])];
    client.subscriptions = newSubscriptions;

    Logger.websocket('Client subscribed', { 
      clientId, 
      userId: client.userId,
      subscriptions: newSubscriptions.length
    });

    this.sendToClient(clientId, {
      type: 'subscribed',
      payload: { serverIds: newSubscriptions },
      timestamp: new Date()
    });
  }

  private async handleUnsubscription(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { serverIds } = payload;
    
    if (!Array.isArray(serverIds)) {
      this.sendError(clientId, 'serverIds must be an array');
      return;
    }

    client.subscriptions = client.subscriptions.filter(id => !serverIds.includes(id));

    Logger.websocket('Client unsubscribed', { 
      clientId, 
      userId: client.userId,
      subscriptions: client.subscriptions.length
    });

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      payload: { serverIds },
      timestamp: new Date()
    });
  }

  private handleHeartbeat(clientId: string): void {
    this.updateHeartbeat(clientId);
    
    this.sendToClient(clientId, {
      type: 'heartbeat',
      payload: { timestamp: new Date() },
      timestamp: new Date()
    });
  }

  private async handleServerStatusRequest(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.userId) {
      this.sendError(clientId, 'Authentication required');
      return;
    }

    try {
      // This would integrate with MCP Bridge Client to get real status
      // For now, send mock data structure
      const serverStatus = {
        servers: [],
        lastUpdated: new Date(),
        totalServers: 0
      };

      this.sendToClient(clientId, {
        type: 'server_status_response',
        payload: serverStatus,
        timestamp: new Date()
      });

    } catch (error) {
      Logger.error('Failed to get server status', {
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.sendError(clientId, 'Failed to get server status');
    }
  }

  private async handleMetricsRequest(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.userId) {
      this.sendError(clientId, 'Authentication required');
      return;
    }

    try {
      const { serverId, timeRange } = payload;
      
      // This would integrate with metrics service
      const metrics = {
        serverId,
        timeRange,
        data: [],
        timestamp: new Date()
      };

      this.sendToClient(clientId, {
        type: 'metrics_response',
        payload: metrics,
        timestamp: new Date()
      });

    } catch (error) {
      Logger.error('Failed to get metrics', {
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.sendError(clientId, 'Failed to get metrics');
    }
  }

  private updateHeartbeat(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = new Date();
    }
  }

  private handleDisconnection(clientId: string, code: number, reason: string): void {
    Logger.websocket('Client disconnected', { 
      clientId, 
      code, 
      reason: reason || 'No reason provided'
    });

    this.removeClient(clientId);
  }

  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.close(1000, 'Server initiated close');
        }
      } catch (error) {
        Logger.error('Error closing WebSocket', { clientId, error });
      }
      
      this.clients.delete(clientId);
      Logger.websocket('Client removed', { clientId });
    }
  }

  private sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const data = JSON.stringify(message);
      client.socket.send(data);
      client.messages_sent++;
      client.bytes_sent += data.length;
      return true;
    } catch (error) {
      Logger.error('Failed to send WebSocket message', {
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.removeClient(clientId);
      return false;
    }
  }

  private sendError(clientId: string, error: string): void {
    this.sendToClient(clientId, {
      type: 'error',
      payload: { error, timestamp: new Date() },
      timestamp: new Date()
    });
  }

  // Public methods for broadcasting updates
  public broadcastServerStatus(serverId: string, status: any): void {
    const message: WebSocketMessage = {
      type: 'server_status_update',
      payload: { serverId, status, timestamp: new Date() },
      timestamp: new Date()
    };

    this.broadcastToSubscribers(serverId, message);
  }

  public broadcastMetrics(serverId: string, metrics: any): void {
    const message: WebSocketMessage = {
      type: 'metrics_update',
      payload: { serverId, metrics, timestamp: new Date() },
      timestamp: new Date()
    };

    this.broadcastToSubscribers(serverId, message);
  }

  public broadcastAlert(serverId: string, alert: any): void {
    const message: WebSocketMessage = {
      type: 'alert_triggered',
      payload: { serverId, alert, timestamp: new Date() },
      timestamp: new Date()
    };

    this.broadcastToSubscribers(serverId, message);
  }

  private broadcastToSubscribers(serverId: string, message: WebSocketMessage): void {
    let sent = 0;
    
    for (const [clientId, client] of this.clients.entries()) {
      if (client.subscriptions.includes(serverId)) {
        if (this.sendToClient(clientId, message)) {
          sent++;
        }
      }
    }

    Logger.websocket('Broadcast sent', { 
      serverId, 
      messageType: message.type,
      clientsSent: sent,
      totalClients: this.clients.size
    });
  }

  public broadcastToAll(message: WebSocketMessage): void {
    let sent = 0;
    
    for (const [clientId] of this.clients.entries()) {
      if (this.sendToClient(clientId, message)) {
        sent++;
      }
    }

    Logger.websocket('Global broadcast sent', { 
      messageType: message.type,
      clientsSent: sent,
      totalClients: this.clients.size
    });
  }

  private startHeartbeat(): void {
    const interval = config.security.cors.maxAge || 30000; // 30 seconds default
    
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = 2 * interval; // 2x heartbeat interval
      
      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceHeartbeat = now.getTime() - client.lastHeartbeat.getTime();
        
        if (timeSinceHeartbeat > timeout) {
          Logger.websocket('Client heartbeat timeout', { 
            clientId, 
            timeSinceHeartbeat 
          });
          this.removeClient(clientId);
        } else if (client.socket.readyState === WebSocket.OPEN) {
          // Send ping
          try {
            client.socket.ping();
          } catch (error) {
            Logger.error('Failed to ping client', { clientId, error });
            this.removeClient(clientId);
          }
        }
      }
    }, interval);
  }

  public getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    totalSubscriptions: number;
    messagesPerMinute: number;
  } {
    const authenticated = Array.from(this.clients.values()).filter(c => c.userId).length;
    const totalSubscriptions = Array.from(this.clients.values())
      .reduce((sum, client) => sum + client.subscriptions.length, 0);

    return {
      totalConnections: this.clients.size,
      authenticatedConnections: authenticated,
      totalSubscriptions,
      messagesPerMinute: 0 // Would calculate based on recent activity
    };
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const [clientId] of this.clients.entries()) {
      this.removeClient(clientId);
    }

    this.clients.clear();
  }

  public async shutdown(): Promise<void> {
    Logger.websocket('Shutting down WebSocket Manager');
    
    this.cleanup();
    
    return new Promise((resolve) => {
      this.wss.close(() => {
        Logger.websocket('WebSocket Server closed');
        resolve();
      });
    });
  }
}

// Auth utility function (simplified - would be in auth utils)
async function verifyJWT(token: string): Promise<{ userId: string; permissions?: string[] }> {
  // This is a placeholder - actual JWT verification would go here
  // For now, return a mock decoded token
  return {
    userId: 'user-123',
    permissions: ['read', 'write']
  };
}

export default WebSocketManager;