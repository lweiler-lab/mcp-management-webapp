// MCP Management Web App Types

export interface MCPServer {
  id: string;
  name: string;
  type: 'memory' | 'github' | 'cloudflare' | 'custom';
  status: 'healthy' | 'degraded' | 'offline';
  url: string;
  description?: string;
  lastActive: Date;
  metrics: {
    uptime: number;
    responseTime: number;
    successRate: number;
    requestCount: number;
    errorCount: number;
  };
  config: Record<string, any>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
  server: string;
  category: 'memory' | 'github' | 'performance' | 'tasklog' | 'flow';
}

export interface SystemMetrics {
  overall_health: 'optimal' | 'degraded' | 'critical';
  uptime: number;
  total_requests: number;
  success_rate: number;
  average_response_time: number;
  active_connections: number;
  memory_usage: {
    bridge: number;
    vps: number;
    chromadb: number;
  };
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  command?: string;
  result?: any;
  error?: string;
}

export interface WebSocketMessage {
  type: 'status_update' | 'metrics_update' | 'server_event' | 'error';
  data: any;
  timestamp: Date;
  server?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'developer' | 'observer';
  avatar?: string;
  lastLogin: Date;
}