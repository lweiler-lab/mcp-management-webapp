// Configuration for MCP Management Web App

export const config = {
  // MCP Bridge Configuration
  mcpBridge: {
    url: process.env.MCP_BRIDGE_URL || 'http://localhost:3001',
    wsUrl: process.env.MCP_BRIDGE_WS_URL || 'ws://localhost:3001',
    authToken: process.env.MCP_AUTH_TOKEN || 'mcp_dev_key_2025_secure_flow_memory',
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'gpt-4',
    maxTokens: 1000,
    temperature: 0.7,
  },

  // UI Configuration
  ui: {
    theme: 'dark',
    updateInterval: 5000, // 5 seconds
    maxChatHistory: 100,
    cardRefreshInterval: 10000, // 10 seconds
  },

  // Development settings
  dev: {
    mockData: process.env.NODE_ENV === 'development',
    debugMode: process.env.DEBUG === 'true',
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  // Security settings
  security: {
    allowedOrigins: [
      'https://mcp.collective-systems.de',
      'http://localhost:4321',
      'http://localhost:3000',
    ],
    rateLimiting: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60000, // 1 minute
    },
  },
} as const;

export type Config = typeof config;