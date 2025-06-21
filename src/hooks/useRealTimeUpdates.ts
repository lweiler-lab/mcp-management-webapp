import { useEffect, useRef } from 'react';
import { useAuthStore, useWebSocketStore, useServerStore, useMetricsStore, useSystemStore } from '../lib/store';

/**
 * Real-time Updates Hook
 * 
 * Manages WebSocket connection and real-time data synchronization
 * Automatically connects when authenticated and handles reconnection
 */
export const useRealTimeUpdates = () => {
  const { token, isAuthenticated } = useAuthStore();
  const { 
    connected, 
    connecting, 
    connect, 
    disconnect, 
    subscribe, 
    unsubscribe,
    lastMessage 
  } = useWebSocketStore();
  const { servers } = useServerStore();
  
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated && token && !connected && !connecting) {
      console.log('Initiating WebSocket connection...');
      connect(token);
    }
  }, [isAuthenticated, token, connected, connecting, connect]);

  // Disconnect when not authenticated
  useEffect(() => {
    if (!isAuthenticated && connected) {
      console.log('Disconnecting WebSocket - not authenticated');
      disconnect();
    }
  }, [isAuthenticated, connected, disconnect]);

  // Auto-reconnect logic
  useEffect(() => {
    if (isAuthenticated && token && !connected && !connecting) {
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        console.log(`Attempting WebSocket reconnection (${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect(token);
        }, reconnectDelay * Math.pow(2, reconnectAttemptsRef.current)); // Exponential backoff
      } else {
        console.warn('Max WebSocket reconnection attempts reached');
      }
    }

    // Reset reconnect attempts on successful connection
    if (connected) {
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connected, connecting, isAuthenticated, token, connect]);

  // Subscribe to server updates when servers change
  useEffect(() => {
    if (connected && servers.length > 0) {
      const serverIds = servers.map(server => server.id);
      console.log('Subscribing to server updates:', serverIds);
      subscribe(serverIds);

      // Cleanup subscription when servers change
      return () => {
        if (connected) {
          unsubscribe(serverIds);
        }
      };
    }
  }, [connected, servers, subscribe, unsubscribe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (connected) {
        disconnect();
      }
    };
  }, [connected, disconnect]);

  return {
    connected,
    connecting,
    lastMessage,
    reconnectAttempts: reconnectAttemptsRef.current,
    maxReconnectAttempts
  };
};

/**
 * Real-time Metrics Hook
 * 
 * Specifically handles real-time metrics updates and streaming
 */
export const useRealTimeMetrics = (serverId?: string, autoRefresh = true) => {
  const { fetchSummary, fetchServerMetrics } = useMetricsStore();
  const { connected } = useWebSocketStore();
  const refreshIntervalRef = useRef<NodeJS.Timeout>();

  // Auto-refresh metrics when not connected to WebSocket
  useEffect(() => {
    if (autoRefresh && !connected) {
      // Fallback to polling when WebSocket is not available
      const refreshInterval = 30000; // 30 seconds
      
      refreshIntervalRef.current = setInterval(() => {
        fetchSummary();
        if (serverId) {
          fetchServerMetrics(serverId);
        }
      }, refreshInterval);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefresh, connected, serverId, fetchSummary, fetchServerMetrics]);

  // Clear polling when WebSocket connects
  useEffect(() => {
    if (connected && refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = undefined;
    }
  }, [connected]);

  return {
    isRealTime: connected,
    isPolling: !connected && autoRefresh
  };
};

/**
 * Real-time Server Status Hook
 * 
 * Provides real-time server status updates and health monitoring
 */
export const useRealTimeServerStatus = (serverId?: string) => {
  const { lastMessage } = useWebSocketStore();
  const { selectedServer, servers } = useServerStore();

  // Get current server status
  const server = serverId 
    ? servers.find(s => s.id === serverId) 
    : selectedServer;

  // Check if this server had a recent update
  const hasRecentUpdate = lastMessage && 
    (lastMessage.type === 'server_status_update' || lastMessage.type === 'metrics_update') &&
    lastMessage.payload?.serverId === server?.id;

  return {
    server,
    hasRecentUpdate,
    lastUpdateTime: hasRecentUpdate ? new Date(lastMessage.timestamp) : null,
    updateType: hasRecentUpdate ? lastMessage.type : null
  };
};

/**
 * Real-time Notifications Hook
 * 
 * Handles real-time alerts and notifications
 */
export const useRealTimeNotifications = () => {
  const { lastMessage } = useWebSocketStore();

  // Extract notifications from WebSocket messages
  const notification = lastMessage?.type === 'alert_triggered' ? {
    id: lastMessage.id || Date.now().toString(),
    type: lastMessage.payload?.severity || 'info',
    title: lastMessage.payload?.title || 'System Alert',
    message: lastMessage.payload?.message || '',
    timestamp: new Date(lastMessage.timestamp),
    serverId: lastMessage.payload?.serverId,
    serverName: lastMessage.payload?.serverName
  } : null;

  return {
    notification,
    hasNewNotification: !!notification
  };
};

export default {
  useRealTimeUpdates,
  useRealTimeMetrics,
  useRealTimeServerStatus,
  useRealTimeNotifications
};