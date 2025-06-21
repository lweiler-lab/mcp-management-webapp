import { Router } from 'express';
import ServerController from '@/controllers/serverController';
import { authenticate, authorize, requireRole, rateLimiter } from '@/middleware/security';

/**
 * Server Management Routes
 * Handles all MCP server management endpoints
 */
const router = Router();
const serverController = new ServerController();

// Apply authentication to all server routes
router.use(authenticate);

/**
 * GET /api/v1/servers
 * List all managed servers with filtering and pagination
 * Permission: servers:read
 */
router.get(
  '/',
  rateLimiter.api(),
  authorize('servers:read'),
  serverController.getServers
);

/**
 * POST /api/v1/servers
 * Create a new managed server (metadata only)
 * Permission: servers:write
 */
router.post(
  '/',
  rateLimiter.api(),
  authorize('servers:write'),
  serverController.createServer
);

/**
 * GET /api/v1/servers/:id
 * Get specific server with real-time bridge data
 * Permission: servers:read
 */
router.get(
  '/:id',
  rateLimiter.api(),
  authorize('servers:read'),
  serverController.getServerById
);

/**
 * PUT /api/v1/servers/:id
 * Update managed server metadata
 * Permission: servers:write
 */
router.put(
  '/:id',
  rateLimiter.api(),
  authorize('servers:write'),
  serverController.updateServer
);

/**
 * DELETE /api/v1/servers/:id
 * Delete managed server (metadata only, does not affect bridge)
 * Permission: servers:delete
 * Role: operator or higher
 */
router.delete(
  '/:id',
  rateLimiter.strict(),
  authorize('servers:delete'),
  requireRole('operator'),
  serverController.deleteServer
);

/**
 * GET /api/v1/servers/:id/status
 * Get real-time server status from MCP Bridge
 * Permission: servers:read
 */
router.get(
  '/:id/status',
  rateLimiter.api(),
  authorize('servers:read'),
  serverController.getServerStatus
);

/**
 * POST /api/v1/servers/:id/health-check
 * Trigger manual health check against MCP Bridge
 * Permission: servers:write
 */
router.post(
  '/:id/health-check',
  rateLimiter.api(),
  authorize('servers:write'),
  serverController.triggerHealthCheck
);

export default router;