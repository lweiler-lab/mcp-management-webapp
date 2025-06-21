import crypto from 'crypto';
import qrcode from 'qrcode';
import { authenticator } from 'otplib';
import { db } from '@/database/connection';
import Logger from '@/utils/logger';
import config from '@/config';

/**
 * Multi-Factor Authentication Service
 * 
 * Provides TOTP-based MFA with backup codes and device management
 * Supports Google Authenticator, Authy, and other TOTP apps
 */

export interface MFADevice {
  id: string;
  userId: string;
  name: string;
  type: 'totp' | 'backup_codes';
  secret?: string;
  backupCodes?: string[];
  isActive: boolean;
  createdAt: Date;
  lastUsed?: Date;
}

export interface MFASetupResult {
  secret: string;
  qrCodeUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
  deviceId: string;
}

export interface MFAVerificationResult {
  valid: boolean;
  deviceId?: string;
  deviceName?: string;
  isBackupCode?: boolean;
  attemptsRemaining?: number;
}

export class MFAService {
  private static instance: MFAService;

  private constructor() {
    // Configure OTP library
    authenticator.options = {
      window: 2, // Allow 2 time windows (±60 seconds)
      step: 30,  // 30-second time step
      digits: 6  // 6-digit codes
    };
  }

  public static getInstance(): MFAService {
    if (!MFAService.instance) {
      MFAService.instance = new MFAService();
    }
    return MFAService.instance;
  }

