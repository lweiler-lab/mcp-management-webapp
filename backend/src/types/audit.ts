/**
 * Audit Trail Types
 * 
 * Comprehensive audit logging for security, compliance, and monitoring
 */

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  category: AuditCategory;
  severity: AuditSeverity;
  userId?: string;
  sessionId?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
  description: string;
  metadata: Record<string, any>;
  clientIP: string;
  userAgent: string;
  outcome: AuditOutcome;
  timestamp: Date;
  source: string; // API endpoint, service, etc.
}

export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  MFA_CHALLENGE = 'mfa_challenge',
  MFA_SUCCESS = 'mfa_success',
  MFA_FAILURE = 'mfa_failure',
  PASSWORD_CHANGE = 'password_change',
  
  // Authorization events
  ACCESS_GRANTED = 'access_granted',
  ACCESS_DENIED = 'access_denied',
  PERMISSION_CHECK = 'permission_check',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REMOVED = 'role_removed',
  PERMISSION_MODIFIED = 'permission_modified',
  
  // Resource operations
  RESOURCE_CREATE = 'resource_create',
  RESOURCE_READ = 'resource_read',
  RESOURCE_UPDATE = 'resource_update',
  RESOURCE_DELETE = 'resource_delete',
  RESOURCE_EXPORT = 'resource_export',
  
  // System events
  SYSTEM_START = 'system_start',
  SYSTEM_SHUTDOWN = 'system_shutdown',
  SYSTEM_ERROR = 'system_error',
  SYSTEM_MAINTENANCE = 'system_maintenance',
  CONFIG_CHANGE = 'config_change',
  
  // Security events
  SECURITY_VIOLATION = 'security_violation',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  INTRUSION_ATTEMPT = 'intrusion_attempt',
  
  // AI events
  AI_ANALYSIS_REQUEST = 'ai_analysis_request',
  AI_PREDICTION_REQUEST = 'ai_prediction_request',
  AI_CHAT_REQUEST = 'ai_chat_request',
  AI_INCIDENT_RESPONSE = 'ai_incident_response',
  
  // Data events
  DATA_ACCESS = 'data_access',
  DATA_MODIFICATION = 'data_modification',
  DATA_EXPORT = 'data_export',
  DATA_IMPORT = 'data_import',
  DATA_DELETION = 'data_deletion'
}

export enum AuditCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  SYSTEM_ADMIN = 'system_admin',
  SECURITY = 'security',
  USER_MANAGEMENT = 'user_management',
  SERVER_MANAGEMENT = 'server_management',
  AI_OPERATIONS = 'ai_operations',
  CONFIGURATION = 'configuration',
  MAINTENANCE = 'maintenance'
}

export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum AuditOutcome {
  SUCCESS = 'success',
  FAILURE = 'failure',
  PARTIAL = 'partial',
  UNKNOWN = 'unknown'
}

// Audit search and filtering
export interface AuditSearchParams {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  eventTypes?: AuditEventType[];
  categories?: AuditCategory[];
  severities?: AuditSeverity[];
  outcomes?: AuditOutcome[];
  resourceType?: string;
  resourceId?: string;
  clientIP?: string;
  searchText?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'severity' | 'category';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditSearchResult {
  events: AuditEvent[];
  totalCount: number;
  hasMore: boolean;
  aggregations: {
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    byOutcome: Record<string, number>;
    byEventType: Record<string, number>;
  };
}

// Audit configuration
export interface AuditConfig {
  enabled: boolean;
  retention: {
    days: number;
    maxEvents: number;
  };
  realTimeAlerting: {
    enabled: boolean;
    criticalEventNotification: boolean;
    suspiciousActivityThreshold: number;
  };
  exportSettings: {
    formats: string[];
    encryptionRequired: boolean;
    signatureRequired: boolean;
  };
  compliance: {
    gdprCompliant: boolean;
    hipaaCompliant: boolean;
    sox404Compliant: boolean;
  };
}

// Audit statistics and reporting
export interface AuditStatistics {
  period: {
    start: Date;
    end: Date;
  };
  totalEvents: number;
  eventsByCategory: Record<AuditCategory, number>;
  eventsBySeverity: Record<AuditSeverity, number>;
  uniqueUsers: number;
  uniqueIPs: number;
  securityEvents: number;
  failedLogins: number;
  accessDenials: number;
  trends: {
    dailyActivity: Array<{
      date: string;
      count: number;
      severity: Record<AuditSeverity, number>;
    }>;
    topUsers: Array<{
      userId: string;
      username: string;
      eventCount: number;
    }>;
    topIPs: Array<{
      ip: string;
      eventCount: number;
      riskScore: number;
    }>;
  };
}

// Risk assessment
export interface RiskAssessment {
  userId: string;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: Array<{
    factor: string;
    weight: number;
    description: string;
  }>;
  recommendations: string[];
  lastUpdated: Date;
}

// Compliance report
export interface ComplianceReport {
  reportId: string;
  period: {
    start: Date;
    end: Date;
  };
  compliance: {
    gdpr: {
      dataAccessRequests: number;
      dataExportRequests: number;
      dataDeleteRequests: number;
      consentTracking: boolean;
    };
    security: {
      failedLoginAttempts: number;
      unauthorizedAccess: number;
      dataBreachIndicators: number;
      securityIncidents: number;
    };
    access: {
      privilegedAccess: number;
      roleChanges: number;
      permissionModifications: number;
      adminActivities: number;
    };
  };
  generatedAt: Date;
  generatedBy: string;
}

export default {
  AuditEvent,
  AuditEventType,
  AuditCategory,
  AuditSeverity,
  AuditOutcome,
  AuditSearchParams,
  AuditSearchResult,
  AuditConfig,
  AuditStatistics,
  RiskAssessment,
  ComplianceReport
};