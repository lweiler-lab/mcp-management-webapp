import React from 'react';
import { Wifi, WifiOff, Clock, Activity } from 'lucide-react';

interface RealTimeIndicatorProps {
  connected: boolean;
  connecting?: boolean;
  lastUpdateTime?: Date | null;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const RealTimeIndicator: React.FC<RealTimeIndicatorProps> = ({
  connected,
  connecting = false,
  lastUpdateTime,
  className = '',
  showLabel = true,
  size = 'md'
}) => {
  const getStatusColor = () => {
    if (connecting) return 'text-yellow-400';
    if (connected) return 'text-green-400';
    return 'text-gray-400';
  };

  const getStatusText = () => {
    if (connecting) return 'Connecting...';
    if (connected) return 'Live';
    return 'Offline';
  };

  const getIcon = () => {
    const iconSize = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
    
    if (connecting) {
      return <Clock className={`${iconSize} animate-pulse`} />;
    }
    
    if (connected) {
      return <Activity className={`${iconSize} animate-pulse`} />;
    }
    
    return <WifiOff className={iconSize} />;
  };

  const formatLastUpdate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) { // Less than 1 minute
      return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    } else {
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  };

  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`${getStatusColor()}`}>
        {getIcon()}
      </div>
      
      {showLabel && (
        <div className="flex flex-col">
          <span className={`${textSize} ${getStatusColor()} font-medium`}>
            {getStatusText()}
          </span>
          
          {lastUpdateTime && connected && (
            <span className="text-xs text-gray-400">
              Updated {formatLastUpdate(lastUpdateTime)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

interface ConnectionStatusProps {
  connected: boolean;
  connecting?: boolean;
  reconnectAttempts?: number;
  maxReconnectAttempts?: number;
  onRetryConnection?: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connected,
  connecting = false,
  reconnectAttempts = 0,
  maxReconnectAttempts = 5,
  onRetryConnection
}) => {
  if (connected) {
    return (
      <div className="flex items-center gap-2 text-green-400">
        <Wifi className="w-4 h-4" />
        <span className="text-sm">Connected</span>
      </div>
    );
  }

  if (connecting) {
    return (
      <div className="flex items-center gap-2 text-yellow-400">
        <Clock className="w-4 h-4 animate-spin" />
        <span className="text-sm">
          Connecting{reconnectAttempts > 0 && ` (${reconnectAttempts}/${maxReconnectAttempts})`}...
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 text-red-400">
        <WifiOff className="w-4 h-4" />
        <span className="text-sm">Disconnected</span>
      </div>
      
      {onRetryConnection && reconnectAttempts < maxReconnectAttempts && (
        <button
          onClick={onRetryConnection}
          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Retry
        </button>
      )}
      
      {reconnectAttempts >= maxReconnectAttempts && (
        <span className="text-xs text-red-400">
          Max retries reached
        </span>
      )}
    </div>
  );
};

interface LiveDataBadgeProps {
  isLive: boolean;
  isPulsing?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const LiveDataBadge: React.FC<LiveDataBadgeProps> = ({
  isLive,
  isPulsing = true,
  size = 'sm',
  className = ''
}) => {
  const badgeSize = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${badgeSize}
        ${isLive 
          ? 'bg-green-900/30 text-green-400 border border-green-700/30' 
          : 'bg-gray-900/30 text-gray-400 border border-gray-700/30'
        }
        ${className}
      `}
    >
      <div 
        className={`
          w-2 h-2 rounded-full
          ${isLive ? 'bg-green-400' : 'bg-gray-400'}
          ${isLive && isPulsing ? 'animate-pulse' : ''}
        `}
      />
      {isLive ? 'LIVE' : 'OFFLINE'}
    </span>
  );
};

export default RealTimeIndicator;