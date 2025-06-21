import OpenAI from 'openai';
import { MCPServer, ServerMetrics, SystemHealth } from '@/types';
import config from '@/config';
import Logger from '@/utils/logger';
import { getMCPBridgeClient } from './mcpBridgeClient';

/**
 * AI Service for Intelligent MCP Management
 * 
 * Provides AI-powered analysis, recommendations, and automated operations
 * for MCP server management using OpenAI GPT-4
 */
export class AIService {
  private openai: OpenAI;
  private mcpBridge: any;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.mcpBridge = getMCPBridgeClient();
  }

  /**
   * Analyze server health and provide recommendations
   */
  async analyzeServerHealth(server: MCPServer, metrics?: ServerMetrics[]): Promise<{
    analysis: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
    confidence: number;
    actions?: Array<{
      type: string;
      description: string;
      priority: number;
    }>;
  }> {
    try {
      // Gather comprehensive server data
      const serverData = await this.gatherServerData(server);
      
      const prompt = this.buildServerAnalysisPrompt(server, serverData, metrics);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt('server_analysis')
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });

      const analysis = this.parseAnalysisResponse(response.choices[0].message.content || '');
      
      Logger.api('AI server analysis completed', undefined, {
        server_id: server.id,
        severity: analysis.severity,
        confidence: analysis.confidence
      });

      return analysis;

    } catch (error) {
      Logger.error('AI server analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        server_id: server.id
      });
      
      return {
        analysis: 'Unable to perform AI analysis at this time. Please check server status manually.',
        severity: 'medium',
        recommendations: ['Manual health check recommended'],
        confidence: 0,
        actions: []
      };
    }
  }

  /**
   * Predict potential issues based on historical data and patterns
   */
  async predictIssues(servers: MCPServer[], metrics: ServerMetrics[]): Promise<{
    predictions: Array<{
      serverId: string;
      issue: string;
      probability: number;
      timeframe: string;
      mitigation: string[];
    }>;
    overallRisk: 'low' | 'medium' | 'high';
    recommendations: string[];
  }> {
    try {
      const prompt = this.buildPredictionPrompt(servers, metrics);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt('prediction')
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 1500
      });

      const predictions = this.parsePredictionResponse(response.choices[0].message.content || '');
      
      Logger.api('AI prediction analysis completed', undefined, {
        server_count: servers.length,
        predictions_count: predictions.predictions.length,
        overall_risk: predictions.overallRisk
      });

      return predictions;

    } catch (error) {
      Logger.error('AI prediction failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        predictions: [],
        overallRisk: 'low',
        recommendations: ['AI prediction service temporarily unavailable']
      };
    }
  }

  /**
   * Generate intelligent responses for chat interactions
   */
  async generateChatResponse(
    message: string,
    context: {
      selectedServer?: MCPServer;
      recentMetrics?: any;
      systemHealth?: SystemHealth;
      conversationHistory?: Array<{ role: string; content: string }>;
    }
  ): Promise<{
    response: string;
    actions?: Array<{
      type: string;
      label: string;
      data: any;
    }>;
    confidence: number;
  }> {
    try {
      const messages = [
        {
          role: 'system',
          content: this.getSystemPrompt('chat_assistant')
        },
        {
          role: 'user',
          content: this.buildChatPrompt(message, context)
        }
      ];

      // Add conversation history if available
      if (context.conversationHistory) {
        messages.splice(1, 0, ...context.conversationHistory);
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: messages as any,
        temperature: 0.3,
        max_tokens: 800
      });

      const chatResponse = this.parseChatResponse(response.choices[0].message.content || '');
      
      Logger.api('AI chat response generated', undefined, {
        message_length: message.length,
        response_length: chatResponse.response.length,
        has_actions: (chatResponse.actions?.length || 0) > 0
      });

      return chatResponse;

    } catch (error) {
      Logger.error('AI chat response failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        response: "I'm experiencing some technical difficulties right now. Please try your question again in a moment, or check the server status manually.",
        confidence: 0
      };
    }
  }

  /**
   * Analyze system-wide patterns and anomalies
   */
  async analyzeSystemPatterns(
    servers: MCPServer[],
    metrics: ServerMetrics[],
    timeRange: { start: Date; end: Date }
  ): Promise<{
    patterns: Array<{
      type: string;
      description: string;
      affected_servers: string[];
      severity: string;
    }>;
    anomalies: Array<{
      type: string;
      description: string;
      server_id: string;
      confidence: number;
    }>;
    insights: string[];
    recommendations: string[];
  }> {
    try {
      const prompt = this.buildPatternAnalysisPrompt(servers, metrics, timeRange);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt('pattern_analysis')
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1200
      });

      const analysis = this.parsePatternResponse(response.choices[0].message.content || '');
      
      Logger.api('AI pattern analysis completed', undefined, {
        patterns_found: analysis.patterns.length,
        anomalies_found: analysis.anomalies.length,
        time_range: `${timeRange.start.toISOString()}_${timeRange.end.toISOString()}`
      });

      return analysis;

    } catch (error) {
      Logger.error('AI pattern analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        patterns: [],
        anomalies: [],
        insights: ['Pattern analysis temporarily unavailable'],
        recommendations: []
      };
    }
  }

  /**
   * Generate automated incident response recommendations
   */
  async generateIncidentResponse(incident: {
    type: string;
    severity: string;
    affected_servers: string[];
    description: string;
    metrics?: any;
  }): Promise<{
    immediate_actions: string[];
    investigation_steps: string[];
    prevention_measures: string[];
    escalation_criteria: string[];
    estimated_resolution_time: string;
  }> {
    try {
      const prompt = this.buildIncidentPrompt(incident);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt('incident_response')
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });

      const incidentResponse = this.parseIncidentResponse(response.choices[0].message.content || '');
      
      Logger.audit('AI incident response generated', {
        incident_type: incident.type,
        severity: incident.severity,
        affected_servers: incident.affected_servers.length
      });

      return incidentResponse;

    } catch (error) {
      Logger.error('AI incident response failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        immediate_actions: ['Contact system administrator'],
        investigation_steps: ['Manual investigation required'],
        prevention_measures: ['Review system logs'],
        escalation_criteria: ['If issue persists > 30 minutes'],
        estimated_resolution_time: 'Unknown'
      };
    }
  }

  /**
   * Gather comprehensive server data for analysis
   */
  private async gatherServerData(server: MCPServer): Promise<any> {
    try {
      // Get real-time data from MCP Bridge
      const bridgeData = await this.mcpBridge.aggregateBridgeData();
      
      return {
        server_info: server,
        bridge_status: bridgeData,
        current_time: new Date().toISOString(),
        environment: server.environment,
        tags: server.tags
      };
    } catch (error) {
      Logger.warn('Failed to gather bridge data for AI analysis', {
        server_id: server.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        server_info: server,
        bridge_status: null,
        current_time: new Date().toISOString(),
        environment: server.environment,
        tags: server.tags
      };
    }
  }

  /**
   * Get system prompts for different AI tasks
   */
  private getSystemPrompt(type: string): string {
    const prompts = {
      server_analysis: `You are an expert MCP (Model Context Protocol) server administrator and monitoring specialist. Analyze server health data and provide actionable insights.

Your analysis should include:
1. Current health status assessment
2. Potential issues identification
3. Specific recommendations
4. Severity level (low/medium/high/critical)
5. Confidence score (0-1)

Be precise, actionable, and focus on MCP-specific concerns like bridge connectivity, memory operations, and semantic search performance.`,

      prediction: `You are a predictive analytics expert specializing in MCP server infrastructure. Analyze historical patterns and predict potential issues.

Focus on:
1. Performance degradation patterns
2. Resource exhaustion trends
3. Bridge connectivity issues
4. Operational anomalies
5. Capacity planning needs

Provide probability estimates and timeframes for predictions.`,

      chat_assistant: `You are an intelligent MCP management assistant. Help users understand and manage their MCP servers with clear, actionable guidance.

Capabilities:
- Server status interpretation
- Performance analysis
- Troubleshooting guidance
- Best practices recommendations
- Proactive monitoring suggestions

Be conversational but precise. Offer specific actions when appropriate.`,

      pattern_analysis: `You are a system analyst expert in identifying patterns and anomalies in MCP server operations. Analyze data to find meaningful patterns, unusual behaviors, and optimization opportunities.

Look for:
- Performance patterns across servers
- Unusual resource usage
- Correlation between different metrics
- Seasonal or temporal patterns
- Efficiency optimization opportunities`,

      incident_response: `You are an incident response specialist for MCP server infrastructure. Provide structured, prioritized response plans for various types of incidents.

Your response should include:
- Immediate containment actions
- Investigation procedures
- Root cause analysis steps
- Prevention measures
- Clear escalation criteria`
    };

    return prompts[type as keyof typeof prompts] || prompts.chat_assistant;
  }

  /**
   * Build analysis prompts for different contexts
   */
  private buildServerAnalysisPrompt(server: MCPServer, serverData: any, metrics?: ServerMetrics[]): string {
    return `Analyze the following MCP server:

SERVER INFORMATION:
- Name: ${server.name}
- Environment: ${server.environment}
- Status: ${server.status}
- Health Score: ${server.healthScore}
- Last Updated: ${server.updatedAt}
- Tags: ${server.tags?.join(', ') || 'None'}

BRIDGE DATA:
${JSON.stringify(serverData.bridge_status, null, 2)}

${metrics ? `RECENT METRICS:
${JSON.stringify(metrics.slice(-10), null, 2)}` : ''}

Please provide a comprehensive health analysis with severity assessment and specific recommendations.`;
  }

  private buildPredictionPrompt(servers: MCPServer[], metrics: ServerMetrics[]): string {
    return `Analyze the following MCP infrastructure for potential issues:

SERVERS (${servers.length} total):
${servers.map(s => `- ${s.name}: ${s.status} (Health: ${s.healthScore})`).join('\n')}

RECENT METRICS:
${JSON.stringify(metrics.slice(-20), null, 2)}

Predict potential issues, their probability, and timeframes. Focus on MCP-specific concerns.`;
  }

  private buildChatPrompt(message: string, context: any): string {
    let prompt = `User message: "${message}"

CONTEXT:`;

    if (context.selectedServer) {
      prompt += `
Selected Server: ${context.selectedServer.name} (${context.selectedServer.status})`;
    }

    if (context.systemHealth) {
      prompt += `
System Health: ${context.systemHealth.overall}`;
    }

    if (context.recentMetrics) {
      prompt += `
Recent Metrics: ${JSON.stringify(context.recentMetrics, null, 2)}`;
    }

    prompt += `

Provide a helpful response with specific actions if appropriate. If you suggest actions, format them as [ACTION: type|label|data].`;

    return prompt;
  }

  private buildPatternAnalysisPrompt(servers: MCPServer[], metrics: ServerMetrics[], timeRange: any): string {
    return `Analyze patterns in MCP server operations:

TIME RANGE: ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}

SERVERS:
${servers.map(s => `${s.name}: ${s.status} (${s.environment})`).join('\n')}

METRICS DATA:
${JSON.stringify(metrics, null, 2)}

Identify patterns, anomalies, and optimization opportunities.`;
  }

  private buildIncidentPrompt(incident: any): string {
    return `Generate incident response plan for:

TYPE: ${incident.type}
SEVERITY: ${incident.severity}
AFFECTED SERVERS: ${incident.affected_servers.join(', ')}
DESCRIPTION: ${incident.description}

${incident.metrics ? `METRICS: ${JSON.stringify(incident.metrics, null, 2)}` : ''}

Provide structured response plan with immediate actions, investigation steps, and prevention measures.`;
  }

  /**
   * Parse AI responses into structured data
   */
  private parseAnalysisResponse(content: string): any {
    // Simple parsing - in production, would use more sophisticated parsing
    try {
      // Look for JSON in response or parse structured text
      const severityMatch = content.match(/severity[:\s]+(low|medium|high|critical)/i);
      const confidenceMatch = content.match(/confidence[:\s]+([0-9.]+)/i);
      
      return {
        analysis: content,
        severity: severityMatch?.[1]?.toLowerCase() || 'medium',
        recommendations: this.extractRecommendations(content),
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.8,
        actions: this.extractActions(content)
      };
    } catch (error) {
      return {
        analysis: content,
        severity: 'medium',
        recommendations: [],
        confidence: 0.5,
        actions: []
      };
    }
  }

  private parsePredictionResponse(content: string): any {
    return {
      predictions: [],
      overallRisk: 'low',
      recommendations: this.extractRecommendations(content)
    };
  }

  private parseChatResponse(content: string): any {
    const actions = this.extractChatActions(content);
    const cleanContent = content.replace(/\[ACTION:.*?\]/g, '').trim();
    
    return {
      response: cleanContent,
      actions,
      confidence: 0.8
    };
  }

  private parsePatternResponse(content: string): any {
    return {
      patterns: [],
      anomalies: [],
      insights: this.extractInsights(content),
      recommendations: this.extractRecommendations(content)
    };
  }

  private parseIncidentResponse(content: string): any {
    return {
      immediate_actions: this.extractSection(content, 'immediate'),
      investigation_steps: this.extractSection(content, 'investigation'),
      prevention_measures: this.extractSection(content, 'prevention'),
      escalation_criteria: this.extractSection(content, 'escalation'),
      estimated_resolution_time: 'Variable based on complexity'
    };
  }

  /**
   * Helper methods for content extraction
   */
  private extractRecommendations(content: string): string[] {
    const lines = content.split('\n');
    return lines
      .filter(line => line.includes('recommend') || line.match(/^\d+\./))
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  private extractActions(content: string): any[] {
    const actionMatches = content.match(/\[ACTION:([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/g);
    if (!actionMatches) return [];
    
    return actionMatches.map(match => {
      const parts = match.replace(/\[ACTION:|]/g, '').split('|');
      return {
        type: parts[0]?.trim(),
        description: parts[1]?.trim(),
        priority: 1
      };
    });
  }

  private extractChatActions(content: string): any[] {
    const actionMatches = content.match(/\[ACTION:([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/g);
    if (!actionMatches) return [];
    
    return actionMatches.map(match => {
      const parts = match.replace(/\[ACTION:|]/g, '').split('|');
      return {
        type: parts[0]?.trim(),
        label: parts[1]?.trim(),
        data: parts[2] ? JSON.parse(parts[2]) : {}
      };
    });
  }

  private extractInsights(content: string): string[] {
    return this.extractRecommendations(content);
  }

  private extractSection(content: string, sectionType: string): string[] {
    const lines = content.split('\n');
    const sectionStart = lines.findIndex(line => 
      line.toLowerCase().includes(sectionType.toLowerCase())
    );
    
    if (sectionStart === -1) return [];
    
    const section = lines.slice(sectionStart + 1, sectionStart + 6);
    return section
      .filter(line => line.trim().length > 0)
      .map(line => line.replace(/^[-*\d.]+\s*/, '').trim());
  }
}

export default AIService;