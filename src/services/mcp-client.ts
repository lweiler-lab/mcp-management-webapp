// MCP Bridge Client Service

import type { MCPServer, MCPTool, SystemMetrics } from '../types';
import { config } from '../lib/config';

export class MCPClient {
  private baseUrl: string;
  private authToken: string;
  private ws: WebSocket | null = null;
  private listeners: Map<string, Function[]> = new Map();

  constructor() {
    this.baseUrl = config.mcpBridge.url;
    this.authToken = config.mcpBridge.authToken;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.authToken}`,
      'Content-Type': 'application/json',
    };
  }

  // WebSocket connection for real-time updates
  connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.ws = new WebSocket(config.mcpBridge.wsUrl);
      
      this.ws.onopen = () => {
        console.log('🔗 WebSocket connected to MCP bridge');
        this.emit('connection', { status: 'connected' });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.emit('message', message);
          this.emit(message.type, message.data);
        } catch (error) {
          console.error('❌ WebSocket message parse error:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.emit('connection', { status: 'disconnected' });
        // Reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(), 5000);
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.emit('error', error);
      };
    } catch (error) {
      console.error('❌ WebSocket connection failed:', error);
    }
  }

  // Event system for WebSocket
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => callback(data));
  }

  // Get system health status
  async getSystemHealth(): Promise<{ status: string; details: any }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Health check failed:', error);
      throw error;
    }
  }

  // Get system metrics
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const response = await fetch(`${this.baseUrl}/metrics`, {
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Metrics fetch failed:', error);
      throw error;
    }
  }

  // Get all available MCP tools
  async getMCPTools(): Promise<MCPTool[]> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/tools`, {
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Tools fetch failed:', error);
      throw error;
    }
  }

  // Execute MCP tool command
  async executeCommand(toolName: string, args: Record<string, any>): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/execute`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          tool: toolName,
          arguments: args,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ Command execution failed for ${toolName}:`, error);
      throw error;
    }
  }

  // MCP Server management
  async getMCPServers(): Promise<MCPServer[]> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/servers`, {
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Server list fetch failed:', error);
      throw error;
    }
  }

  async restartMCPServer(serverId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/servers/${serverId}/restart`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (error) {
      console.error(`❌ Server restart failed for ${serverId}:`, error);
      throw error;
    }
  }

  async updateMCPServerConfig(serverId: string, config: Record<string, any>): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/servers/${serverId}/config`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(config),
      });
      return await response.json();
    } catch (error) {
      console.error(`❌ Server config update failed for ${serverId}:`, error);
      throw error;
    }
  }

  // Memory operations
  async storeMemory(key: string, value: any, context?: string): Promise<{ success: boolean }> {
    return this.executeCommand('memory_store', { key, value, context });
  }

  async retrieveMemory(key: string): Promise<any> {
    return this.executeCommand('memory_retrieve', { key });
  }

  async searchMemory(query: string, context?: string): Promise<any[]> {
    return this.executeCommand('memory_search', { query, context });
  }

  async semanticSearch(query: string, maxResults = 5): Promise<any[]> {
    return this.executeCommand('semantic_search_advanced', { 
      query, 
      max_results: maxResults,
      include_metadata: true 
    });
  }

  // Disconnect WebSocket
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Export singleton instance
export const mcpClient = new MCPClient();