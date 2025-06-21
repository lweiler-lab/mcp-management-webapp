/**
 * Global State Management Store
 * Using Zustand for simple, effective state management
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MCPServer, User, MetricsData } from './api';
import { apiClient } from './api';

// WebSocket connection state
export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  lastMessage?: any;
  subscriptions: string[];
  connect: () => void;
  disconnect: () => void;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  sendMessage: (type: string, data: any) => void;
}

// Authentication state
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithCloudflare: (cfAccessJwt: string, state?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

// Server management state
export interface ServerState {
  servers: MCPServer[];
  selectedServer: MCPServer | null;
  isLoading: boolean;
  error: string | null;
  filters: {
    environment?: string;
    status?: string;
    search?: string;
    tags?: string[];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  fetchServers: () => Promise<void>;
  fetchServer: (id: string) => Promise<void>;
  createServer: (serverData: any) => Promise<void>;
  updateServer: (id: string, serverData: any) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  setFilters: (filters: any) => void;
  setSelectedServer: (server: MCPServer | null) => void;
  triggerHealthCheck: (id: string) => Promise<void>;
}

// Metrics state
export interface MetricsState {
  metrics: MetricsData | null;
  serverMetrics: Record<string, any>;
  bridgeMetrics: any;
  summary: any;
  isLoading: boolean;
  error: string | null;
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d';
  fetchMetrics: () => Promise<void>;
  fetchServerMetrics: (serverId: string) => Promise<void>;
  fetchBridgeMetrics: () => Promise<void>;
  fetchSummary: () => Promise<void>;
  setTimeRange: (range: '1h' | '6h' | '24h' | '7d' | '30d') => void;
}

// WebSocket state
export interface WSState {
  socket: WebSocket | null;
  connected: boolean;
  connecting: boolean;
  lastMessage: any;
  subscriptions: string[];
  connect: (token: string) => void;
  disconnect: () => void;
  subscribe: (serverIds: string[]) => void;
  unsubscribe: (serverIds: string[]) => void;
  sendMessage: (message: any) => void;
}

// System state
export interface SystemState {
  info: any;
  config: any;
  stats: any;
  health: any;
  isLoading: boolean;
  error: string | null;
  fetchSystemInfo: () => Promise<void>;
  fetchSystemConfig: () => Promise<void>;
  fetchSystemStats: () => Promise<void>;
  fetchHealth: () => Promise<void>;
}

// Create auth store with persistence
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.login(email, password);
          if (response.success && response.data) {
            const { user, accessToken } = response.data;
            apiClient.setToken(accessToken);
            set({
              user,
              token: accessToken,
              isAuthenticated: true,
              isLoading: false
            });
          } else {
            throw new Error(response.error || 'Login failed');
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      loginWithCloudflare: async (cfAccessJwt: string, state?: string) => {
        set({ isLoading: true });
        try {
          const response = await apiClient.cloudflareCallback(cfAccessJwt, state);
          if (response.success && response.data) {
            const { user, accessToken } = response.data;
            apiClient.setToken(accessToken);
            set({
              user,
              token: accessToken,
              isAuthenticated: true,
              isLoading: false
            });
          } else {
            throw new Error(response.error || 'Cloudflare login failed');
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await apiClient.logout();
        } catch (error) {
          console.warn('Logout API call failed:', error);
        } finally {
          apiClient.clearToken();
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false
          });
        }
      },

      refreshAuth: async () => {
        const { token } = get();
        if (!token) return;

        try {
          const response = await apiClient.getCurrentUser();
          if (response.success && response.data) {
            set({ user: response.data, isAuthenticated: true });
          } else {
            // Token invalid, logout
            get().logout();
          }
        } catch (error) {
          console.warn('Auth refresh failed:', error);
          get().logout();
        }
      },

      setUser: (user: User) => {
        set({ user });
      }
    }),
    {
      name: 'mcp-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

// Create server store
export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  selectedServer: null,
  isLoading: false,
  error: null,
  filters: {},
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  },

  fetchServers: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters, pagination } = get();
      const response = await apiClient.getServers({
        ...filters,
        page: pagination.page,
        limit: pagination.limit
      });

      if (response.success && response.data) {
        set({
          servers: response.data.data,
          pagination: response.data.pagination,
          isLoading: false
        });
      } else {
        throw new Error(response.error || 'Failed to fetch servers');
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },

  fetchServer: async (id: string) => {
    try {
      const response = await apiClient.getServer(id);
      if (response.success && response.data) {
        set({ selectedServer: response.data });
      } else {
        throw new Error(response.error || 'Failed to fetch server');
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  createServer: async (serverData: any) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.createServer(serverData);
      if (response.success) {
        // Refresh servers list
        await get().fetchServers();
      } else {
        throw new Error(response.error || 'Failed to create server');
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
      throw error;
    }
  },

  updateServer: async (id: string, serverData: any) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.updateServer(id, serverData);
      if (response.success && response.data) {
        // Update the server in the list
        const servers = get().servers.map(server =>
          server.id === id ? response.data! : server
        );
        set({ servers, selectedServer: response.data, isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to update server');
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
      throw error;
    }
  },

  deleteServer: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.deleteServer(id);
      if (response.success) {
        // Remove server from list
        const servers = get().servers.filter(server => server.id !== id);
        set({ 
          servers, 
          selectedServer: get().selectedServer?.id === id ? null : get().selectedServer,
          isLoading: false 
        });
      } else {
        throw new Error(response.error || 'Failed to delete server');
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
      throw error;
    }
  },

  setFilters: (filters: any) => {
    set({ filters, pagination: { ...get().pagination, page: 1 } });
  },

  setSelectedServer: (server: MCPServer | null) => {
    set({ selectedServer: server });
  },

  triggerHealthCheck: async (id: string) => {
    try {
      const response = await apiClient.triggerHealthCheck(id);
      if (response.success) {
        // Refresh the specific server
        await get().fetchServer(id);
      } else {
        throw new Error(response.error || 'Health check failed');
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}));

// Create metrics store
export const useMetricsStore = create<MetricsState>((set, get) => ({
  metrics: null,
  serverMetrics: {},
  bridgeMetrics: null,
  summary: null,
  isLoading: false,
  error: null,
  timeRange: '24h',

  fetchMetrics: async () => {
    set({ isLoading: true, error: null });
    try {
      const { timeRange } = get();
      const response = await apiClient.getMetrics({ timeRange });
      if (response.success && response.data) {
        set({ metrics: response.data, isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to fetch metrics');
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },

  fetchServerMetrics: async (serverId: string) => {
    try {
      const { timeRange } = get();
      const response = await apiClient.getServerMetrics(serverId, { timeRange });
      if (response.success && response.data) {
        set({
          serverMetrics: {
            ...get().serverMetrics,
            [serverId]: response.data
          }
        });
      }
    } catch (error) {
      console.warn('Failed to fetch server metrics:', error);
    }
  },

  fetchBridgeMetrics: async () => {
    try {
      const response = await apiClient.getBridgeMetrics();
      if (response.success && response.data) {
        set({ bridgeMetrics: response.data });
      }
    } catch (error) {
      console.warn('Failed to fetch bridge metrics:', error);
    }
  },

  fetchSummary: async () => {
    try {
      const response = await apiClient.getMetricsSummary();
      if (response.success && response.data) {
        set({ summary: response.data });
      }
    } catch (error) {
      console.warn('Failed to fetch metrics summary:', error);
    }
  },

  setTimeRange: (range: '1h' | '6h' | '24h' | '7d' | '30d') => {
    set({ timeRange: range });
  }
}));

// Create WebSocket store
export const useWebSocketStore = create<WSState>((set, get) => ({
  socket: null,
  connected: false,
  connecting: false,
  lastMessage: null,
  subscriptions: [],

  connect: (token: string) => {
    const { socket, connecting } = get();
    
    if (socket || connecting) return;

    set({ connecting: true });

    try {
      const wsUrl = import.meta.env.PUBLIC_WS_URL || 'ws://localhost:3001/ws';
      const ws = new WebSocket(wsUrl, 'mcp-management-v1');

      ws.onopen = () => {
        console.log('WebSocket connected');
        set({ socket: ws, connected: true, connecting: false });
        
        // Authenticate
        ws.send(JSON.stringify({
          type: 'authenticate',
          payload: { token },
          timestamp: new Date()
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          set({ lastMessage: message });
          
          // Handle different message types
          switch (message.type) {
            case 'server_status_update':
              // Update server in store
              if (message.payload?.server) {
                const serverStore = useServerStore.getState();
                const updatedServers = serverStore.servers.map(server =>
                  server.id === message.payload.server.id ? message.payload.server : server
                );
                useServerStore.setState({ servers: updatedServers });
                
                // Update selected server if it's the same
                if (serverStore.selectedServer?.id === message.payload.server.id) {
                  useServerStore.setState({ selectedServer: message.payload.server });
                }
              }
              break;
              
            case 'metrics_update':
              // Update metrics in store
              if (message.payload?.metrics) {
                const metricsStore = useMetricsStore.getState();
                if (message.payload.serverId) {
                  // Update specific server metrics
                  const updatedMetrics = {
                    ...metricsStore.serverMetrics,
                    [message.payload.serverId]: message.payload.metrics
                  };
                  useMetricsStore.setState({ serverMetrics: updatedMetrics });
                } else {
                  // Update general metrics
                  useMetricsStore.setState({ summary: message.payload.metrics });
                }
              }
              break;
              
            case 'system_health_update':
              // Update system health
              if (message.payload?.health) {
                useSystemStore.setState({ health: message.payload.health });
              }
              break;
              
            case 'alert_triggered':
              // Handle real-time alerts
              console.warn('Real-time alert:', message.payload);
              // Could trigger notifications here
              break;
              
            case 'server_created':
              // Add new server to list
              if (message.payload?.server) {
                const serverStore = useServerStore.getState();
                const updatedServers = [...serverStore.servers, message.payload.server];
                useServerStore.setState({ servers: updatedServers });
              }
              break;
              
            case 'server_deleted':
              // Remove server from list
              if (message.payload?.serverId) {
                const serverStore = useServerStore.getState();
                const updatedServers = serverStore.servers.filter(
                  server => server.id !== message.payload.serverId
                );
                useServerStore.setState({ servers: updatedServers });
                
                // Clear selected server if it was deleted
                if (serverStore.selectedServer?.id === message.payload.serverId) {
                  useServerStore.setState({ selectedServer: null });
                }
              }
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        set({ socket: null, connected: false, connecting: false });
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        set({ socket: null, connected: false, connecting: false });
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      set({ connecting: false });
    }
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, connected: false, connecting: false });
    }
  },

  subscribe: (serverIds: string[]) => {
    const { socket, subscriptions } = get();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'subscribe',
        payload: { serverIds },
        timestamp: new Date()
      }));
      
      const newSubscriptions = [...new Set([...subscriptions, ...serverIds])];
      set({ subscriptions: newSubscriptions });
    }
  },

  unsubscribe: (serverIds: string[]) => {
    const { socket, subscriptions } = get();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'unsubscribe',
        payload: { serverIds },
        timestamp: new Date()
      }));
      
      const newSubscriptions = subscriptions.filter(id => !serverIds.includes(id));
      set({ subscriptions: newSubscriptions });
    }
  },

  sendMessage: (message: any) => {
    const { socket } = get();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        ...message,
        timestamp: new Date()
      }));
    }
  }
}));

// Create system store
export const useSystemStore = create<SystemState>((set) => ({
  info: null,
  config: null,
  stats: null,
  health: null,
  isLoading: false,
  error: null,

  fetchSystemInfo: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.getSystemInfo();
      if (response.success && response.data) {
        set({ info: response.data, isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to fetch system info');
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },

  fetchSystemConfig: async () => {
    try {
      const response = await apiClient.getSystemConfig();
      if (response.success && response.data) {
        set({ config: response.data });
      }
    } catch (error) {
      console.warn('Failed to fetch system config:', error);
    }
  },

  fetchSystemStats: async () => {
    try {
      const response = await apiClient.getSystemStats();
      if (response.success && response.data) {
        set({ stats: response.data });
      }
    } catch (error) {
      console.warn('Failed to fetch system stats:', error);
    }
  },

  fetchHealth: async () => {
    try {
      const response = await apiClient.getDetailedHealth();
      if (response.success && response.data) {
        set({ health: response.data });
      }
    } catch (error) {
      console.warn('Failed to fetch health data:', error);
    }
  }
}));

// Initialize auth store on app start
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('auth_token');
  if (token) {
    apiClient.setToken(token);
    useAuthStore.getState().refreshAuth();
  }
}