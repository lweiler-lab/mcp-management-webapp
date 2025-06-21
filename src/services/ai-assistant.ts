// AI Assistant Service for Natural Language MCP Commands

import OpenAI from 'openai';
import type { AIMessage } from '../types';
import { config } from '../lib/config';
import { mcpClient } from './mcp-client';

export class AIAssistant {
  private openai: OpenAI;
  private conversationHistory: AIMessage[] = [];

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      dangerouslyAllowBrowser: true, // Note: In production, use server-side proxy
    });
  }

  // Parse natural language command and execute MCP operations
  async processCommand(userInput: string): Promise<AIMessage> {
    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    };

    this.conversationHistory.push(userMessage);

    try {
      // Analyze command with OpenAI
      const analysis = await this.analyzeCommand(userInput);
      
      let result: any = null;
      let error: string | undefined = undefined;

      // Execute the command if one was identified
      if (analysis.command && analysis.arguments) {
        try {
          result = await mcpClient.executeCommand(analysis.command, analysis.arguments);
        } catch (err) {
          error = err instanceof Error ? err.message : 'Command execution failed';
        }
      }

      // Generate AI response
      const responseContent = await this.generateResponse(userInput, analysis, result, error);

      const assistantMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(),
        command: analysis.command,
        result,
        error,
      };

      this.conversationHistory.push(assistantMessage);

      // Keep conversation history manageable
      if (this.conversationHistory.length > config.ui.maxChatHistory) {
        this.conversationHistory = this.conversationHistory.slice(-config.ui.maxChatHistory);
      }

      return assistantMessage;
    } catch (error) {
      const errorMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ I encountered an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.conversationHistory.push(errorMessage);
      return errorMessage;
    }
  }

  // Analyze user input to determine MCP command and arguments
  private async analyzeCommand(input: string): Promise<{
    command?: string;
    arguments?: Record<string, any>;
    intent: string;
    confidence: number;
  }> {
    const systemPrompt = `You are an AI assistant that helps manage MCP (Model Context Protocol) servers and bridges. 

Available MCP commands:
- memory_store: Store data (args: key, value, context?)
- memory_retrieve: Get stored data (args: key)
- memory_search: Search memories (args: query, context?)
- semantic_search_advanced: AI-powered search (args: query, max_results?, context_filter?)
- tasklog_create: Create task log (args: task_id, customer, project, module, objective, task, status, billing_description)
- tasklog_update: Update task (args: task_id, status?, notes?)
- get_leverage_ratio: Get productivity metrics (no args)
- Server management: restart, status, configure

Analyze the user input and determine:
1. What MCP command they want to execute (if any)
2. What arguments to pass
3. The user's intent
4. Your confidence level (0-1)

Respond with JSON only:
{
  "command": "command_name" | null,
  "arguments": {...} | null,
  "intent": "description of what user wants",
  "confidence": 0.0-1.0
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input }
        ],
        max_tokens: 300,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content);
    } catch (error) {
      console.error('❌ Command analysis failed:', error);
      return {
        intent: 'Unable to analyze command',
        confidence: 0,
      };
    }
  }

  // Generate natural language response
  private async generateResponse(
    userInput: string,
    analysis: any,
    result: any,
    error?: string
  ): Promise<string> {
    let contextInfo = '';
    
    if (analysis.command && result) {
      contextInfo = `Successfully executed command: ${analysis.command}\nResult: ${JSON.stringify(result, null, 2)}`;
    } else if (error) {
      contextInfo = `Command failed with error: ${error}`;
    }

    const systemPrompt = `You are a helpful AI assistant for MCP server management. 
    
Respond naturally and conversationally. If a command was executed, explain what happened in user-friendly terms.
Be concise but informative. Use relevant emojis sparingly.

Context: ${contextInfo || 'No command was executed - this is a general conversation.'}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.conversationHistory.slice(-6).map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          { role: 'user', content: userInput }
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });

      return response.choices[0]?.message?.content || 'I apologize, but I couldn\'t generate a response.';
    } catch (error) {
      console.error('❌ Response generation failed:', error);
      return `I processed your request, but encountered an issue generating a response. ${contextInfo}`;
    }
  }

  // Get conversation history
  getHistory(): AIMessage[] {
    return [...this.conversationHistory];
  }

  // Clear conversation history
  clearHistory(): void {
    this.conversationHistory = [];
  }

  // Get suggested commands based on current context
  getSuggestedCommands(): string[] {
    return [
      "Show me the status of all MCP servers",
      "Search for recent project documentation", 
      "Get current system performance metrics",
      "Restart the GitHub MCP server",
      "Show me memory usage statistics",
      "Create a task log for today's work",
      "What's our current leverage ratio?",
    ];
  }
}

// Export singleton instance
export const aiAssistant = new AIAssistant();