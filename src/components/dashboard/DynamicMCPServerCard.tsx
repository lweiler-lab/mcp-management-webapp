import React from 'react';
import { Activity, AlertCircle, CheckCircle, Clock, MoreVertical, Play, Pause, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { MCPServer } from '../../lib/api';
import { useServerStore } from '../../lib/store';
import { useRealTimeServerStatus } from '../../hooks/useRealTimeUpdates';
import { LiveDataBadge } from '../realtime/RealTimeIndicator';

interface DynamicMCPServerCardProps {
  server: MCPServer;
  onSelect?: (server: MCPServer) => void;
  onEdit?: (server: MCPServer) => void;
  onDelete?: (server: MCPServer) => void;
}

export default function DynamicMCPServerCard({ 
  server, 
  onSelect, 
  onEdit, 
  onDelete 
}: DynamicMCPServerCardProps) {
  const { triggerHealthCheck } = useServerStore();
  const { hasRecentUpdate, lastUpdateTime } = useRealTimeServerStatus(server.id);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-400 bg-green-400/10';
      case 'warning':
        return 'text-yellow-400 bg-yellow-400/10';
      case 'critical':
        return 'text-red-400 bg-red-400/10';
      case 'inactive':
        return 'text-gray-400 bg-gray-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4" />;
      case 'critical':
        return <AlertCircle className="w-4 h-4" />;
      case 'inactive':
        return <Pause className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getEnvironmentColor = (environment: string) => {
    switch (environment) {
      case 'production':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'staging':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'development':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const handleHealthCheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      await triggerHealthCheck(server.id);
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardClick = () => {
    onSelect?.(server);
  };

  const handleDropdownAction = (action: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDropdownOpen(false);
    
    switch (action) {
      case 'edit':
        onEdit?.(server);
        break;
      case 'delete':
        onDelete?.(server);
        break;
    }
  };

  return (
    <div 
      className="group relative bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-all duration-200 cursor-pointer"
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${getStatusColor(server.status)}`}>
              {getStatusIcon(server.status)}
            </div>
            <div>
              <h3 className="font-semibold text-white">
                {server.displayName || server.name}
              </h3>
              <p className="text-sm text-gray-400">{server.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Live data indicator */}
            <LiveDataBadge 
              isLive={hasRecentUpdate} 
              size="sm"
            />
            
            {/* Environment Badge */}
            <span className={`px-2 py-1 text-xs rounded border ${getEnvironmentColor(server.environment)}`}>
              {server.environment}
            </span>
            
            {/* Actions Dropdown */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(!isDropdownOpen);
                }}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-300"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute right-0 top-8 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10">
                  <button
                    onClick={(e) => handleDropdownAction('edit', e)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Edit Server
                  </button>
                  <button
                    onClick={handleHealthCheck}
                    disabled={isLoading}
                    className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                  >
                    <Activity className="w-4 h-4" />
                    {isLoading ? 'Checking...' : 'Health Check'}
                  </button>
                  <button
                    onClick={(e) => handleDropdownAction('delete', e)}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Delete Server
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {server.description && (
          <p className="mt-2 text-sm text-gray-400 line-clamp-2">
            {server.description}
          </p>
        )}
      </div>

      {/* Metrics */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Health Score */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Health Score</span>
              <span className="text-sm font-medium text-white">
                {Math.round(server.healthScore * 100)}%
              </span>
            </div>
            <div className="mt-1 w-full bg-gray-700 rounded-full h-1.5">
              <div 
                className={`h-1.5 rounded-full ${
                  server.healthScore > 0.8 ? 'bg-green-400' :
                  server.healthScore > 0.6 ? 'bg-yellow-400' :
                  'bg-red-400'
                }`}
                style={{ width: `${server.healthScore * 100}%` }}
              />
            </div>
          </div>

          {/* Bridge Status */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Bridge</span>
              <span className={`text-sm font-medium ${
                server.bridgeStatus?.connected ? 'text-green-400' : 'text-red-400'
              }`}>
                {server.bridgeStatus?.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {server.bridgeStatus?.activeConnections !== undefined && (
              <div className="mt-1 text-xs text-gray-500">
                {server.bridgeStatus.activeConnections} active connections
              </div>
            )}
          </div>

          {/* Last Updated */}
          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Last Updated</span>
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(server.updatedAt), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>

        {/* Tags */}
        {server.tags && server.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {server.tags.slice(0, 3).map((tag, index) => (
              <span 
                key={index}
                className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded"
              >
                {tag}
              </span>
            ))}
            {server.tags.length > 3 && (
              <span className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">
                +{server.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-2 text-white">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Checking health...</span>
          </div>
        </div>
      )}

      {/* Click outside handler for dropdown */}
      {isDropdownOpen && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  );
}