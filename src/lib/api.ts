/**
 * API Client for MCP Management Backend
 * Handles all HTTP requests to the backend API with type safety
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface MCPServer {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  url: string;
  status: 'healthy' | 'warning' | 'critical' | 'inactive' | 'unknown';
  environment: 'development' | 'staging' | 'production';
  tags: string[];
  healthScore: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  ownerTeam?: string;
  bridgeStatus?: {
    connected: boolean;
    lastSeen: string;
    metrics?: any;
    activeConnections?: number;
    memoryOperations?: number;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  lastLogin?: string;
  createdAt: string;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface SystemInfo {
  application: {
    name: string;
    version: string;
    environment: string;
    uptime: number;
    startTime: string;
  };
  runtime: {
    node: {
      version: string;
      platform: string;
      arch: string;
    };
    memory: any;
    cpu: any;
  };
  database: {
    connected: boolean;
    connectionCount: number;
    type: string;
  };
  bridge: {
    connected: boolean;
    url: string;
    version?: string;
    responseTime?: number;
  };
}

export interface MetricsData {
  timeRange: {
    start: string;
    end: string;
    interval: string;
  };
  bridge?: {
    connected: boolean;
    uptime: number;
    activeConnections: number;
    memoryOperations: number;
    semanticSearches: number;
  };
  system: {
    nodejs: any;
    timestamp: string;
  };
  aggregated?: {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
  };
}

class APIClient {
  private baseURL: string;
  private token: string | null = null;

  constructor() {
    // Use environment variables or fallback to localhost for development
    this.baseURL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';
    
    // Load token from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  // Authentication endpoints
  async login(email: string, password: string): Promise<ApiResponse<AuthResult>> {
    return this.request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async cloudflareCallback(cfAccessJwt: string, state?: string): Promise<ApiResponse<AuthResult>> {
    return this.request<AuthResult>('/auth/cloudflare/callback', {
      method: 'POST',
      body: JSON.stringify({ cfAccessJwt, state }),
    });
  }

  async refreshToken(refreshToken: string): Promise<ApiResponse<{ accessToken: string; expiresIn: number }>> {
    return this.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.request<User>('/auth/me');
  }

  async getAuthConfig(): Promise<ApiResponse<any>> {
    return this.request('/auth/config');
  }

  // Server management endpoints
  async getServers(params?: {
    page?: number;
    limit?: number;
    environment?: string;
    status?: string;
    search?: string;
    tags?: string[];
  }): Promise<ApiResponse<PaginatedResponse<MCPServer>>> {
    const searchParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            searchParams.append(key, value.join(','));
          } else {
            searchParams.append(key, String(value));
          }
        }
      });
    }

    const queryString = searchParams.toString();
    const endpoint = queryString ? `/api/v1/servers?${queryString}` : '/api/v1/servers';
    
    return this.request<PaginatedResponse<MCPServer>>(endpoint);
  }

  async getServer(id: string): Promise<ApiResponse<MCPServer>> {
    return this.request<MCPServer>(`/api/v1/servers/${id}`);
  }

  async createServer(serverData: {
    name: string;
    displayName?: string;
    description?: string;
    environment?: 'development' | 'staging' | 'production';
    tags?: string[];
    ownerTeam?: string;
    healthCheckEnabled?: boolean;
    healthCheckInterval?: number;
  }): Promise<ApiResponse<MCPServer>> {
    return this.request<MCPServer>('/api/v1/servers', {
      method: 'POST',
      body: JSON.stringify(serverData),
    });
  }

  async updateServer(id: string, serverData: Partial<MCPServer>): Promise<ApiResponse<MCPServer>> {
    return this.request<MCPServer>(`/api/v1/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(serverData),
    });
  }

  async deleteServer(id: string): Promise<ApiResponse<void>> {
    return this.request(`/api/v1/servers/${id}`, {
      method: 'DELETE',
    });
  }

  async getServerStatus(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/servers/${id}/status`);
  }

  async triggerHealthCheck(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/servers/${id}/health-check`, {
      method: 'POST',
    });
  }

  // Metrics endpoints
  async getMetrics(params?: {
    serverId?: string;
    timeRange?: '1h' | '6h' | '24h' | '7d' | '30d';
    interval?: '1m' | '5m' | '15m' | '1h' | '1d';
    metrics?: string[];
  }): Promise<ApiResponse<MetricsData>> {
    const searchParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            searchParams.append(key, value.join(','));
          } else {
            searchParams.append(key, String(value));
          }
        }
      });
    }

    const queryString = searchParams.toString();
    const endpoint = queryString ? `/api/v1/metrics?${queryString}` : '/api/v1/metrics';
    
    return this.request<MetricsData>(endpoint);
  }

  async getServerMetrics(id: string, params?: {
    timeRange?: '1h' | '6h' | '24h' | '7d' | '30d';
    interval?: '1m' | '5m' | '15m' | '1h' | '1d';
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }

    const queryString = searchParams.toString();
    const endpoint = queryString 
      ? `/api/v1/metrics/servers/${id}?${queryString}` 
      : `/api/v1/metrics/servers/${id}`;
    
    return this.request(endpoint);
  }

  async getBridgeMetrics(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/metrics/bridge');
  }

  async getMetricsSummary(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/metrics/summary');
  }

  // System endpoints
  async getSystemInfo(): Promise<ApiResponse<SystemInfo>> {
    return this.request<SystemInfo>('/api/v1/system/info');
  }

  async getSystemConfig(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/system/config');
  }

  async getSystemStats(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/system/stats');
  }

  async triggerMaintenance(operation: 'vacuum' | 'cleanup' | 'health-check'): Promise<ApiResponse<any>> {
    return this.request('/api/v1/system/maintenance', {
      method: 'POST',
      body: JSON.stringify({ operation }),
    });
  }

  // Health endpoints
  async getHealth(): Promise<ApiResponse<any>> {
    return this.request('/health');
  }

  async getDetailedHealth(): Promise<ApiResponse<any>> {
    return this.request('/health/detailed');
  }

  async getReadiness(): Promise<ApiResponse<any>> {
    return this.request('/health/readiness');
  }

  async getLiveness(): Promise<ApiResponse<any>> {
    return this.request('/health/liveness');
  }

  async getHealthMetrics(): Promise<ApiResponse<any>> {
    return this.request('/health/metrics');
  }

  // AI endpoints
  async getAIStatus(): Promise<ApiResponse<AIStatus>> {
    return this.request<AIStatus>('/api/v1/ai/status');
  }

  async analyzeServerHealth(serverId: string, includeMetrics = false): Promise<ApiResponse<AIServerAnalysis>> {
    return this.request<AIServerAnalysis>('/api/v1/ai/analyze/server', {
      method: 'POST',
      body: JSON.stringify({ serverId, includeMetrics }),
    });
  }

  async predictIssues(timeRange = '24h'): Promise<ApiResponse<AIPredictions>> {
    return this.request<AIPredictions>('/api/v1/ai/predict', {
      method: 'POST',
      body: JSON.stringify({ timeRange }),
    });
  }

  async generateChatResponse(
    message: string,
    selectedServerId?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<ApiResponse<AIChatResponse>> {
    return this.request<AIChatResponse>('/api/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        selectedServerId,
        conversationHistory
      }),
    });
  }

  async analyzePatterns(params?: {
    timeRange?: { hours?: number; days?: number };
    serverIds?: string[];
  }): Promise<ApiResponse<AIPatternAnalysis>> {
    return this.request<AIPatternAnalysis>('/api/v1/ai/analyze/patterns', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  }

  async generateIncidentResponse(incident: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    affectedServers?: string[];
    description: string;
    includeMetrics?: boolean;
  }): Promise<ApiResponse<AIIncidentResponse>> {
    return this.request<AIIncidentResponse>('/api/v1/ai/incident/response', {
      method: 'POST',
      body: JSON.stringify(incident),
    });
  }
}

// AI-related interfaces
export interface AIStatus {
  status: string;
  capabilities: {
    serverAnalysis: boolean;
    predictiveAnalytics: boolean;
    chatAssistant: boolean;
    patternAnalysis: boolean;
    incidentResponse: boolean;
  };
  integrations: {
    openai: {
      status: string;
      model: string;
    };
    mcpBridge: {
      status: string;
    };
  };
  timestamp: string;
}

export interface AIServerAnalysis {
  serverId: string;
  serverName: string;
  analysis: {
    analysis: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
    confidence: number;
    actions?: Array<{
      type: string;
      description: string;
      priority: number;
    }>;
  };
  timestamp: string;
}

export interface AIPredictions {
  predictions: Array<{
    serverId: string;
    issue: string;
    probability: number;
    timeframe: string;
    mitigation: string[];
  }>;
  overallRisk: 'low' | 'medium' | 'high';
  recommendations: string[];
  serversAnalyzed: number;
  metricsAnalyzed: number;
  timeRange: string;
  timestamp: string;
}

export interface AIChatResponse {
  response: string;
  actions?: Array<{
    type: string;
    label: string;
    data: any;
  }>;
  confidence: number;
  timestamp: string;
  context: {
    hasSelectedServer: boolean;
    hasSystemHealth: boolean;
    hasRecentMetrics: boolean;
  };
}

export interface AIPatternAnalysis {
  patterns: Array<{
    type: string;
    description: string;
    affected_servers: string[];
    severity: string;
  }>;
  anomalies: Array<{
    type: string;
    description: string;
    server_id: string;
    confidence: number;
  }>;
  insights: string[];
  recommendations: string[];
  analysisMetadata: {
    serversAnalyzed: number;
    metricsAnalyzed: number;
    timeRange: {
      start: string;
      end: string;
    };
  };
  timestamp: string;
}

export interface AIIncidentResponse {
  incident: {
    type: string;
    severity: string;
    affectedServers: string[];
    description: string;
  };
  response: {
    immediate_actions: string[];
    investigation_steps: string[];
    prevention_measures: string[];
    escalation_criteria: string[];
    estimated_resolution_time: string;
  };
  timestamp: string;
}

// Create singleton instance
export const apiClient = new APIClient();

// Export default
export default apiClient;