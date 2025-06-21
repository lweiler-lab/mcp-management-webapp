import React, { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, Server, TrendingUp, Users, Zap } from 'lucide-react';
import DynamicMCPServerCard from './DynamicMCPServerCard';
import DynamicAIAssistant from './DynamicAIAssistant';
import { useServerStore, useMetricsStore, useSystemStore } from '../../lib/store';
import { useRealTimeUpdates, useRealTimeNotifications } from '../../hooks/useRealTimeUpdates';
import { RealTimeIndicator, ConnectionStatus } from '../realtime/RealTimeIndicator';
import { NotificationContainer, type Notification } from '../ui/NotificationToast';
import type { MCPServer } from '../../lib/api';

export default function DynamicDashboard() {
  const { 
    servers, 
    isLoading: serversLoading, 
    error: serversError,
    fetchServers,
    setSelectedServer 
  } = useServerStore();
  
  const { 
    summary, 
    fetchSummary 
  } = useMetricsStore();
  
  const { 
    health, 
    fetchHealth 
  } = useSystemStore();

  const [selectedServer, setSelectedServerLocal] = React.useState<MCPServer | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Real-time updates
  const { 
    connected, 
    connecting, 
    reconnectAttempts, 
    maxReconnectAttempts 
  } = useRealTimeUpdates();
  
  const { notification, hasNewNotification } = useRealTimeNotifications();

  // Fetch data on component mount
  React.useEffect(() => {
    fetchServers();
    fetchSummary();
    fetchHealth();
  }, []);

  // Auto-refresh every 30 seconds (only when not connected to WebSocket)
  React.useEffect(() => {
    if (!connected) {
      const interval = setInterval(() => {
        fetchSummary();
        fetchHealth();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [connected]);

  // Handle new real-time notifications
  React.useEffect(() => {
    if (hasNewNotification && notification) {
      setNotifications(prev => [notification, ...prev.slice(0, 9)]); // Keep last 10
    }
  }, [hasNewNotification, notification]);

  const handleServerSelect = (server: MCPServer) => {
    setSelectedServerLocal(server);
    setSelectedServer(server);
  };

  const getSystemStatus = () => {
    if (health?.status === 'healthy') return 'Optimal';
    if (health?.status === 'degraded') return 'Degraded';
    return 'Unknown';
  };

  const getSystemStatusColor = () => {
    if (health?.status === 'healthy') return 'text-green-400';
    if (health?.status === 'degraded') return 'text-yellow-400';
    return 'text-gray-400';
  };

  const getActiveServers = () => {
    return servers.filter(server => server.status === 'healthy').length;
  };

  const getAverageResponseTime = () => {
    return summary?.performance?.averageResponseTime || 0;
  };

  const getRequestsPerSecond = () => {
    return summary?.bridge?.operations || 0;
  };

  const handleDismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <main className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold">MCP Management</h1>
              <span className="text-sm text-gray-400">mcp.collective-systems.de</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full animate-pulse ${
                  health?.status === 'healthy' ? 'bg-green-400' : 
                  health?.status === 'degraded' ? 'bg-yellow-400' : 'bg-gray-400'
                }`}></div>
                <span className="text-gray-300">
                  System {getSystemStatus()}
                </span>
              </div>
              
              {/* Real-time connection status */}
              <div className="border-l border-gray-700 pl-4">
                <ConnectionStatus
                  connected={connected}
                  connecting={connecting}
                  reconnectAttempts={reconnectAttempts}
                  maxReconnectAttempts={maxReconnectAttempts}
                />
              </div>
              
              <button className="text-gray-400 hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-[calc(100vh-12rem)]">
          
          {/* Main Dashboard Area (3/4 width) */}
          <div className="xl:col-span-3 space-y-6">
            
            {/* System Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* System Health */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">System Health</p>
                    <p className={`text-2xl font-semibold ${getSystemStatusColor()}`}>
                      {getSystemStatus()}
                    </p>
                  </div>
                  <div className="text-2xl">
                    {health?.status === 'healthy' ? '🟢' : 
                     health?.status === 'degraded' ? '🟡' : '⚪'}
                  </div>
                </div>
              </div>
              
              {/* Requests/sec */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">Operations/min</p>
                    <p className="text-2xl font-semibold">
                      {Math.round(getRequestsPerSecond())}
                    </p>
                  </div>
                  <div className="text-2xl">📈</div>
                </div>
              </div>
              
              {/* Avg Response */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">Avg Response</p>
                    <p className="text-2xl font-semibold">
                      {Math.round(getAverageResponseTime())}ms
                    </p>
                  </div>
                  <div className="text-2xl">⚡</div>
                </div>
              </div>
              
              {/* Active MCPs */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">Active MCPs</p>
                    <p className="text-2xl font-semibold">
                      {getActiveServers()}
                    </p>
                  </div>
                  <div className="text-2xl">🔗</div>
                </div>
              </div>
            </div>

            {/* MCP Servers Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    🔧 MCP Servers
                    <span className="text-sm text-gray-400 font-normal">
                      ({servers.length} total, {getActiveServers()} active)
                    </span>
                  </h2>
                  
                  {/* Real-time indicator for server list */}
                  <RealTimeIndicator
                    connected={connected}
                    connecting={connecting}
                    size="sm"
                    showLabel={false}
                  />
                </div>
                
                <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                  Add Server
                </button>
              </div>
              
              {/* Loading State */}
              {serversLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-400">Loading servers...</span>
                  </div>
                </div>
              )}

              {/* Error State */}
              {serversError && (
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Error loading servers</span>
                  </div>
                  <p className="text-red-300 mt-1">{serversError}</p>
                  <button 
                    onClick={fetchServers}
                    className="mt-2 px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Servers Grid */}
              {!serversLoading && !serversError && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {servers.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                      <Server className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-400 mb-2">No servers found</h3>
                      <p className="text-gray-500 mb-4">Get started by adding your first MCP server.</p>
                      <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                        Add Your First Server
                      </button>
                    </div>
                  ) : (
                    servers.map((server) => (
                      <DynamicMCPServerCard
                        key={server.id}
                        server={server}
                        onSelect={handleServerSelect}
                        onEdit={(server) => console.log('Edit server:', server)}
                        onDelete={(server) => console.log('Delete server:', server)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* AI Assistant Sidebar (1/4 width) */}
          <div className="xl:col-span-1">
            <DynamicAIAssistant 
              selectedServer={selectedServer}
              onServerAction={(action, serverId) => {
                console.log('AI Assistant action:', action, serverId);
              }}
            />
          </div>
        </div>
      </div>

      {/* Real-time notifications */}
      <NotificationContainer
        notifications={notifications}
        onDismiss={handleDismissNotification}
        maxNotifications={5}
      />
    </main>
  );
}