// Core Types for MCP Management API
export interface MCPServer {
  id: string;
  name: string;
  url: string;
  status: MCPServerStatus;
  config: MCPServerConfig;
  healthScore: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type MCPServerStatus = 'healthy' | 'warning' | 'critical' | 'inactive' | 'unknown';

export interface MCPServerConfig {
  name: string;
  url: string;
  authToken?: string;
  timeout: number;
  retryAttempts: number;
  enableMetrics: boolean;
  enableLogging: boolean;
  customHeaders?: Record<string, string>;
  environment: 'development' | 'staging' | 'production';
}

// Metrics and Performance Types
export interface ServerMetrics {
  id: string;
  serverId: string;
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  requestCount: number;
  responseTimeMs: number;
  errorCount: number;
  healthScore: number;
  throughput: number;
  activeConnections: number;
}

export interface AggregatedMetrics {
  serverId: string;
  timeRange: TimeRange;
  averageResponseTime: number;
  totalRequests: number;
  errorRate: number;
  uptime: number;
  performanceTrend: 'improving' | 'stable' | 'degrading';
}

export interface TimeRange {
  start: Date;
  end: Date;
  interval: '1m' | '5m' | '15m' | '1h' | '1d' | '7d' | '30d';
}

// User Management Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  cloudflareUserId?: string;
  createdAt: Date;
  lastLogin?: Date;
  isActive: boolean;
}

export type UserRole = 'admin' | 'operator' | 'viewer' | 'service';

export interface UserSession {
  userId: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

// Security and Audit Types
export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  riskScore: number;
}

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  userId?: string;
  ipAddress?: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export type SecurityEventType = 
  | 'authentication_failure'
  | 'unauthorized_access'
  | 'suspicious_activity'
  | 'data_breach_attempt'
  | 'rate_limit_exceeded'
  | 'anomalous_behavior';

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// WebSocket Types
export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload: any;
  timestamp: Date;
  clientId?: string;
}

export type WebSocketMessageType =
  | 'server_status_update'
  | 'metrics_update'
  | 'server_created'
  | 'server_updated'
  | 'server_deleted'
  | 'alert_triggered'
  | 'connection_established'
  | 'heartbeat';

export interface WebSocketClient {
  id: string;
  userId: string;
  socket: any; // WebSocket instance
  subscriptions: string[]; // Server IDs they're subscribed to
  connectedAt: Date;
  lastHeartbeat: Date;
}

// AI Assistant Types
export interface AIRequest {
  query: string;
  context?: Record<string, any>;
  userId: string;
  sessionId: string;
}

export interface AIResponse {
  response: string;
  actions?: AIAction[];
  confidence: number;
  processingTime: number;
}

export interface AIAction {
  type: 'server_action' | 'query_data' | 'generate_report' | 'schedule_task';
  parameters: Record<string, any>;
  description: string;
}

// Health Check Types
export interface HealthCheck {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  responseTime: number;
  details?: Record<string, any>;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  services: HealthCheck[];
  timestamp: Date;
  uptime: number;
}

// Configuration Types
export interface AppConfig {
  port: number;
  environment: 'development' | 'staging' | 'production';
  database: DatabaseConfig;
  redis: RedisConfig;
  cloudflare: CloudflareConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
  mcpBridge: MCPBridgeConfig;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  database: number;
  ttl: number;
}

export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  zoneId: string;
  accessAppAUD: string;
}

export interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptSaltRounds: number;
  rateLimiting: RateLimitConfig;
  cors: CorsConfig;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface CorsConfig {
  origin: string[];
  credentials: boolean;
  maxAge: number;
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'simple';
  destination: 'console' | 'file' | 'both';
  maxFileSize: string;
  maxFiles: number;
}

export interface MCPBridgeConfig {
  baseUrl: string;
  authToken: string;
  timeout: number;
  retryAttempts: number;
  healthCheckInterval: number;
}

// Error Types
export class APIError extends Error {
  public statusCode: number;
  public code: string;
  public details?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends APIError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends APIError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends APIError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends APIError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends APIError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}