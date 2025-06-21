import { db } from '@/database/connection';
import Logger from '@/utils/logger';
import {
  AuditEvent,
  AuditEventType,
  AuditCategory,
  AuditSeverity,
  AuditOutcome,
  AuditSearchParams,
  AuditSearchResult,
  AuditStatistics,
  RiskAssessment
} from '@/types/audit';

/**
 * Audit Service
 * 
 * Comprehensive audit logging service for security, compliance, and monitoring
 * Provides detailed tracking of all system activities with risk assessment
 */
export class AuditService {
  private static instance: AuditService;

  private constructor() {}

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Initialize audit system
   */
  async initialize(): Promise<void> {
    try {
      Logger.info('Initializing audit system...');
      
      await this.createAuditTable();
      await this.createAuditIndexes();
      
      Logger.info('Audit system initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize audit system', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Log an audit event
   */
  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<string> {
    try {
      const query = `
        INSERT INTO audit_events (
          event_type, category, severity, user_id, session_id,
          resource_type, resource_id, action, description, metadata,
          client_ip, user_agent, outcome, source, timestamp
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()
        ) RETURNING id
      `;

      const values = [
        event.eventType,
        event.category,
        event.severity,
        event.userId || null,
        event.sessionId || null,
        event.resourceType || null,
        event.resourceId || null,
        event.action,
        event.description,
        JSON.stringify(event.metadata || {}),
        event.clientIP,
        event.userAgent,
        event.outcome,
        event.source
      ];

      const result = await db.query(query, values);
      const eventId = result.rows[0].id;

      // Log high-severity events immediately
      if (event.severity === AuditSeverity.HIGH || event.severity === AuditSeverity.CRITICAL) {
        Logger.security(`High-severity audit event: ${event.eventType}`, {
          event_id: eventId,
          user_id: event.userId,
          action: event.action,
          outcome: event.outcome,
          client_ip: event.clientIP
        });
      }

      // Trigger real-time alerts for critical security events
      if (this.isCriticalSecurityEvent(event)) {
        await this.triggerSecurityAlert(eventId, event);
      }

      return eventId;

    } catch (error) {
      Logger.error('Failed to log audit event', {
        event_type: event.eventType,
        user_id: event.userId,
        action: event.action,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Search audit events with filtering
   */
  async searchEvents(params: AuditSearchParams): Promise<AuditSearchResult> {
    try {
      let whereClause = 'WHERE 1=1';
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Build WHERE clause
      if (params.startDate) {
        whereClause += ` AND timestamp >= $${paramIndex++}`;
        queryParams.push(params.startDate);
      }

      if (params.endDate) {
        whereClause += ` AND timestamp <= $${paramIndex++}`;
        queryParams.push(params.endDate);
      }

      if (params.userId) {
        whereClause += ` AND user_id = $${paramIndex++}`;
        queryParams.push(params.userId);
      }

      if (params.eventTypes && params.eventTypes.length > 0) {
        whereClause += ` AND event_type = ANY($${paramIndex++})`;
        queryParams.push(params.eventTypes);
      }

      if (params.categories && params.categories.length > 0) {
        whereClause += ` AND category = ANY($${paramIndex++})`;
        queryParams.push(params.categories);
      }

      if (params.severities && params.severities.length > 0) {
        whereClause += ` AND severity = ANY($${paramIndex++})`;
        queryParams.push(params.severities);
      }

      if (params.outcomes && params.outcomes.length > 0) {
        whereClause += ` AND outcome = ANY($${paramIndex++})`;
        queryParams.push(params.outcomes);
      }

      if (params.resourceType) {
        whereClause += ` AND resource_type = $${paramIndex++}`;
        queryParams.push(params.resourceType);
      }

      if (params.resourceId) {
        whereClause += ` AND resource_id = $${paramIndex++}`;
        queryParams.push(params.resourceId);
      }

      if (params.clientIP) {
        whereClause += ` AND client_ip = $${paramIndex++}`;
        queryParams.push(params.clientIP);
      }

      if (params.searchText) {
        whereClause += ` AND (description ILIKE $${paramIndex++} OR action ILIKE $${paramIndex} OR metadata::text ILIKE $${paramIndex})`;
        queryParams.push(`%${params.searchText}%`, `%${params.searchText}%`, `%${params.searchText}%`);
        paramIndex++;
      }

      // Order and pagination
      const sortBy = params.sortBy || 'timestamp';
      const sortOrder = params.sortOrder || 'desc';
      const limit = params.limit || 100;
      const offset = params.offset || 0;

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM audit_events ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get events
      const eventsQuery = `
        SELECT * FROM audit_events 
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      queryParams.push(limit, offset);

      const eventsResult = await db.query(eventsQuery, queryParams);

      // Get aggregations
      const aggregations = await this.getAggregations(whereClause, queryParams.slice(0, -2));

      const events: AuditEvent[] = eventsResult.rows.map(row => ({
        id: row.id,
        eventType: row.event_type,
        category: row.category,
        severity: row.severity,
        userId: row.user_id,
        sessionId: row.session_id,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        action: row.action,
        description: row.description,
        metadata: row.metadata || {},
        clientIP: row.client_ip,
        userAgent: row.user_agent,
        outcome: row.outcome,
        timestamp: row.timestamp,
        source: row.source
      }));

      return {
        events,
        totalCount,
        hasMore: offset + limit < totalCount,
        aggregations
      };

    } catch (error) {
      Logger.error('Failed to search audit events', {
        params,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get audit statistics for a time period
   */
  async getStatistics(startDate: Date, endDate: Date): Promise<AuditStatistics> {
    try {
      const baseQuery = 'FROM audit_events WHERE timestamp >= $1 AND timestamp <= $2';
      const params = [startDate, endDate];

      // Total events
      const totalResult = await db.query(`SELECT COUNT(*) ${baseQuery}`, params);
      const totalEvents = parseInt(totalResult.rows[0].count);

      // Events by category
      const categoryResult = await db.query(`
        SELECT category, COUNT(*) as count 
        ${baseQuery} 
        GROUP BY category
      `, params);
      const eventsByCategory = Object.fromEntries(
        categoryResult.rows.map(row => [row.category, parseInt(row.count)])
      );

      // Events by severity
      const severityResult = await db.query(`
        SELECT severity, COUNT(*) as count 
        ${baseQuery} 
        GROUP BY severity
      `, params);
      const eventsBySeverity = Object.fromEntries(
        severityResult.rows.map(row => [row.severity, parseInt(row.count)])
      );

      // Unique users and IPs
      const uniqueResult = await db.query(`
        SELECT 
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT client_ip) as unique_ips
        ${baseQuery}
      `, params);
      const uniqueUsers = parseInt(uniqueResult.rows[0].unique_users);
      const uniqueIPs = parseInt(uniqueResult.rows[0].unique_ips);

      // Security events
      const securityResult = await db.query(`
        SELECT COUNT(*) 
        ${baseQuery} 
        AND category = 'security'
      `, params);
      const securityEvents = parseInt(securityResult.rows[0].count);

      // Failed logins
      const failedLoginsResult = await db.query(`
        SELECT COUNT(*) 
        ${baseQuery} 
        AND event_type = 'login_failure'
      `, params);
      const failedLogins = parseInt(failedLoginsResult.rows[0].count);

      // Access denials
      const accessDenialsResult = await db.query(`
        SELECT COUNT(*) 
        ${baseQuery} 
        AND event_type = 'access_denied'
      `, params);
      const accessDenials = parseInt(accessDenialsResult.rows[0].count);

      // Daily activity trends
      const dailyActivityResult = await db.query(`
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE severity = 'low') as low,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium,
          COUNT(*) FILTER (WHERE severity = 'high') as high,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical
        ${baseQuery}
        GROUP BY DATE(timestamp)
        ORDER BY date
      `, params);

      const dailyActivity = dailyActivityResult.rows.map(row => ({
        date: row.date,
        count: parseInt(row.count),
        severity: {
          [AuditSeverity.LOW]: parseInt(row.low),
          [AuditSeverity.MEDIUM]: parseInt(row.medium),
          [AuditSeverity.HIGH]: parseInt(row.high),
          [AuditSeverity.CRITICAL]: parseInt(row.critical)
        }
      }));

      // Top users
      const topUsersResult = await db.query(`
        SELECT 
          user_id,
          u.username,
          COUNT(*) as event_count
        FROM audit_events ae
        LEFT JOIN users u ON ae.user_id = u.id
        WHERE ae.timestamp >= $1 AND ae.timestamp <= $2 AND ae.user_id IS NOT NULL
        GROUP BY user_id, u.username
        ORDER BY event_count DESC
        LIMIT 10
      `, params);

      const topUsers = topUsersResult.rows.map(row => ({
        userId: row.user_id,
        username: row.username || 'Unknown',
        eventCount: parseInt(row.event_count)
      }));

      // Top IPs (with basic risk scoring)
      const topIPsResult = await db.query(`
        SELECT 
          client_ip,
          COUNT(*) as event_count,
          COUNT(*) FILTER (WHERE outcome = 'failure') as failed_events,
          COUNT(DISTINCT event_type) as unique_event_types
        ${baseQuery}
        GROUP BY client_ip
        ORDER BY event_count DESC
        LIMIT 10
      `, params);

      const topIPs = topIPsResult.rows.map(row => {
        const eventCount = parseInt(row.event_count);
        const failedEvents = parseInt(row.failed_events);
        const uniqueEventTypes = parseInt(row.unique_event_types);
        
        // Simple risk scoring based on activity patterns
        const failureRate = failedEvents / eventCount;
        const riskScore = Math.min(100, 
          (failureRate * 40) + 
          (Math.min(eventCount / 100, 1) * 30) + 
          (Math.min(uniqueEventTypes / 10, 1) * 30)
        );

        return {
          ip: row.client_ip,
          eventCount,
          riskScore: Math.round(riskScore)
        };
      });

      return {
        period: { start: startDate, end: endDate },
        totalEvents,
        eventsByCategory,
        eventsBySeverity,
        uniqueUsers,
        uniqueIPs,
        securityEvents,
        failedLogins,
        accessDenials,
        trends: {
          dailyActivity,
          topUsers,
          topIPs
        }
      };

    } catch (error) {
      Logger.error('Failed to get audit statistics', {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Assess user risk based on audit trail
   */
  async assessUserRisk(userId: string, lookbackDays = 30): Promise<RiskAssessment> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (lookbackDays * 24 * 60 * 60 * 1000));

      const query = `
        SELECT 
          COUNT(*) as total_events,
          COUNT(*) FILTER (WHERE outcome = 'failure') as failed_events,
          COUNT(*) FILTER (WHERE severity = 'high') as high_severity_events,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_events,
          COUNT(*) FILTER (WHERE category = 'security') as security_events,
          COUNT(DISTINCT client_ip) as unique_ips,
          COUNT(DISTINCT DATE(timestamp)) as active_days
        FROM audit_events
        WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
      `;

      const result = await db.query(query, [userId, startDate, endDate]);
      const stats = result.rows[0];

      const totalEvents = parseInt(stats.total_events);
      const failedEvents = parseInt(stats.failed_events);
      const highSeverityEvents = parseInt(stats.high_severity_events);
      const criticalEvents = parseInt(stats.critical_events);
      const securityEvents = parseInt(stats.security_events);
      const uniqueIPs = parseInt(stats.unique_ips);
      const activeDays = parseInt(stats.active_days);

      // Risk factors and scoring
      const factors = [];
      let riskScore = 0;

      // Failure rate factor
      if (totalEvents > 0) {
        const failureRate = failedEvents / totalEvents;
        if (failureRate > 0.3) {
          factors.push({
            factor: 'High failure rate',
            weight: failureRate * 30,
            description: `${Math.round(failureRate * 100)}% of actions failed`
          });
          riskScore += failureRate * 30;
        }
      }

      // High severity events factor
      if (highSeverityEvents > 0) {
        const severityWeight = Math.min(highSeverityEvents * 5, 25);
        factors.push({
          factor: 'High severity events',
          weight: severityWeight,
          description: `${highSeverityEvents} high severity events`
        });
        riskScore += severityWeight;
      }

      // Critical events factor
      if (criticalEvents > 0) {
        const criticalWeight = criticalEvents * 10;
        factors.push({
          factor: 'Critical events',
          weight: criticalWeight,
          description: `${criticalEvents} critical events`
        });
        riskScore += criticalWeight;
      }

      // Multiple IP addresses factor
      if (uniqueIPs > 5) {
        const ipWeight = Math.min((uniqueIPs - 5) * 2, 15);
        factors.push({
          factor: 'Multiple IP addresses',
          weight: ipWeight,
          description: `Activity from ${uniqueIPs} different IP addresses`
        });
        riskScore += ipWeight;
      }

      // Security events factor
      if (securityEvents > 0) {
        const securityWeight = Math.min(securityEvents * 3, 20);
        factors.push({
          factor: 'Security-related events',
          weight: securityWeight,
          description: `${securityEvents} security-related events`
        });
        riskScore += securityWeight;
      }

      // Normalize risk score
      riskScore = Math.min(Math.round(riskScore), 100);

      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high' | 'critical';
      if (riskScore >= 80) riskLevel = 'critical';
      else if (riskScore >= 60) riskLevel = 'high';
      else if (riskScore >= 30) riskLevel = 'medium';
      else riskLevel = 'low';

      // Generate recommendations
      const recommendations = [];
      if (failedEvents > totalEvents * 0.2) {
        recommendations.push('Review recent failed actions and provide additional training');
      }
      if (uniqueIPs > 5) {
        recommendations.push('Verify legitimate use of multiple IP addresses');
      }
      if (criticalEvents > 0) {
        recommendations.push('Investigate critical security events immediately');
      }
      if (riskScore > 50) {
        recommendations.push('Consider additional monitoring and access review');
      }

      return {
        userId,
        riskScore,
        riskLevel,
        factors,
        recommendations,
        lastUpdated: new Date()
      };

    } catch (error) {
      Logger.error('Failed to assess user risk', {
        user_id: userId,
        lookback_days: lookbackDays,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Clean up old audit events (retention management)
   */
  async cleanupOldEvents(retentionDays: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const query = 'DELETE FROM audit_events WHERE timestamp < $1';
      const result = await db.query(query, [cutoffDate]);

      const deletedCount = result.rowCount || 0;

      Logger.info('Audit events cleanup completed', {
        retention_days: retentionDays,
        cutoff_date: cutoffDate.toISOString(),
        deleted_count: deletedCount
      });

      return deletedCount;

    } catch (error) {
      Logger.error('Failed to cleanup audit events', {
        retention_days: retentionDays,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Private helper methods

  private async createAuditTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        user_id UUID,
        session_id VARCHAR(255),
        resource_type VARCHAR(100),
        resource_id VARCHAR(255),
        action VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        metadata JSONB,
        client_ip INET NOT NULL,
        user_agent TEXT,
        outcome VARCHAR(20) NOT NULL,
        source VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    await db.query(query);
  }

  private async createAuditIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type)',
      'CREATE INDEX IF NOT EXISTS idx_audit_events_category ON audit_events(category)',
      'CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON audit_events(severity)',
      'CREATE INDEX IF NOT EXISTS idx_audit_events_outcome ON audit_events(outcome)',
      'CREATE INDEX IF NOT EXISTS idx_audit_events_client_ip ON audit_events(client_ip)',
      'CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_events_metadata ON audit_events USING GIN(metadata)',
      'CREATE INDEX IF NOT EXISTS idx_audit_events_compound ON audit_events(user_id, timestamp, category)'
    ];

    for (const indexQuery of indexes) {
      await db.query(indexQuery);
    }
  }

  private async getAggregations(whereClause: string, params: any[]): Promise<any> {
    try {
      const queries = {
        byCategory: `SELECT category, COUNT(*) as count FROM audit_events ${whereClause} GROUP BY category`,
        bySeverity: `SELECT severity, COUNT(*) as count FROM audit_events ${whereClause} GROUP BY severity`,
        byOutcome: `SELECT outcome, COUNT(*) as count FROM audit_events ${whereClause} GROUP BY outcome`,
        byEventType: `SELECT event_type, COUNT(*) as count FROM audit_events ${whereClause} GROUP BY event_type ORDER BY count DESC LIMIT 10`
      };

      const results = await Promise.all([
        db.query(queries.byCategory, params),
        db.query(queries.bySeverity, params),
        db.query(queries.byOutcome, params),
        db.query(queries.byEventType, params)
      ]);

      return {
        byCategory: Object.fromEntries(results[0].rows.map(r => [r.category, parseInt(r.count)])),
        bySeverity: Object.fromEntries(results[1].rows.map(r => [r.severity, parseInt(r.count)])),
        byOutcome: Object.fromEntries(results[2].rows.map(r => [r.outcome, parseInt(r.count)])),
        byEventType: Object.fromEntries(results[3].rows.map(r => [r.event_type, parseInt(r.count)]))
      };
    } catch (error) {
      return { byCategory: {}, bySeverity: {}, byOutcome: {}, byEventType: {} };
    }
  }

  private isCriticalSecurityEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): boolean {
    const criticalEvents = [
      AuditEventType.SECURITY_VIOLATION,
      AuditEventType.DATA_BREACH_ATTEMPT,
      AuditEventType.INTRUSION_ATTEMPT,
      AuditEventType.SUSPICIOUS_ACTIVITY
    ];

    return criticalEvents.includes(event.eventType) || 
           event.severity === AuditSeverity.CRITICAL;
  }

  private async triggerSecurityAlert(eventId: string, event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    // In a real implementation, this would send notifications, webhooks, etc.
    Logger.critical('SECURITY ALERT - Critical audit event detected', {
      event_id: eventId,
      event_type: event.eventType,
      user_id: event.userId,
      client_ip: event.clientIP,
      description: event.description,
      action_required: 'Immediate investigation required'
    });

    // Could integrate with external alerting systems here
    // - Slack/Teams notifications
    // - Email alerts
    // - SIEM integration
    // - Incident management systems
  }
}

export default AuditService;