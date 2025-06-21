import React from 'react';
import { Send, Bot, User, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import type { MCPServer } from '../../lib/api';

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  serverId?: string;
  actions?: Array<{
    type: string;
    label: string;
    data: any;
  }>;
}

interface DynamicAIAssistantProps {
  selectedServer?: MCPServer | null;
  onServerAction?: (action: string, serverId: string, data?: any) => void;
}

export default function DynamicAIAssistant({ 
  selectedServer, 
  onServerAction 
}: DynamicAIAssistantProps) {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: '1',
      type: 'system',
      content: 'AI Assistant connected. I can help you manage your MCP servers, analyze metrics, and troubleshoot issues.',
      timestamp: new Date()
    }
  ]);
  
  const [input, setInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add context message when server is selected
  React.useEffect(() => {
    if (selectedServer) {
      const contextMessage: Message = {
        id: `context-${Date.now()}`,
        type: 'system',
        content: `Now viewing ${selectedServer.displayName || selectedServer.name} (${selectedServer.environment}). I can help you with this server's status, metrics, and management.`,
        timestamp: new Date(),
        serverId: selectedServer.id
      };
      setMessages(prev => [...prev, contextMessage]);
    }
  }, [selectedServer]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: input.trim(),
      timestamp: new Date(),
      serverId: selectedServer?.id
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      // Use real AI API instead of simulation
      const { apiClient } = await import('../../lib/api');
      
      // Build conversation history for context
      const conversationHistory = messages
        .filter(msg => msg.type !== 'system')
        .slice(-10) // Last 10 messages
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));

      const response = await apiClient.generateChatResponse(
        messageText,
        selectedServer?.id,
        conversationHistory
      );

      if (response.success && response.data) {
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          type: 'assistant',
          content: response.data.response,
          timestamp: new Date(),
          serverId: selectedServer?.id,
          actions: response.data.actions
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(response.error || 'Failed to get AI response');
      }
    } catch (error) {
      console.error('AI chat error:', error);
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        type: 'system',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleActionClick = (action: any) => {
    if (onServerAction && action.data?.serverId) {
      onServerAction(action.type, action.data.serverId, action.data);
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <User className="w-4 h-4" />;
      case 'assistant':
        return <Bot className="w-4 h-4" />;
      case 'system':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Bot className="w-4 h-4" />;
    }
  };

  const getMessageColor = (type: string) => {
    switch (type) {
      case 'user':
        return 'bg-blue-600/20 border-blue-600/30';
      case 'assistant':
        return 'bg-gray-700/50 border-gray-600/30';
      case 'system':
        return 'bg-yellow-600/20 border-yellow-600/30';
      default:
        return 'bg-gray-700/50 border-gray-600/30';
    }
  };

  return (
    <div className="h-full bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-white">AI Assistant</h3>
          <div className="ml-auto flex items-center gap-1">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-400">Online</span>
          </div>
        </div>
        {selectedServer && (
          <div className="mt-2 text-xs text-gray-400">
            Context: {selectedServer.displayName || selectedServer.name}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div className={`p-3 rounded-lg border ${getMessageColor(message.type)}`}>
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  {getMessageIcon(message.type)}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-200 whitespace-pre-wrap">
                    {message.content}
                  </p>
                  
                  {/* Action Buttons */}
                  {message.actions && message.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.actions.map((action, index) => (
                        <button
                          key={index}
                          onClick={() => handleActionClick(action)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">AI is thinking...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={selectedServer 
              ? `Ask about ${selectedServer.displayName || selectedServer.name}...`
              : "Ask me about your MCP servers..."
            }
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            className="self-end px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Simulate AI responses with context awareness
async function simulateAIResponse(
  message: Message, 
  selectedServer?: MCPServer | null
): Promise<{ content: string; actions?: any[] }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

  const query = message.content.toLowerCase();

  // Context-aware responses
  if (selectedServer) {
    if (query.includes('status') || query.includes('health')) {
      return {
        content: `${selectedServer.displayName || selectedServer.name} is currently ${selectedServer.status}. Health score: ${Math.round(selectedServer.healthScore * 100)}%. ${selectedServer.bridgeStatus?.connected ? 'Bridge connection is active.' : 'Bridge connection is not available.'}`,
        actions: [
          {
            type: 'health_check',
            label: 'Run Health Check',
            data: { serverId: selectedServer.id }
          }
        ]
      };
    }

    if (query.includes('restart') || query.includes('reboot')) {
      return {
        content: `I can help you restart ${selectedServer.displayName || selectedServer.name}. Please note that this will temporarily interrupt service. Would you like to proceed?`,
        actions: [
          {
            type: 'restart_server',
            label: 'Restart Server',
            data: { serverId: selectedServer.id }
          }
        ]
      };
    }

    if (query.includes('metrics') || query.includes('performance')) {
      return {
        content: `Here's the current performance overview for ${selectedServer.displayName || selectedServer.name}:\n\n• Health Score: ${Math.round(selectedServer.healthScore * 100)}%\n• Status: ${selectedServer.status}\n• Environment: ${selectedServer.environment}\n• Last Updated: ${new Date(selectedServer.updatedAt).toLocaleString()}`,
        actions: [
          {
            type: 'view_metrics',
            label: 'View Detailed Metrics',
            data: { serverId: selectedServer.id }
          }
        ]
      };
    }
  }

  // General responses
  if (query.includes('hello') || query.includes('hi')) {
    return {
      content: selectedServer 
        ? `Hello! I'm here to help you manage ${selectedServer.displayName || selectedServer.name}. You can ask me about its status, metrics, or perform management actions.`
        : 'Hello! I\'m your MCP management assistant. I can help you monitor servers, analyze metrics, and troubleshoot issues. Select a server to get started!'
    };
  }

  if (query.includes('help')) {
    return {
      content: `I can help you with:\n\n• Server status and health checks\n• Performance metrics and analysis\n• Troubleshooting and diagnostics\n• Server management actions\n• Alert and notification setup\n\nJust ask me about any of these topics!`
    };
  }

  if (query.includes('servers') || query.includes('list')) {
    return {
      content: 'I can see your MCP servers in the dashboard. Would you like me to analyze their overall health or focus on a specific server?',
      actions: [
        {
          type: 'analyze_all',
          label: 'Analyze All Servers',
          data: {}
        }
      ]
    };
  }

  if (query.includes('alert') || query.includes('notification')) {
    return {
      content: 'I can help you set up alerts for various conditions like:\n\n• Server downtime\n• Performance degradation\n• Error rate thresholds\n• Resource usage limits\n\nWhat type of alert would you like to configure?'
    };
  }

  // Default response
  return {
    content: selectedServer
      ? `I understand you're asking about ${selectedServer.displayName || selectedServer.name}. Could you be more specific about what you'd like to know? I can help with status, metrics, troubleshooting, or management actions.`
      : 'I\'m here to help with your MCP servers! You can ask me about server status, performance metrics, troubleshooting, or management actions. Try selecting a server first for more specific assistance.'
  };
}