  /**
   * Initialize MFA system
   */
  async initialize(): Promise<void> {
    try {
      Logger.info('Initializing MFA system...');
      
      await this.createMFADevicesTable();
      await this.createMFAAttemptsTable();
      
      Logger.info('MFA system initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize MFA system', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Set up TOTP MFA for a user
   */
  async setupTOTP(userId: string, deviceName = 'Default Device'): Promise<MFASetupResult> {
    try {
      // Generate secret
      const secret = authenticator.generateSecret();
      
      // Get user info for QR code
      const userQuery = 'SELECT username, email FROM users WHERE id = $1';
      const userResult = await db.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }
      
      const user = userResult.rows[0];
      const serviceName = config.app?.name || 'MCP Management';
      const accountName = user.email || user.username;
      
      // Generate QR code
      const otpauth = authenticator.keyuri(accountName, serviceName, secret);
      const qrCodeDataUrl = await qrcode.toDataURL(otpauth);
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      
      // Store MFA device
      const deviceQuery = `
        INSERT INTO mfa_devices (user_id, name, type, secret, backup_codes, is_active)
        VALUES ($1, $2, 'totp', $3, $4, false)
        RETURNING id
      `;
      
      const deviceResult = await db.query(deviceQuery, [
        userId,
        deviceName,
        secret,
        JSON.stringify(backupCodes)
      ]);
      
      const deviceId = deviceResult.rows[0].id;
      
      Logger.audit('MFA setup initiated', {
        user_id: userId,
        device_id: deviceId,
        device_name: deviceName,
        device_type: 'totp'
      });
      
      return {
        secret,
        qrCodeUrl: otpauth,
        qrCodeDataUrl,
        backupCodes,
        deviceId
      };
      
    } catch (error) {
      Logger.error('Failed to setup TOTP MFA', {
        user_id: userId,
        device_name: deviceName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Verify TOTP setup and activate device
   */
  async verifyTOTPSetup(deviceId: string, token: string): Promise<boolean> {
    try {
      // Get device
      const device = await this.getMFADevice(deviceId);
      if (!device || device.type !== 'totp' || !device.secret) {
        throw new Error('Invalid device or device type');
      }
      
      // Verify token
      const isValid = authenticator.verify({
        token,
        secret: device.secret
      });
      
      if (!isValid) {
        Logger.security('MFA setup verification failed', {
          user_id: device.userId,
          device_id: deviceId,
          reason: 'invalid_token'
        });
        return false;
      }
      
      // Activate device
      await db.query('UPDATE mfa_devices SET is_active = true WHERE id = $1', [deviceId]);
      
      Logger.audit('MFA device activated', {
        user_id: device.userId,
        device_id: deviceId,
        device_name: device.name,
        device_type: device.type
      });
      
      return true;
      
    } catch (error) {
      Logger.error('Failed to verify TOTP setup', {
        device_id: deviceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Verify MFA token during authentication
   */
  async verifyMFA(userId: string, token: string, clientIP: string): Promise<MFAVerificationResult> {
    try {
      // Check rate limiting
      const canAttempt = await this.checkRateLimit(userId, clientIP);
      if (!canAttempt) {
        Logger.security('MFA verification rate limited', {
          user_id: userId,
          client_ip: clientIP
        });
        return { valid: false, attemptsRemaining: 0 };
      }
      
      // Get active MFA devices
      const devices = await this.getUserMFADevices(userId, true);
      if (devices.length === 0) {
        Logger.warn('No active MFA devices found for user', { user_id: userId });
        return { valid: false };
      }
      
      // Try TOTP devices first
      for (const device of devices.filter(d => d.type === 'totp')) {
        if (!device.secret) continue;
        
        const isValid = authenticator.verify({
          token,
          secret: device.secret
        });
        
        if (isValid) {
          await this.recordSuccessfulAttempt(userId, device.id, clientIP);
          return {
            valid: true,
            deviceId: device.id,
            deviceName: device.name,
            isBackupCode: false
          };
        }
      }
      
      // Try backup codes
      for (const device of devices.filter(d => d.type === 'totp' && d.backupCodes)) {
        const backupCodes = device.backupCodes || [];
        const codeIndex = backupCodes.findIndex(code => code === token);
        
        if (codeIndex !== -1) {
          // Remove used backup code
          backupCodes.splice(codeIndex, 1);
          await db.query(
            'UPDATE mfa_devices SET backup_codes = $1 WHERE id = $2',
            [JSON.stringify(backupCodes), device.id]
          );
          
          await this.recordSuccessfulAttempt(userId, device.id, clientIP, true);
          
          Logger.audit('Backup code used for MFA', {
            user_id: userId,
            device_id: device.id,
            remaining_codes: backupCodes.length
          });
          
          return {
            valid: true,
            deviceId: device.id,
            deviceName: device.name,
            isBackupCode: true
          };
        }
      }
      
      // Record failed attempt
      await this.recordFailedAttempt(userId, clientIP);
      
      const attemptsRemaining = await this.getRemainingAttempts(userId, clientIP);
      
      Logger.security('MFA verification failed', {
        user_id: userId,
        client_ip: clientIP,
        attempts_remaining: attemptsRemaining
      });
      
      return { valid: false, attemptsRemaining };
      
    } catch (error) {
      Logger.error('Failed to verify MFA', {
        user_id: userId,
        client_ip: clientIP,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { valid: false };
    }
  }

  /**
   * Check if user has MFA enabled
   */
  async isMFAEnabled(userId: string): Promise<boolean> {
    try {
      const query = 'SELECT COUNT(*) FROM mfa_devices WHERE user_id = $1 AND is_active = true';
      const result = await db.query(query, [userId]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      Logger.error('Failed to check MFA status', {
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get user's MFA devices
   */
  async getUserMFADevices(userId: string, activeOnly = false): Promise<MFADevice[]> {
    try {
      let query = 'SELECT * FROM mfa_devices WHERE user_id = $1';
      if (activeOnly) {
        query += ' AND is_active = true';
      }
      query += ' ORDER BY created_at DESC';
      
      const result = await db.query(query, [userId]);
      
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        type: row.type,
        secret: row.secret,
        backupCodes: row.backup_codes ? JSON.parse(row.backup_codes) : undefined,
        isActive: row.is_active,
        createdAt: row.created_at,
        lastUsed: row.last_used
      }));
      
    } catch (error) {
      Logger.error('Failed to get user MFA devices', {
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Disable MFA device
   */
  async disableMFADevice(deviceId: string, userId: string): Promise<boolean> {
    try {
      const result = await db.query(
        'UPDATE mfa_devices SET is_active = false WHERE id = $1 AND user_id = $2',
        [deviceId, userId]
      );
      
      if (result.rowCount === 0) {
        return false;
      }
      
      Logger.audit('MFA device disabled', {
        user_id: userId,
        device_id: deviceId
      });
      
      return true;
      
    } catch (error) {
      Logger.error('Failed to disable MFA device', {
        device_id: deviceId,
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Generate new backup codes
   */
  async generateNewBackupCodes(deviceId: string, userId: string): Promise<string[]> {
    try {
      const backupCodes = this.generateBackupCodes();
      
      const result = await db.query(
        'UPDATE mfa_devices SET backup_codes = $1 WHERE id = $2 AND user_id = $3 AND type = $4',
        [JSON.stringify(backupCodes), deviceId, userId, 'totp']
      );
      
      if (result.rowCount === 0) {
        throw new Error('Device not found or invalid type');
      }
      
      Logger.audit('New backup codes generated', {
        user_id: userId,
        device_id: deviceId,
        codes_count: backupCodes.length
      });
      
      return backupCodes;
      
    } catch (error) {
      Logger.error('Failed to generate new backup codes', {
        device_id: deviceId,
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Private helper methods

  private async createMFADevicesTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS mfa_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        secret VARCHAR(255),
        backup_codes JSONB,
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_used TIMESTAMP WITH TIME ZONE
      );
      
      CREATE INDEX IF NOT EXISTS idx_mfa_devices_user ON mfa_devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_mfa_devices_active ON mfa_devices(user_id, is_active);
    `;
    await db.query(query);
  }

  private async createMFAAttemptsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS mfa_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        device_id UUID REFERENCES mfa_devices(id) ON DELETE CASCADE,
        client_ip INET NOT NULL,
        success BOOLEAN NOT NULL,
        is_backup_code BOOLEAN DEFAULT false,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_mfa_attempts_user_time ON mfa_attempts(user_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_mfa_attempts_ip_time ON mfa_attempts(client_ip, timestamp);
    `;
    await db.query(query);
  }

  private generateBackupCodes(): string[] {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      // Generate 8-character backup codes
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  private async getMFADevice(deviceId: string): Promise<MFADevice | null> {
    try {
      const query = 'SELECT * FROM mfa_devices WHERE id = $1';
      const result = await db.query(query, [deviceId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        type: row.type,
        secret: row.secret,
        backupCodes: row.backup_codes ? JSON.parse(row.backup_codes) : undefined,
        isActive: row.is_active,
        createdAt: row.created_at,
        lastUsed: row.last_used
      };
    } catch (error) {
      Logger.error('Failed to get MFA device', {
        device_id: deviceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  private async checkRateLimit(userId: string, clientIP: string): Promise<boolean> {
    const timeWindow = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;
    
    const cutoff = new Date(Date.now() - timeWindow);
    
    const query = `
      SELECT COUNT(*) 
      FROM mfa_attempts 
      WHERE (user_id = $1 OR client_ip = $2) 
        AND success = false 
        AND timestamp > $3
    `;
    
    const result = await db.query(query, [userId, clientIP, cutoff]);
    const attempts = parseInt(result.rows[0].count);
    
    return attempts < maxAttempts;
  }

  private async recordSuccessfulAttempt(
    userId: string,
    deviceId: string,
    clientIP: string,
    isBackupCode = false
  ): Promise<void> {
    const query = `
      INSERT INTO mfa_attempts (user_id, device_id, client_ip, success, is_backup_code)
      VALUES ($1, $2, $3, true, $4)
    `;
    
    await db.query(query, [userId, deviceId, clientIP, isBackupCode]);
    
    // Update device last used
    await db.query('UPDATE mfa_devices SET last_used = NOW() WHERE id = $1', [deviceId]);
  }

  private async recordFailedAttempt(userId: string, clientIP: string): Promise<void> {
    const query = `
      INSERT INTO mfa_attempts (user_id, client_ip, success)
      VALUES ($1, $2, false)
    `;
    
    await db.query(query, [userId, clientIP]);
  }

  private async getRemainingAttempts(userId: string, clientIP: string): Promise<number> {
    const timeWindow = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;
    
    const cutoff = new Date(Date.now() - timeWindow);
    
    const query = `
      SELECT COUNT(*) 
      FROM mfa_attempts 
      WHERE (user_id = $1 OR client_ip = $2) 
        AND success = false 
        AND timestamp > $3
    `;
    
    const result = await db.query(query, [userId, clientIP, cutoff]);
    const attempts = parseInt(result.rows[0].count);
    
    return Math.max(0, maxAttempts - attempts);
  }
}

export default MFAService;