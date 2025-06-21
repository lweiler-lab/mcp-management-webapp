import { Router } from 'express';
import AIController from '@/controllers/aiController';
import { authenticate, authorize, rateLimiter } from '@/middleware/security';
import { body, query } from 'express-validator';
import { validateRequest } from '@/middleware/validation';

const router = Router();
const aiController = new AIController();

/**
 * AI Routes for MCP Management API
 * 
 * All AI endpoints require authentication and have rate limiting
 * Applied rate limits: 30 requests per minute for AI operations
 */

// Apply authentication to all AI routes
router.use(authenticate);

// Apply AI-specific rate limiting (more restrictive due to AI costs)
const aiRateLimit = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: {
    success: false,
    error: 'Too many AI requests. Please try again later.'
  }
});

router.use(aiRateLimit);

/**
 * GET /api/ai/status
 * Get AI service status and capabilities
 */
router.get('/status', aiController.getStatus);

/**
 * POST /api/ai/analyze/server
 * Analyze specific server health with AI recommendations
 * 
 * Body:
 * - serverId: string (required) - ID of server to analyze
 * - includeMetrics: boolean (optional) - Whether to include recent metrics
 */
router.post(
  '/analyze/server',
  [
    body('serverId')
      .notEmpty()
      .withMessage('Server ID is required'),
    body('includeMetrics')
      .optional()
      .isBoolean()
      .withMessage('includeMetrics must be a boolean')
  ],
  validateRequest,
  aiController.analyzeServer
);

/**
 * POST /api/ai/predict
 * Generate predictive analysis for potential issues
 * 
 * Body:
 * - timeRange: string (optional) - Time range for analysis (default: '24h')
 */
router.post(
  '/predict',
  [
    body('timeRange')
      .optional()
      .isString()
      .withMessage('Time range must be a string')
  ],
  validateRequest,
  aiController.predictIssues
);

/**
 * POST /api/ai/chat
 * Generate AI chat response with context awareness
 * 
 * Body:
 * - message: string (required) - User message
 * - selectedServerId: string (optional) - Currently selected server ID
 * - conversationHistory: array (optional) - Previous conversation messages
 */
router.post(
  '/chat',
  [
    body('message')
      .notEmpty()
      .isString()
      .withMessage('Message is required and must be a string'),
    body('selectedServerId')
      .optional()
      .isString()
      .withMessage('Selected server ID must be a string'),
    body('conversationHistory')
      .optional()
      .isArray()
      .withMessage('Conversation history must be an array'),
    body('conversationHistory.*.role')
      .optional()
      .isIn(['user', 'assistant', 'system'])
      .withMessage('Invalid conversation role'),
    body('conversationHistory.*.content')
      .optional()
      .isString()
      .withMessage('Conversation content must be a string')
  ],
  validateRequest,
  aiController.generateChatResponse
);

/**
 * POST /api/ai/analyze/patterns
 * Analyze system patterns and detect anomalies
 * 
 * Body:
 * - timeRange: object (optional) - Time range specification
 *   - hours: number (optional) - Hours to look back
 *   - days: number (optional) - Days to look back
 * - serverIds: array (optional) - Specific server IDs to analyze
 */
router.post(
  '/analyze/patterns',
  [
    body('timeRange')
      .optional()
      .isObject()
      .withMessage('Time range must be an object'),
    body('timeRange.hours')
      .optional()
      .isInt({ min: 1, max: 720 })
      .withMessage('Hours must be between 1 and 720'),
    body('timeRange.days')
      .optional()
      .isInt({ min: 1, max: 30 })
      .withMessage('Days must be between 1 and 30'),
    body('serverIds')
      .optional()
      .isArray()
      .withMessage('Server IDs must be an array'),
    body('serverIds.*')
      .optional()
      .isString()
      .withMessage('Each server ID must be a string')
  ],
  validateRequest,
  aiController.analyzePatterns
);

/**
 * POST /api/ai/incident/response
 * Generate structured incident response plan
 * 
 * Body:
 * - type: string (required) - Type of incident
 * - severity: string (required) - Incident severity level
 * - affectedServers: array (optional) - List of affected server IDs
 * - description: string (required) - Incident description
 * - includeMetrics: boolean (optional) - Whether to include server metrics
 */
router.post(
  '/incident/response',
  [
    body('type')
      .notEmpty()
      .isString()
      .withMessage('Incident type is required'),
    body('severity')
      .notEmpty()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Severity must be one of: low, medium, high, critical'),
    body('affectedServers')
      .optional()
      .isArray()
      .withMessage('Affected servers must be an array'),
    body('affectedServers.*')
      .optional()
      .isString()
      .withMessage('Each affected server ID must be a string'),
    body('description')
      .notEmpty()
      .isString()
      .withMessage('Incident description is required'),
    body('includeMetrics')
      .optional()
      .isBoolean()
      .withMessage('includeMetrics must be a boolean')
  ],
  validateRequest,
  aiController.generateIncidentResponse
);

export default router;