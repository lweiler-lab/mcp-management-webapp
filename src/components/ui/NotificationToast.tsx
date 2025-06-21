import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info, Bell } from 'lucide-react';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'alert';
  title: string;
  message: string;
  timestamp: Date;
  serverId?: string;
  serverName?: string;
  autoClose?: boolean;
  duration?: number;
}

interface NotificationToastProps {
  notification: Notification;
  onClose: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ 
  notification, 
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Auto-close logic
  useEffect(() => {
    if (notification.autoClose !== false) {
      const duration = notification.duration || 5000; // Default 5 seconds
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Show animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose(notification.id);
    }, 300); // Animation duration
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'alert':
        return <Bell className="w-5 h-5 text-orange-400" />;
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getBackgroundColor = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-green-900/20 border-green-700/30';
      case 'error':
        return 'bg-red-900/20 border-red-700/30';
      case 'warning':
        return 'bg-yellow-900/20 border-yellow-700/30';
      case 'alert':
        return 'bg-orange-900/20 border-orange-700/30';
      default:
        return 'bg-blue-900/20 border-blue-700/30';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div
      className={`
        max-w-sm w-full bg-gray-800 border rounded-lg shadow-lg pointer-events-auto
        transform transition-all duration-300 ease-out
        ${isVisible && !isClosing ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${getBackgroundColor()}
      `}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getIcon()}
          </div>
          
          <div className="ml-3 w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">
                {notification.title}
              </p>
              <div className="text-xs text-gray-400">
                {formatTime(notification.timestamp)}
              </div>
            </div>
            
            <p className="mt-1 text-sm text-gray-300">
              {notification.message}
            </p>
            
            {notification.serverName && (
              <div className="mt-2 flex items-center">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-700 text-gray-300">
                  {notification.serverName}
                </span>
              </div>
            )}
          </div>
          
          <div className="ml-4 flex-shrink-0 flex">
            <button
              className="inline-flex text-gray-400 hover:text-gray-300 focus:outline-none focus:text-gray-300 transition-colors"
              onClick={handleClose}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface NotificationContainerProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  maxNotifications?: number;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({ 
  notifications, 
  onDismiss,
  maxNotifications = 5 
}) => {
  // Limit number of visible notifications
  const visibleNotifications = notifications.slice(0, maxNotifications);

  return (
    <div className="fixed top-0 right-0 z-50 p-4 space-y-4 pointer-events-none">
      {visibleNotifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onClose={onDismiss}
        />
      ))}
      
      {notifications.length > maxNotifications && (
        <div className="max-w-sm w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg pointer-events-auto">
          <div className="p-3 text-center">
            <p className="text-sm text-gray-400">
              +{notifications.length - maxNotifications} more notifications
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationToast;