import { Pool, PoolConfig, Client } from 'pg';
import config, { getDatabaseUrl } from '@/config';
import Logger from '@/utils/logger';

export class DatabaseConnection {
  private pool: Pool;
  private static instance: DatabaseConnection;

  private constructor() {
    const poolConfig: PoolConfig = {
      connectionString: getDatabaseUrl(),
      max: config.database.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      
      // Connection pool optimization
      application_name: 'mcp-management-api',
      query_timeout: 30000,
      statement_timeout: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 0,
    };

    this.pool = new Pool(poolConfig);
    this.setupEventHandlers();
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', (client) => {
      Logger.database('New client connected', { 
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      });
    });

    this.pool.on('acquire', (client) => {
      Logger.database('Client acquired from pool');
    });

    this.pool.on('remove', (client) => {
      Logger.database('Client removed from pool', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount
      });
    });

    this.pool.on('error', (err, client) => {
      Logger.error('Unexpected error on idle client', { error: err.message });
    });
  }

  public async query<T = any>(
    text: string, 
    params?: any[], 
    requestId?: string
  ): Promise<{ rows: T[]; rowCount: number; duration: number }> {
    const start = Date.now();
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(text, params);
      const duration = Date.now() - start;
      
      Logger.database('Query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration_ms: duration,
        row_count: result.rowCount,
        request_id: requestId
      });

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        duration
      };
    } catch (error) {
      const duration = Date.now() - start;
      Logger.error('Database query failed', {
        query: text.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: duration,
        request_id: requestId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  public async transaction<T>(
    callback: (client: Client) => Promise<T>,
    requestId?: string
  ): Promise<T> {
    const client = await this.pool.connect();
    const start = Date.now();
    
    try {
      await client.query('BEGIN');
      Logger.database('Transaction started', { request_id: requestId });
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      const duration = Date.now() - start;
      Logger.database('Transaction committed', { 
        duration_ms: duration,
        request_id: requestId 
      });
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      const duration = Date.now() - start;
      Logger.error('Transaction rolled back', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: duration,
        request_id: requestId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows.length === 1 && result.rows[0]?.health === 1;
    } catch (error) {
      Logger.error('Database health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return false;
    }
  }

  public async getConnectionInfo(): Promise<{
    totalConnections: number;
    idleConnections: number;
    waitingConnections: number;
    database: string;
    user: string;
  }> {
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingConnections: this.pool.waitingCount,
      database: config.database.database,
      user: config.database.username
    };
  }

  public async close(): Promise<void> {
    try {
      await this.pool.end();
      Logger.info('Database connection pool closed');
    } catch (error) {
      Logger.error('Error closing database connection pool', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Migration and maintenance utilities
  public async runMigration(migrationSql: string, migrationName: string): Promise<void> {
    await this.transaction(async (client) => {
      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Check if migration already executed
      const existing = await client.query(
        'SELECT name FROM migrations WHERE name = $1',
        [migrationName]
      );

      if (existing.rows.length > 0) {
        Logger.info(`Migration ${migrationName} already executed, skipping`);
        return;
      }

      // Execute migration
      await client.query(migrationSql);
      
      // Record migration
      await client.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        [migrationName]
      );

      Logger.info(`Migration ${migrationName} executed successfully`);
    });
  }

  public async vacuum(table?: string): Promise<void> {
    const query = table ? `VACUUM ANALYZE ${table}` : 'VACUUM ANALYZE';
    await this.query(query);
    Logger.info(`Database vacuum completed`, { table });
  }

  public async getTableSizes(): Promise<Array<{ table: string; size: string; rows: number }>> {
    const { rows } = await this.query(`
      SELECT 
        schemaname,
        tablename as table,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        pg_stat_get_tuples_returned(c.oid) as rows
      FROM pg_tables pt
      JOIN pg_class c ON c.relname = pt.tablename
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);
    
    return rows;
  }
}

// Repository base class for common database operations
export abstract class BaseRepository {
  protected db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  protected async findById<T>(table: string, id: string, requestId?: string): Promise<T | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM ${table} WHERE id = $1`,
      [id],
      requestId
    );
    return rows[0] || null;
  }

  protected async findBy<T>(
    table: string, 
    conditions: Record<string, any>, 
    requestId?: string
  ): Promise<T[]> {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const whereClause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
    
    const { rows } = await this.db.query(
      `SELECT * FROM ${table} WHERE ${whereClause}`,
      values,
      requestId
    );
    return rows;
  }

  protected async create<T>(
    table: string, 
    data: Record<string, any>, 
    requestId?: string
  ): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    const columns = keys.join(', ');

    const { rows } = await this.db.query(
      `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values,
      requestId
    );
    return rows[0];
  }

  protected async update<T>(
    table: string, 
    id: string, 
    data: Record<string, any>, 
    requestId?: string
  ): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');

    const { rows } = await this.db.query(
      `UPDATE ${table} SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values],
      requestId
    );
    return rows[0] || null;
  }

  protected async delete(table: string, id: string, requestId?: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM ${table} WHERE id = $1`,
      [id],
      requestId
    );
    return rowCount > 0;
  }

  protected async paginate<T>(
    query: string,
    params: any[],
    page: number = 1,
    limit: number = 20,
    requestId?: string
  ): Promise<{
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Get total count
    const countQuery = query.replace(/SELECT .+ FROM/, 'SELECT COUNT(*) as total FROM');
    const { rows: countRows } = await this.db.query(countQuery, params, requestId);
    const total = parseInt(countRows[0]?.total || '0');

    // Get paginated data
    const offset = (page - 1) * limit;
    const paginatedQuery = `${query} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const { rows } = await this.db.query(paginatedQuery, [...params, limit, offset], requestId);

    const totalPages = Math.ceil(total / limit);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }
}

// Export singleton instance
export const db = DatabaseConnection.getInstance();
export default db;