import { MCPServer, MCPServerConfig, PaginatedResponse } from '@/types';
import { BaseRepository } from '@/database/connection';
import Logger from '@/utils/logger';

export interface ServerFilters {
  page?: number;
  limit?: number;
  environment?: string;
  status?: string;
  search?: string;
  tags?: string[];
}

export interface CreateServerData {
  name: string;
  displayName?: string;
  description?: string;
  environment: 'development' | 'staging' | 'production';
  tags: string[];
  ownerTeam?: string;
  maintenanceWindow?: {
    start: string;
    end: string;
    timezone: string;
  };
  healthCheckEnabled: boolean;
  healthCheckInterval: number;
  alertThresholds: {
    responseTime?: number;
    errorRate?: number;
    availability?: number;
  };
  createdBy: string;
  observedStatus: string;
  bridgeServerId?: string;
  observedUrl?: string;
}

export interface UpdateServerData {
  name?: string;
  displayName?: string;
  description?: string;
  environment?: 'development' | 'staging' | 'production';
  tags?: string[];
  ownerTeam?: string;
  maintenanceWindow?: {
    start: string;
    end: string;
    timezone: string;
  };
  healthCheckEnabled?: boolean;
  healthCheckInterval?: number;
  alertThresholds?: {
    responseTime?: number;
    errorRate?: number;
    availability?: number;
  };
  observedStatus?: string;
  bridgeServerId?: string;
  observedUrl?: string;
}

/**
 * Server Repository for MCP Server Management
 * 
 * Handles all database operations for managed MCP servers.
 * This is a metadata layer that does NOT interfere with the existing MCP Bridge.
 */
export class ServerRepository extends BaseRepository {

  /**
   * Find all servers with pagination and filtering
   */
  async findAll(filters: ServerFilters = {}, requestId?: string): Promise<PaginatedResponse<MCPServer>> {
    const {
      page = 1,
      limit = 20,
      environment,
      status,
      search,
      tags
    } = filters;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (environment) {
      conditions.push(`environment = $${paramIndex++}`);
      params.push(environment);
    }

    if (status) {
      conditions.push(`observed_status = $${paramIndex++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR display_name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (tags && tags.length > 0) {
      conditions.push(`tags ?| array[$${paramIndex}]`);
      params.push(tags);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        s.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM mcp_servers s
      LEFT JOIN users u ON s.created_by = u.id
      ${whereClause}
      ORDER BY s.created_at DESC
    `;

    const result = await this.paginate<MCPServer>(query, params, page, limit, requestId);

    Logger.database('Servers query executed', query, undefined, {
      filters,
      result_count: result.data.length,
      request_id: requestId
    });

    return result;
  }

  /**
   * Find server by ID
   */
  async findById(id: string, requestId?: string): Promise<MCPServer | null> {
    const query = `
      SELECT 
        s.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM mcp_servers s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = $1
    `;

    const { rows } = await this.db.query(query, [id], requestId);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToServer(rows[0]);
  }

  /**
   * Find server by name
   */
  async findByName(name: string, requestId?: string): Promise<MCPServer | null> {
    const query = `
      SELECT 
        s.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM mcp_servers s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.name = $1
    `;

    const { rows } = await this.db.query(query, [name], requestId);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToServer(rows[0]);
  }

  /**
   * Find server by bridge server ID
   */
  async findByBridgeId(bridgeServerId: string, requestId?: string): Promise<MCPServer | null> {
    const query = `
      SELECT 
        s.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM mcp_servers s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.bridge_server_id = $1
    `;

    const { rows } = await this.db.query(query, [bridgeServerId], requestId);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToServer(rows[0]);
  }

  /**
   * Create new server
   */
  async create(data: CreateServerData, requestId?: string): Promise<MCPServer> {
    const query = `
      INSERT INTO mcp_servers (
        name,
        display_name,
        description,
        bridge_server_id,
        observed_url,
        observed_status,
        environment,
        tags,
        owner_team,
        maintenance_window,
        health_check_enabled,
        health_check_interval,
        alert_thresholds,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING *
    `;

    const params = [
      data.name,
      data.displayName || null,
      data.description || null,
      data.bridgeServerId || null,
      data.observedUrl || null,
      data.observedStatus,
      data.environment,
      JSON.stringify(data.tags),
      data.ownerTeam || null,
      data.maintenanceWindow ? JSON.stringify(data.maintenanceWindow) : null,
      data.healthCheckEnabled,
      data.healthCheckInterval,
      JSON.stringify(data.alertThresholds),
      data.createdBy
    ];

    const { rows } = await this.db.query(query, params, requestId);
    
    Logger.database('Server created', query, undefined, {
      server_id: rows[0].id,
      server_name: data.name,
      request_id: requestId
    });

    // Fetch the complete server with user info
    return this.findById(rows[0].id, requestId) as Promise<MCPServer>;
  }

  /**
   * Update server
   */
  async update(id: string, data: UpdateServerData, requestId?: string): Promise<MCPServer> {
    const updates: string[] = [];
    const params: any[] = [id];
    let paramIndex = 2;

    // Build dynamic update query
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbColumn = this.mapFieldToColumn(key);
        
        if (typeof value === 'object') {
          updates.push(`${dbColumn} = $${paramIndex++}`);
          params.push(JSON.stringify(value));
        } else {
          updates.push(`${dbColumn} = $${paramIndex++}`);
          params.push(value);
        }
      }
    });

    if (updates.length === 0) {
      // No updates to make, return existing server
      return this.findById(id, requestId) as Promise<MCPServer>;
    }

