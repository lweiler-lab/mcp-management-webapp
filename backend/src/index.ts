import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import WebSocket from 'ws';

// Import configuration and utilities
import config, { validateConfig } from '@/config';
import Logger from '@/utils/logger';
import { db } from '@/database/connection';

// Import middleware
import {
  securityHeaders,
  requestContext,
  validateInput,
  auditLog,
  securityErrorHandler,
  corsConfig
} from '@/middleware/security';

// Import routes
import routes from '@/routes';

// Import services
import WebSocketManager from '@/services/webSocketManager';
import { getMCPBridgeClient } from '@/services/mcpBridgeClient';

/**
 * MCP Management API Server
 * 
 * Enterprise-grade API server for managing MCP servers with:
 * - Cloudflare Zero Trust security
 * - Real-time WebSocket communication
 * - PostgreSQL database with audit trails
 * - Read-only integration with existing MCP Bridge
 * - Comprehensive monitoring and logging
 */

class MCPManagementServer {
  private app: express.Application;
  private server: any;
  private wsManager?: WebSocketManager;
  private mcpBridge: any;

  constructor() {
    this.app = express();
    this.mcpBridge = getMCPBridgeClient();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security headers (must be first)
    this.app.use(securityHeaders);

    // CORS configuration
    this.app.use(cors(corsConfig));

    // Request context and tracking
    this.app.use(requestContext);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Input validation and sanitization
    this.app.use(validateInput);

    // Audit logging
    this.app.use(auditLog);

    Logger.info('Middleware setup completed');
  }

  private setupRoutes(): void {
    // Health check endpoint (before other routes)
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'MCP Management API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          api: '/api',
          docs: '/api/docs',
          websocket: '/ws'
        }
      });
    });

    // API routes
    this.app.use('/', routes);

    Logger.info('Routes setup completed');
  }

  private setupErrorHandling(): void {
    // Security error handler
    this.app.use(securityErrorHandler);

    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      Logger.exception(error, {
        request_id: req.requestId,
        user_id: (req as any).user?.id,
        url: req.originalUrl,
        method: req.method
      });

      // Don't expose internal errors in production
      const isDevelopment = config.environment === 'development';
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: isDevelopment ? error.message : 'An unexpected error occurred',
        requestId: req.requestId,
        ...(isDevelopment && { stack: error.stack })
      });
    });

    // 404 handler
    this.app.use((req: express.Request, res: express.Response) => {
      Logger.api('404 Not Found', req.requestId, {
        url: req.originalUrl,
        method: req.method,
        client_ip: req.clientIP
      });

      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `The requested resource ${req.originalUrl} was not found`,
        requestId: req.requestId
      });
    });

    Logger.info('Error handling setup completed');
  }

  private async initializeDatabase(): Promise<void> {
    try {
      Logger.info('Initializing database connection...');
      
      const isHealthy = await db.healthCheck();
      if (!isHealthy) {
        throw new Error('Database health check failed');
      }

      const dbInfo = await db.getConnectionInfo();
      Logger.info('Database connection established', {
        database: dbInfo.database,
        total_connections: dbInfo.totalConnections,
        idle_connections: dbInfo.idleConnections
      });

      // Run any pending migrations
      // await this.runMigrations();

    } catch (error) {
      Logger.error('Database initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async initializeMCPBridge(): Promise<void> {
    try {
      Logger.info('Initializing MCP Bridge connection...');
      
      const connectionTest = await this.mcpBridge.testConnection();
      
      if (connectionTest.connected) {
        Logger.info('MCP Bridge connection established', {
          url: config.mcpBridge.baseUrl,
          response_time: connectionTest.responseTime,
          version: connectionTest.version
        });
      } else {
        Logger.warn('MCP Bridge connection failed', {
          url: config.mcpBridge.baseUrl,
          error: connectionTest.error,
          response_time: connectionTest.responseTime
        });
        // Continue startup even if bridge is unavailable
      }

    } catch (error) {
      Logger.warn('MCP Bridge initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url: config.mcpBridge.baseUrl
      });
      // Continue startup - bridge connection is not critical for API functionality
    }
  }

  private initializeWebSocket(): void {
    try {
      Logger.info('Initializing WebSocket server...');
      
      this.wsManager = WebSocketManager.getInstance(this.server);
      
      Logger.info('WebSocket server initialized', {
        port: config.port + 1,
        path: '/ws'
      });

    } catch (error) {
      Logger.error('WebSocket initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      Logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        this.server.close(() => {
          Logger.info('HTTP server closed');
        });

        // Close WebSocket connections
        if (this.wsManager) {
          await this.wsManager.shutdown();
          Logger.info('WebSocket server closed');
        }

        // Close MCP Bridge client
        await this.mcpBridge.shutdown();
        Logger.info('MCP Bridge client closed');

        // Close database connections
        await db.close();
        Logger.info('Database connections closed');

        Logger.info('Graceful shutdown completed');
        process.exit(0);

      } catch (error) {
        Logger.error('Error during graceful shutdown', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      Logger.exception(error, { context: 'uncaught_exception' });
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      Logger.error('Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
      });
      shutdown('unhandledRejection');
    });
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();
      Logger.info('Configuration validated');

      // Initialize database
      await this.initializeDatabase();

      // Initialize MCP Bridge connection
      await this.initializeMCPBridge();

      // Create HTTP server
      this.server = createServer(this.app);

      // Initialize WebSocket
      this.initializeWebSocket();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Start server
      this.server.listen(config.port, () => {
        Logger.info('MCP Management API Server started', {
          port: config.port,
          environment: config.environment,
          version: '1.0.0',
          endpoints: {
            api: `http://localhost:${config.port}/api`,
            health: `http://localhost:${config.port}/health`,
            websocket: `ws://localhost:${config.port + 1}/ws`
          }
        });

        // Log startup summary
        this.logStartupSummary();
      });

    } catch (error) {
      Logger.error('Server startup failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      process.exit(1);
    }
  }

  private logStartupSummary(): void {
    Logger.info('='.repeat(60));
    Logger.info('🚀 MCP Management API Server - READY');
    Logger.info('='.repeat(60));
    Logger.info(`📍 Environment: ${config.environment}`);
    Logger.info(`🌐 API Server: http://localhost:${config.port}`);
    Logger.info(`🔌 WebSocket: ws://localhost:${config.port + 1}/ws`);
    Logger.info(`🔗 MCP Bridge: ${config.mcpBridge.baseUrl}`);
    Logger.info(`📊 Health Check: http://localhost:${config.port}/health`);
    Logger.info(`📖 API Docs: http://localhost:${config.port}/api/docs`);
    Logger.info('='.repeat(60));
  }
}

// Start the server
if (require.main === module) {
  const server = new MCPManagementServer();
  server.start().catch((error) => {
    Logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  });
}

export default MCPManagementServer;