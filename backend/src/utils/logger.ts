import winston from 'winston';
import config from '@/config';

// Define log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

// Add colors to winston
winston.addColors(logColors);

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      service: 'mcp-management-api',
      environment: config.environment,
      ...meta
    };
    return JSON.stringify(logEntry);
  })
);

// Simple format for development
const simpleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Determine format based on config
const logFormat = config.logging.format === 'json' ? structuredFormat : simpleFormat;

// Create transports array
const transports: winston.transport[] = [];

// Console transport
if (config.logging.destination === 'console' || config.logging.destination === 'both') {
  transports.push(
    new winston.transports.Console({
      level: config.logging.level,
      format: logFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );
}

// File transport
if (config.logging.destination === 'file' || config.logging.destination === 'both') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: structuredFormat,
      maxsize: parseInt(config.logging.maxFileSize.replace('m', '')) * 1024 * 1024,
      maxFiles: config.logging.maxFiles,
      tailable: true,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: 'logs/combined.log',
      level: config.logging.level,
      format: structuredFormat,
      maxsize: parseInt(config.logging.maxFileSize.replace('m', '')) * 1024 * 1024,
      maxFiles: config.logging.maxFiles,
      tailable: true
    })
  );

  // Audit log file for security events
  transports.push(
    new winston.transports.File({
      filename: 'logs/audit.log',
      level: 'info',
      format: structuredFormat,
      maxsize: parseInt(config.logging.maxFileSize.replace('m', '')) * 1024 * 1024,
      maxFiles: config.logging.maxFiles * 2, // Keep audit logs longer
      tailable: true
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
  silent: process.env.NODE_ENV === 'test'
});

// Enhanced logging methods with context
export class Logger {
  static error(message: string, meta?: any): void {
    logger.error(message, { ...meta, context: 'application' });
  }

  static warn(message: string, meta?: any): void {
    logger.warn(message, { ...meta, context: 'application' });
  }

  static info(message: string, meta?: any): void {
    logger.info(message, { ...meta, context: 'application' });
  }

  static debug(message: string, meta?: any): void {
    logger.debug(message, { ...meta, context: 'application' });
  }

  // Security-specific logging
  static security(message: string, meta?: any): void {
    logger.warn(message, { 
      ...meta, 
      context: 'security',
      security_event: true,
      timestamp: new Date().toISOString()
    });
  }

  // Audit logging for compliance
  static audit(action: string, meta?: any): void {
    logger.info(`AUDIT: ${action}`, {
      ...meta,
      context: 'audit',
      audit_event: true,
      timestamp: new Date().toISOString()
    });
  }

  // Performance logging
  static performance(operation: string, duration: number, meta?: any): void {
    logger.info(`PERFORMANCE: ${operation}`, {
      ...meta,
      context: 'performance',
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });
  }

  // Request logging
  static request(method: string, url: string, statusCode: number, duration: number, meta?: any): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    logger.log(level, `${method} ${url} ${statusCode}`, {
      ...meta,
      context: 'http',
      method,
      url,
      status_code: statusCode,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });
  }

  // Database logging
  static database(operation: string, query?: string, duration?: number, meta?: any): void {
    logger.debug(`DB: ${operation}`, {
      ...meta,
      context: 'database',
      operation,
      query: query ? query.substring(0, 200) : undefined, // Truncate long queries
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });
  }

  // WebSocket logging
  static websocket(event: string, clientId?: string, meta?: any): void {
    logger.debug(`WS: ${event}`, {
      ...meta,
      context: 'websocket',
      event,
      client_id: clientId,
      timestamp: new Date().toISOString()
    });
  }

  // MCP Bridge logging
  static mcpBridge(operation: string, meta?: any): void {
    logger.debug(`MCP Bridge: ${operation}`, {
      ...meta,
      context: 'mcp_bridge',
      operation,
      timestamp: new Date().toISOString()
    });
  }

  // API logging with request tracking
  static api(message: string, requestId?: string, meta?: any): void {
    logger.info(message, {
      ...meta,
      context: 'api',
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }

  // Health check logging
  static health(service: string, status: 'healthy' | 'unhealthy' | 'degraded', meta?: any): void {
    const level = status === 'healthy' ? 'debug' : status === 'degraded' ? 'warn' : 'error';
    logger.log(level, `Health Check: ${service} is ${status}`, {
      ...meta,
      context: 'health_check',
      service,
      status,
      timestamp: new Date().toISOString()
    });
  }

  // Structured error logging with stack traces
  static exception(error: Error, meta?: any): void {
    logger.error('Unhandled Exception', {
      ...meta,
      context: 'exception',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date().toISOString()
    });
  }

  // Rate limiting logs
  static rateLimit(ip: string, endpoint: string, meta?: any): void {
    logger.warn('Rate limit exceeded', {
      ...meta,
      context: 'rate_limit',
      ip_address: ip,
      endpoint,
      timestamp: new Date().toISOString()
    });
  }

  // Authentication logs
  static auth(event: 'login' | 'logout' | 'token_refresh' | 'auth_failure', userId?: string, meta?: any): void {
    const level = event === 'auth_failure' ? 'warn' : 'info';
    logger.log(level, `Auth: ${event}`, {
      ...meta,
      context: 'authentication',
      event,
      user_id: userId,
      timestamp: new Date().toISOString()
    });
  }
}

// Export both the winston logger and our enhanced Logger class
export { logger };
export default Logger;