    const query = `
      UPDATE mcp_servers 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await this.db.query(query, params, requestId);
    
    if (rows.length === 0) {
      throw new Error('Server not found');
    }

    Logger.database('Server updated', query, undefined, {
      server_id: id,
      updates: Object.keys(data),
      request_id: requestId
    });

    // Fetch the complete server with user info
    return this.findById(id, requestId) as Promise<MCPServer>;
  }

  /**
   * Delete server
   */
  async delete(id: string, requestId?: string): Promise<boolean> {
    const query = 'DELETE FROM mcp_servers WHERE id = $1';
    const { rowCount } = await this.db.query(query, [id], requestId);
    
    Logger.database('Server deleted', query, undefined, {
      server_id: id,
      deleted: rowCount > 0,
      request_id: requestId
    });

    return rowCount > 0;
  }

  /**
   * Get servers by environment
   */
  async findByEnvironment(environment: string, requestId?: string): Promise<MCPServer[]> {
    const query = `
      SELECT 
        s.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM mcp_servers s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.environment = $1
      ORDER BY s.name
    `;

    const { rows } = await this.db.query(query, [environment], requestId);
    
    return rows.map(row => this.mapRowToServer(row));
  }

  /**
   * Get servers by status
   */
  async findByStatus(status: string, requestId?: string): Promise<MCPServer[]> {
    const query = `
      SELECT 
        s.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM mcp_servers s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.observed_status = $1
      ORDER BY s.updated_at DESC
    `;

    const { rows } = await this.db.query(query, [status], requestId);
    
    return rows.map(row => this.mapRowToServer(row));
  }

  /**
   * Get servers by tags
   */
  async findByTags(tags: string[], requestId?: string): Promise<MCPServer[]> {
    const query = `
      SELECT 
        s.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM mcp_servers s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.tags ?| array[$1]
      ORDER BY s.name
    `;

    const { rows } = await this.db.query(query, [tags], requestId);
    
    return rows.map(row => this.mapRowToServer(row));
  }

  /**
   * Update server status (for monitoring)
   */
  async updateStatus(id: string, status: string, requestId?: string): Promise<void> {
    const query = `
      UPDATE mcp_servers 
      SET observed_status = $2, updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [id, status], requestId);
    
    Logger.database('Server status updated', query, undefined, {
      server_id: id,
      new_status: status,
      request_id: requestId
    });
  }

  /**
   * Bulk update server statuses
   */
  async bulkUpdateStatus(updates: Array<{ id: string; status: string }>, requestId?: string): Promise<void> {
    const query = `
      UPDATE mcp_servers 
      SET observed_status = data.status, updated_at = NOW()
      FROM (VALUES ${updates.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')}) 
      AS data(id, status)
      WHERE mcp_servers.id = data.id::uuid
    `;

    const params: any[] = [];
    updates.forEach(update => {
      params.push(update.id, update.status);
    });

    await this.db.query(query, params, requestId);
    
    Logger.database('Bulk server status update', query, undefined, {
      update_count: updates.length,
      request_id: requestId
    });
  }

  /**
   * Get server statistics
   */
  async getStatistics(requestId?: string): Promise<{
    total: number;
    byEnvironment: Record<string, number>;
    byStatus: Record<string, number>;
    recentlyCreated: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE environment = 'production') as production,
        COUNT(*) FILTER (WHERE environment = 'staging') as staging,
        COUNT(*) FILTER (WHERE environment = 'development') as development,
        COUNT(*) FILTER (WHERE observed_status = 'healthy') as healthy,
        COUNT(*) FILTER (WHERE observed_status = 'unhealthy') as unhealthy,
        COUNT(*) FILTER (WHERE observed_status = 'unknown') as unknown,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as recently_created
      FROM mcp_servers
    `;

    const { rows } = await this.db.query(query, [], requestId);
    const stats = rows[0];

    return {
      total: parseInt(stats.total),
      byEnvironment: {
        production: parseInt(stats.production),
        staging: parseInt(stats.staging),
        development: parseInt(stats.development)
      },
      byStatus: {
        healthy: parseInt(stats.healthy),
        unhealthy: parseInt(stats.unhealthy),
        unknown: parseInt(stats.unknown)
      },
      recentlyCreated: parseInt(stats.recently_created)
    };
  }

  /**
   * Map database row to MCPServer object
   */
  private mapRowToServer(row: any): MCPServer {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      url: row.observed_url || '',
      status: row.observed_status as any,
      config: {
        name: row.name,
        url: row.observed_url || '',
        timeout: 30000,
        retryAttempts: 3,
        enableMetrics: row.health_check_enabled,
        enableLogging: true,
        environment: row.environment
      },
      healthScore: 0, // Would be calculated from metrics
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by,
      
      // Additional metadata
      environment: row.environment,
      tags: JSON.parse(row.tags || '[]'),
      ownerTeam: row.owner_team,
      maintenanceWindow: row.maintenance_window ? JSON.parse(row.maintenance_window) : undefined,
      healthCheckEnabled: row.health_check_enabled,
      healthCheckInterval: row.health_check_interval,
      alertThresholds: JSON.parse(row.alert_thresholds || '{}'),
      bridgeServerId: row.bridge_server_id,
      
      // User info
      createdByName: row.created_by_name,
      createdByEmail: row.created_by_email
    } as MCPServer;
  }

  /**
   * Map API field names to database column names
   */
  private mapFieldToColumn(field: string): string {
    const mapping: Record<string, string> = {
      'displayName': 'display_name',
      'bridgeServerId': 'bridge_server_id',
      'observedUrl': 'observed_url',
      'observedStatus': 'observed_status',
      'ownerTeam': 'owner_team',
      'maintenanceWindow': 'maintenance_window',
      'healthCheckEnabled': 'health_check_enabled',
      'healthCheckInterval': 'health_check_interval',
      'alertThresholds': 'alert_thresholds'
    };

    return mapping[field] || field;
  }
}

export default ServerRepository;