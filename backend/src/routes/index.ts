import { Router } from 'express';
import serverRoutes from './serverRoutes';
import authRoutes from './authRoutes';
import metricsRoutes from './metricsRoutes';
import healthRoutes from './healthRoutes';
import userRoutes from './userRoutes';
import systemRoutes from './systemRoutes';
import aiRoutes from './ai';

/**
 * Main API Router
 * Combines all route modules with proper versioning
 */
const router = Router();

// Health check (no authentication required)
router.use('/health', healthRoutes);

// Authentication routes (public)
router.use('/auth', authRoutes);

// API v1 routes (authenticated)
router.use('/api/v1/servers', serverRoutes);
router.use('/api/v1/metrics', metricsRoutes);
router.use('/api/v1/users', userRoutes);
router.use('/api/v1/system', systemRoutes);
router.use('/api/v1/ai', aiRoutes);

// API root info
router.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'MCP Management API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      authentication: '/auth',
      servers: '/api/v1/servers',
      metrics: '/api/v1/metrics',
      users: '/api/v1/users',
      system: '/api/v1/system',
      ai: '/api/v1/ai',
      health: '/health'
    },
    websocket: '/ws',
    timestamp: new Date().toISOString()
  });
});

// API documentation placeholder
router.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'API Documentation',
    swagger: 'https://swagger.io/specification/',
    endpoints: [
      {
        path: '/health',
        methods: ['GET'],
        description: 'System health check',
        authentication: false
      },
      {
        path: '/auth/login',
        methods: ['POST'],
        description: 'User authentication',
        authentication: false
      },
      {
        path: '/api/v1/servers',
        methods: ['GET', 'POST'],
        description: 'MCP server management',
        authentication: true,
        permissions: ['servers:read', 'servers:write']
      },
      {
        path: '/api/v1/servers/:id',
        methods: ['GET', 'PUT', 'DELETE'],
        description: 'Individual server operations',
        authentication: true,
        permissions: ['servers:read', 'servers:write', 'servers:delete']
      },
      {
        path: '/api/v1/metrics',
        methods: ['GET'],
        description: 'Performance metrics',
        authentication: true,
        permissions: ['metrics:read']
      },
      {
        path: '/api/v1/users',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'User management',
        authentication: true,
        permissions: ['users:read', 'users:write']
      },
      {
        path: '/api/v1/system',
        methods: ['GET'],
        description: 'System information and configuration',
        authentication: true,
        permissions: ['system:read']
      },
      {
        path: '/api/v1/ai',
        methods: ['GET', 'POST'],
        description: 'AI-powered operations and analysis',
        authentication: true,
        permissions: ['ai:read', 'ai:write'],
        endpoints: [
          '/status - Get AI service status',
          '/analyze/server - Analyze server health',
          '/predict - Generate predictive analysis',
          '/chat - AI chat assistant',
          '/analyze/patterns - Pattern and anomaly analysis',
          '/incident/response - Generate incident response plans'
        ]
      }
    ],
    websocket: {
      url: '/ws',
      protocol: 'mcp-management-v1',
      authentication: 'JWT token required',
      events: [
        'server_status_update',
        'metrics_update',
        'alert_triggered',
        'server_created',
        'server_updated',
        'server_deleted'
      ]
    }
  });
});

export default router;