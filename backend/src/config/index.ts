import dotenv from 'dotenv';
import { AppConfig } from '@/types';

// Load environment variables
dotenv.config();

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'MCP_BRIDGE_URL',
  'MCP_AUTH_TOKEN'
];

// Validate required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  environment: (process.env.NODE_ENV as any) || 'development',
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'mcp_management',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10)
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    database: parseInt(process.env.REDIS_DB || '0', 10),
    ttl: parseInt(process.env.REDIS_TTL || '3600', 10)
  },

  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    apiToken: process.env.CLOUDFLARE_API_TOKEN!,
    zoneId: process.env.CLOUDFLARE_ZONE_ID || '',
    accessAppAUD: process.env.CLOUDFLARE_ACCESS_APP_AUD || ''
  },

  security: {
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
    
    rateLimiting: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
      skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'false'
    },

    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:4321', 'https://mcp.collective-systems.de'],
      credentials: true,
      maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10)
    }
  },

  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    format: (process.env.LOG_FORMAT as any) || 'json',
    destination: (process.env.LOG_DESTINATION as any) || 'console',
    maxFileSize: process.env.LOG_MAX_FILE_SIZE || '20m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '14', 10)
  },

  mcpBridge: {
    baseUrl: process.env.MCP_BRIDGE_URL!,
    authToken: process.env.MCP_AUTH_TOKEN!,
    timeout: parseInt(process.env.MCP_BRIDGE_TIMEOUT || '30000', 10),
    retryAttempts: parseInt(process.env.MCP_BRIDGE_RETRY || '3', 10),
    healthCheckInterval: parseInt(process.env.MCP_BRIDGE_HEALTH_INTERVAL || '30000', 10)
  }
};

// Environment-specific overrides
if (config.environment === 'production') {
  config.logging.level = 'warn';
  config.security.rateLimiting.max = 50; // Stricter rate limiting in production
}

if (config.environment === 'development') {
  config.logging.level = 'debug';
  config.security.cors.origin.push('http://localhost:3000', 'http://localhost:4321');
}

export default config;

// Helper functions for configuration
export const isDevelopment = () => config.environment === 'development';
export const isProduction = () => config.environment === 'production';
export const isStaging = () => config.environment === 'staging';

// Database URL parser (supports both URL and individual config)
export const getDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  const { host, port, database, username, password, ssl } = config.database;
  const sslParam = ssl ? '?sslmode=require' : '';
  return `postgresql://${username}:${password}@${host}:${port}/${database}${sslParam}`;
};

// Redis URL parser
export const getRedisUrl = (): string => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  
  const { host, port, password, database } = config.redis;
  const auth = password ? `:${password}@` : '';
  return `redis://${auth}${host}:${port}/${database}`;
};

// Validate configuration on startup
export const validateConfig = (): void => {
  const errors: string[] = [];

  // Validate port
  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  // Validate JWT secret length
  if (config.security.jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }

  // Validate rate limiting
  if (config.security.rateLimiting.windowMs < 1000) {
    errors.push('RATE_LIMIT_WINDOW_MS must be at least 1000ms');
  }

  // Validate MCP Bridge URL
  try {
    new URL(config.mcpBridge.baseUrl);
  } catch {
    errors.push('MCP_BRIDGE_URL must be a valid URL');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
};

// Export individual config sections
export const {
  database: databaseConfig,
  redis: redisConfig,
  cloudflare: cloudflareConfig,
  security: securityConfig,
  logging: loggingConfig,
  mcpBridge: mcpBridgeConfig
} = config;