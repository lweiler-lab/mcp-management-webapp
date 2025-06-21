import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import type { MCPServer } from '../../types';

interface MCPServerCardProps {
  server: MCPServer;
  onRestart?: (serverId: string) => void;
  onConfigure?: (serverId: string) => void;
  onViewLogs?: (serverId: string) => void;
}

export const MCPServerCard: React.FC<MCPServerCardProps> = ({
  server,
  onRestart,
  onConfigure,
  onViewLogs,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-400';
      case 'degraded': return 'text-yellow-400';
      case 'offline': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '🟢';
      case 'degraded': return '🟡';
      case 'offline': return '🔴';
      default: return '⚫';
    }
  };

  const formatUptime = (uptime: number) => {
    const days = Math.floor(uptime / (24 * 60 * 60 * 1000));
    const hours = Math.floor((uptime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <Card className="hover:border-gray-600 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {getStatusIcon(server.status)}
            {server.name}
          </CardTitle>
          <span className={`text-sm font-medium ${getStatusColor(server.status)}`}>
            {server.status}
          </span>
        </div>
        <p className="text-sm text-gray-400">{server.description}</p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-gray-400">Uptime</p>
            <p className="text-sm font-medium">{formatUptime(server.metrics.uptime)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-400">Response Time</p>
            <p className="text-sm font-medium">{server.metrics.responseTime}ms</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-400">Success Rate</p>
            <p className="text-sm font-medium">{(server.metrics.successRate * 100).toFixed(1)}%</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-400">Requests</p>
            <p className="text-sm font-medium">{server.metrics.requestCount.toLocaleString()}</p>
          </div>
        </div>

        {/* Performance Sparkline Placeholder */}
        <div className="h-8 bg-gray-700 rounded flex items-center justify-center">
          <span className="text-xs text-gray-400">Performance trend</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onRestart?.(server.id)}
            className="flex-1"
          >
            Restart
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => onConfigure?.(server.id)}
            className="flex-1"
          >
            Configure
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => onViewLogs?.(server.id)}
            className="flex-1"
          >
            Logs
          </Button>
        </div>

        {/* Last Active */}
        <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
          Last active: {server.lastActive.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
};