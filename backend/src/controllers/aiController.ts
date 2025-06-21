import { Request, Response } from 'express';
import AIService from '@/services/aiService';
import { getMCPBridgeClient } from '@/services/mcpBridgeClient';
import Logger from '@/utils/logger';
import { rateLimiter } from '@/middleware/security';
import { MCPServer } from '@/types';

/**
 * AI Controller for MCP Management API
 * 
 * Provides AI-powered operations including server analysis, predictions,
 * chat responses, pattern analysis, and incident response generation
 */
export class AIController {
  private aiService: AIService;
  private mcpBridge: any;

  constructor() {
    this.aiService = new AIService();
    this.mcpBridge = getMCPBridgeClient();
  }

  /**
   * Analyze server health with AI recommendations
   * POST /api/ai/analyze/server
   */
  analyzeServer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { serverId, includeMetrics = false } = req.body;

      if (!serverId) {
        res.status(400).json({
          success: false,
          error: 'Server ID is required'
        });
        return;
      }

      // Get server data from bridge
      const servers = await this.mcpBridge.getConnectedServers();
      const server = servers.find((s: MCPServer) => s.id === serverId);

      if (!server) {
        res.status(404).json({
          success: false,
          error: 'Server not found'
        });
        return;
      }

      // Get metrics if requested
      let metrics = undefined;
      if (includeMetrics) {
        try {
          const metricsData = await this.mcpBridge.getServerMetrics(serverId);
          metrics = metricsData.slice(-10); // Last 10 metrics
        } catch (error) {
          Logger.warn('Failed to fetch metrics for AI analysis', {
            server_id: serverId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Perform AI analysis
      const analysis = await this.aiService.analyzeServerHealth(server, metrics);

      Logger.api('AI server analysis completed', req.user?.id, {
        server_id: serverId,
        severity: analysis.severity,
        confidence: analysis.confidence,
        has_metrics: !!metrics
      });

      res.json({
        success: true,
        data: {
          serverId,
          serverName: server.name,
          analysis,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      Logger.error('AI server analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to analyze server health'
      });
    }
  };

  /**
   * Generate predictive analysis for potential issues
   * POST /api/ai/predict
   */
  predictIssues = async (req: Request, res: Response): Promise<void> => {
    try {
      const { timeRange = '24h' } = req.body;

      // Get all servers and their metrics
      const servers = await this.mcpBridge.getConnectedServers();
      
      // Get metrics for prediction analysis
      const allMetrics = [];
      for (const server of servers) {
        try {
          const serverMetrics = await this.mcpBridge.getServerMetrics(server.id);
          allMetrics.push(...serverMetrics);
        } catch (error) {
          Logger.warn('Failed to fetch metrics for prediction', {
            server_id: server.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Perform predictive analysis
      const predictions = await this.aiService.predictIssues(servers, allMetrics);

      Logger.api('AI prediction analysis completed', req.user?.id, {
        servers_analyzed: servers.length,
        metrics_analyzed: allMetrics.length,
        predictions_count: predictions.predictions.length,
        overall_risk: predictions.overallRisk
      });

      res.json({
        success: true,
        data: {
          predictions,
          serversAnalyzed: servers.length,
          metricsAnalyzed: allMetrics.length,
          timeRange,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      Logger.error('AI prediction analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate predictions'
      });
    }
  };

  /**
   * Generate AI chat response
   * POST /api/ai/chat
   */
  generateChatResponse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { 
        message, 
        selectedServerId, 
        conversationHistory = [] 
      } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Message is required'
        });
        return;
      }

      // Build context
      const context: any = {};

      // Add selected server context
      if (selectedServerId) {
        try {
          const servers = await this.mcpBridge.getConnectedServers();
          context.selectedServer = servers.find((s: MCPServer) => s.id === selectedServerId);
        } catch (error) {
          Logger.warn('Failed to get selected server for chat context', {
            server_id: selectedServerId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Add system health context
      try {
        const systemHealth = await this.mcpBridge.getSystemHealth();
        context.systemHealth = systemHealth;
      } catch (error) {
        Logger.warn('Failed to get system health for chat context', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Add recent metrics context
      if (selectedServerId) {
        try {
          const recentMetrics = await this.mcpBridge.getServerMetrics(selectedServerId);
          context.recentMetrics = recentMetrics.slice(-3); // Last 3 metrics
        } catch (error) {
          Logger.warn('Failed to get recent metrics for chat context', {
            server_id: selectedServerId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Add conversation history
      if (conversationHistory.length > 0) {
        context.conversationHistory = conversationHistory.slice(-10); // Last 10 messages
      }

      // Generate AI response
      const chatResponse = await this.aiService.generateChatResponse(message, context);

      Logger.api('AI chat response generated', req.user?.id, {
        message_length: message.length,
        has_selected_server: !!selectedServerId,
        has_history: conversationHistory.length > 0,
        response_length: chatResponse.response.length,
        has_actions: (chatResponse.actions?.length || 0) > 0
      });

      res.json({
        success: true,
        data: {
          ...chatResponse,
          timestamp: new Date().toISOString(),
          context: {
            hasSelectedServer: !!context.selectedServer,
            hasSystemHealth: !!context.systemHealth,
            hasRecentMetrics: !!context.recentMetrics
          }
        }
      });

    } catch (error) {
      Logger.error('AI chat response failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate chat response'
      });
    }
  };

  /**
   * Analyze system patterns and anomalies
   * POST /api/ai/analyze/patterns
   */
  analyzePatterns = async (req: Request, res: Response): Promise<void> => {
    try {
      const { 
        timeRange = { hours: 24 },
        serverIds = [] 
      } = req.body;

      // Calculate time range
      const endTime = new Date();
      const startTime = new Date();
      
      if (timeRange.hours) {
        startTime.setHours(startTime.getHours() - timeRange.hours);
      } else if (timeRange.days) {
        startTime.setDate(startTime.getDate() - timeRange.days);
      } else {
        startTime.setHours(startTime.getHours() - 24); // Default 24 hours
      }

      // Get servers to analyze
      const allServers = await this.mcpBridge.getConnectedServers();
      const serversToAnalyze = serverIds.length > 0 
        ? allServers.filter((s: MCPServer) => serverIds.includes(s.id))
        : allServers;

      // Get metrics for analysis
      const allMetrics = [];
      for (const server of serversToAnalyze) {
        try {
          const serverMetrics = await this.mcpBridge.getServerMetrics(server.id);
          // Filter metrics by time range if timestamps are available
          const filteredMetrics = serverMetrics.filter((metric: any) => {
            if (!metric.timestamp) return true; // Include if no timestamp
            const metricTime = new Date(metric.timestamp);
            return metricTime >= startTime && metricTime <= endTime;
          });
          allMetrics.push(...filteredMetrics);
        } catch (error) {
          Logger.warn('Failed to fetch metrics for pattern analysis', {
            server_id: server.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Perform pattern analysis
      const patternAnalysis = await this.aiService.analyzeSystemPatterns(
        serversToAnalyze,
        allMetrics,
        { start: startTime, end: endTime }
      );

      Logger.api('AI pattern analysis completed', req.user?.id, {
        servers_analyzed: serversToAnalyze.length,
        metrics_analyzed: allMetrics.length,
        patterns_found: patternAnalysis.patterns.length,
        anomalies_found: patternAnalysis.anomalies.length,
        time_range_hours: Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60))
      });

      res.json({
        success: true,
        data: {
          ...patternAnalysis,
          analysisMetadata: {
            serversAnalyzed: serversToAnalyze.length,
            metricsAnalyzed: allMetrics.length,
            timeRange: {
              start: startTime.toISOString(),
              end: endTime.toISOString()
            }
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      Logger.error('AI pattern analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to analyze patterns'
      });
    }
  };

  /**
   * Generate incident response plan
   * POST /api/ai/incident/response
   */
  generateIncidentResponse = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        type,
        severity,
        affectedServers = [],
        description,
        includeMetrics = false
      } = req.body;

      if (!type || !severity || !description) {
        res.status(400).json({
          success: false,
          error: 'Incident type, severity, and description are required'
        });
        return;
      }

      // Build incident data
      const incident = {
        type,
        severity,
        affected_servers: affectedServers,
        description
      };

      // Add metrics if requested
      if (includeMetrics && affectedServers.length > 0) {
        const metricsData: any = {};
        for (const serverId of affectedServers) {
          try {
            const serverMetrics = await this.mcpBridge.getServerMetrics(serverId);
            metricsData[serverId] = serverMetrics.slice(-5); // Last 5 metrics
          } catch (error) {
            Logger.warn('Failed to fetch metrics for incident response', {
              server_id: serverId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
        incident.metrics = metricsData;
      }

      // Generate incident response
      const incidentResponse = await this.aiService.generateIncidentResponse(incident);

      Logger.audit('AI incident response generated', {
        incident_type: type,
        severity,
        affected_servers_count: affectedServers.length,
        user_id: req.user?.id,
        has_metrics: includeMetrics
      });

      res.json({
        success: true,
        data: {
          incident: {
            type,
            severity,
            affectedServers,
            description
          },
          response: incidentResponse,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      Logger.error('AI incident response generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate incident response'
      });
    }
  };

  /**
   * Get AI service status and capabilities
   * GET /api/ai/status
   */
  getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      // Test OpenAI connectivity
      let openaiStatus = 'unknown';
      try {
        // Simple test to check if OpenAI is accessible
        await this.aiService.generateChatResponse('test', {});
        openaiStatus = 'connected';
      } catch (error) {
        openaiStatus = 'error';
        Logger.warn('OpenAI connectivity test failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Test MCP Bridge connectivity
      let bridgeStatus = 'unknown';
      try {
        await this.mcpBridge.getSystemHealth();
        bridgeStatus = 'connected';
      } catch (error) {
        bridgeStatus = 'error';
        Logger.warn('MCP Bridge connectivity test failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      res.json({
        success: true,
        data: {
          status: 'operational',
          capabilities: {
            serverAnalysis: true,
            predictiveAnalytics: true,
            chatAssistant: true,
            patternAnalysis: true,
            incidentResponse: true
          },
          integrations: {
            openai: {
              status: openaiStatus,
              model: 'gpt-4'
            },
            mcpBridge: {
              status: bridgeStatus
            }
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      Logger.error('AI status check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get AI service status'
      });
    }
  };
}

export default AIController;