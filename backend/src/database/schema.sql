-- MCP Management Database Schema
-- This database stores management metadata and does NOT interfere with existing MCP Bridge
-- CRITICAL: This is a separate management layer that observes the existing bridge

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table for authentication and authorization
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer', 'service')),
    cloudflare_user_id VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255), -- For fallback authentication
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    login_count INTEGER DEFAULT 0,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes
    CONSTRAINT users_email_valid CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- User sessions for JWT token management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    refresh_token_hash VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW()
);

-- MCP Servers metadata (management layer, NOT the actual bridge servers)
-- This table stores management metadata about servers observed from the bridge
CREATE TABLE mcp_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    
    -- Connection info (READ-ONLY observation of bridge servers)
    bridge_server_id VARCHAR(255), -- ID from the actual bridge if available
    observed_url VARCHAR(500),
    observed_status VARCHAR(50) DEFAULT 'unknown',
    
    -- Management metadata (our own layer)
    environment VARCHAR(50) DEFAULT 'production' CHECK (environment IN ('development', 'staging', 'production')),
    tags JSONB DEFAULT '[]',
    owner_team VARCHAR(255),
    maintenance_window JSONB, -- {"start": "02:00", "end": "04:00", "timezone": "UTC"}
    
    -- Monitoring configuration
    health_check_enabled BOOLEAN DEFAULT true,
    health_check_interval INTEGER DEFAULT 30, -- seconds
    alert_thresholds JSONB DEFAULT '{}', -- {"response_time": 1000, "error_rate": 0.05}
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    -- Indexes
    UNIQUE(name),
    UNIQUE(bridge_server_id) -- Ensure we don't duplicate bridge servers
);

-- Server metrics (aggregated from bridge observations)
CREATE TABLE server_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT NOW(),
    
    -- Performance metrics (observed from bridge)
    response_time_ms INTEGER,
    request_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    
    -- Resource metrics (if available from bridge)
    cpu_usage DECIMAL(5,2), -- percentage
    memory_usage DECIMAL(5,2), -- percentage
    disk_usage DECIMAL(5,2), -- percentage
    network_io_bytes BIGINT,
    
    -- Computed metrics
    error_rate DECIMAL(5,4), -- percentage as decimal (e.g., 0.0123 = 1.23%)
    success_rate DECIMAL(5,4),
    availability DECIMAL(5,4),
    health_score DECIMAL(3,2), -- 0.00 to 1.00
    
    -- Custom metrics from bridge
    custom_metrics JSONB DEFAULT '{}',
    
    -- Retention policy: Keep detailed metrics for 30 days, aggregated for 1 year
    retention_policy VARCHAR(20) DEFAULT 'detailed' CHECK (retention_policy IN ('detailed', 'hourly', 'daily'))
);

-- Server alerts and incidents
CREATE TABLE server_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    
    -- Alert details
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('performance', 'availability', 'error_rate', 'custom')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Alert state
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'suppressed')),
    triggered_at TIMESTAMP DEFAULT NOW(),
    acknowledged_at TIMESTAMP,
    acknowledged_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    
    -- Alert data
    trigger_condition JSONB, -- The condition that triggered the alert
    current_value JSONB, -- Current metric values
    threshold_value JSONB, -- Threshold that was breached
    
    -- Notification tracking
    notifications_sent INTEGER DEFAULT 0,
    last_notification_at TIMESTAMP,
    suppressed_until TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs for security and compliance
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- User context
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(255),
    
    -- Action details
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(255),
    
    -- Action details
    details JSONB DEFAULT '{}',
    old_values JSONB,
    new_values JSONB,
    
    -- Security context
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    security_tags TEXT[],
    
    -- Timestamps
    timestamp TIMESTAMP DEFAULT NOW(),
    
    -- Retention: Keep audit logs for compliance (7 years)
    retention_until TIMESTAMP DEFAULT (NOW() + INTERVAL '7 years')
);

-- Security events for threat detection
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Event classification
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Event details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Source information
    user_id UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    source_location JSONB, -- Geolocation data
    
    -- Event data
    event_data JSONB DEFAULT '{}',
    indicators JSONB DEFAULT '{}', -- IOCs (Indicators of Compromise)
    
    -- Investigation
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'resolved', 'false_positive')),
    assigned_to UUID REFERENCES users(id),
    investigation_notes TEXT,
    
    -- Timestamps
    detected_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    
    -- SIEM integration
    siem_rule_id VARCHAR(255),
    correlation_id VARCHAR(255),
    
    -- Retention: Keep security events for investigation
    retention_until TIMESTAMP DEFAULT (NOW() + INTERVAL '2 years')
);

-- System health monitoring
CREATE TABLE system_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Service identification
    service_name VARCHAR(100) NOT NULL,
    service_type VARCHAR(50) NOT NULL, -- 'mcp_bridge', 'database', 'api', 'websocket'
    
    -- Health status
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
    response_time_ms INTEGER,
    
    -- Health details
    details JSONB DEFAULT '{}',
    error_message TEXT,
    
    -- Timestamps
    check_time TIMESTAMP DEFAULT NOW(),
    
    -- Retention: Keep health data for 90 days
    retention_until TIMESTAMP DEFAULT (NOW() + INTERVAL '90 days')
);

-- WebSocket connections tracking
CREATE TABLE websocket_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Connection details
    client_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    
    -- Connection metadata
    ip_address INET,
    user_agent TEXT,
    subscriptions JSONB DEFAULT '[]', -- Array of server IDs
    
    -- Connection state
    connected_at TIMESTAMP DEFAULT NOW(),
    last_heartbeat TIMESTAMP DEFAULT NOW(),
    disconnected_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    
    -- Statistics
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0
);

-- Configuration management
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Configuration identification
    config_key VARCHAR(255) UNIQUE NOT NULL,
    config_category VARCHAR(100) NOT NULL,
    
    -- Configuration value
    config_value JSONB NOT NULL,
    config_type VARCHAR(50) NOT NULL CHECK (config_type IN ('string', 'number', 'boolean', 'object', 'array')),
    
    -- Metadata
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false,
    is_user_configurable BOOLEAN DEFAULT true,
    
    -- Version control
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Notification preferences and delivery
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification channels
    email_enabled BOOLEAN DEFAULT true,
    slack_enabled BOOLEAN DEFAULT false,
    webhook_enabled BOOLEAN DEFAULT false,
    
    -- Channel configuration
    slack_webhook_url VARCHAR(500),
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(255),
    
    -- Notification filters
    alert_severity_threshold VARCHAR(20) DEFAULT 'medium',
    server_filters JSONB DEFAULT '[]', -- Array of server IDs to monitor
    alert_type_filters JSONB DEFAULT '[]', -- Array of alert types
    
    -- Quiet hours
    quiet_hours_enabled BOOLEAN DEFAULT false,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    quiet_hours_timezone VARCHAR(50) DEFAULT 'UTC',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_cloudflare_id ON users(cloudflare_user_id);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

CREATE INDEX idx_mcp_servers_name ON mcp_servers(name);
CREATE INDEX idx_mcp_servers_status ON mcp_servers(observed_status);
CREATE INDEX idx_mcp_servers_environment ON mcp_servers(environment);
CREATE INDEX idx_mcp_servers_bridge_id ON mcp_servers(bridge_server_id);

CREATE INDEX idx_server_metrics_server_id ON server_metrics(server_id);
CREATE INDEX idx_server_metrics_timestamp ON server_metrics(timestamp);
CREATE INDEX idx_server_metrics_server_time ON server_metrics(server_id, timestamp);
CREATE INDEX idx_server_metrics_retention ON server_metrics(retention_policy, timestamp);

CREATE INDEX idx_server_alerts_server_id ON server_alerts(server_id);
CREATE INDEX idx_server_alerts_status ON server_alerts(status);
CREATE INDEX idx_server_alerts_severity ON server_alerts(severity);
CREATE INDEX idx_server_alerts_triggered ON server_alerts(triggered_at);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_retention ON audit_logs(retention_until);

CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_timestamp ON security_events(detected_at);
CREATE INDEX idx_security_events_status ON security_events(status);
CREATE INDEX idx_security_events_severity ON security_events(severity);

CREATE INDEX idx_system_health_service ON system_health(service_name);
CREATE INDEX idx_system_health_status ON system_health(status);
CREATE INDEX idx_system_health_time ON system_health(check_time);
CREATE INDEX idx_system_health_retention ON system_health(retention_until);

CREATE INDEX idx_websocket_connections_client ON websocket_connections(client_id);
CREATE INDEX idx_websocket_connections_user ON websocket_connections(user_id);
CREATE INDEX idx_websocket_connections_active ON websocket_connections(is_active);

CREATE INDEX idx_system_config_key ON system_config(config_key);
CREATE INDEX idx_system_config_category ON system_config(config_category);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mcp_servers_updated_at BEFORE UPDATE ON mcp_servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_server_alerts_updated_at BEFORE UPDATE ON server_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_security_events_updated_at BEFORE UPDATE ON security_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Data retention cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Clean up old detailed metrics (keep for 30 days)
    DELETE FROM server_metrics 
    WHERE retention_policy = 'detailed' 
    AND timestamp < NOW() - INTERVAL '30 days';
    
    -- Clean up old hourly metrics (keep for 1 year)
    DELETE FROM server_metrics 
    WHERE retention_policy = 'hourly' 
    AND timestamp < NOW() - INTERVAL '1 year';
    
    -- Clean up old audit logs based on retention_until
    DELETE FROM audit_logs 
    WHERE retention_until < NOW();
    
    -- Clean up old security events based on retention_until
    DELETE FROM security_events 
    WHERE retention_until < NOW();
    
    -- Clean up old system health data based on retention_until
    DELETE FROM system_health 
    WHERE retention_until < NOW();
    
    -- Clean up old inactive WebSocket connections (keep for 7 days)
    DELETE FROM websocket_connections 
    WHERE is_active = false 
    AND disconnected_at < NOW() - INTERVAL '7 days';
    
    -- Clean up expired user sessions
    DELETE FROM user_sessions 
    WHERE expires_at < NOW();
    
    RAISE NOTICE 'Data cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup to run daily (requires pg_cron extension in production)
-- SELECT cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_data();');

-- Insert default system configuration
INSERT INTO system_config (config_key, config_category, config_value, config_type, description) VALUES
('app.name', 'general', '"MCP Management"', 'string', 'Application name'),
('app.version', 'general', '"1.0.0"', 'string', 'Application version'),
('monitoring.default_interval', 'monitoring', '30', 'number', 'Default monitoring interval in seconds'),
('monitoring.retention_days', 'monitoring', '30', 'number', 'Default metric retention in days'),
('alerts.default_thresholds', 'alerts', '{"response_time": 1000, "error_rate": 0.05, "availability": 0.95}', 'object', 'Default alert thresholds'),
('security.max_login_attempts', 'security', '5', 'number', 'Maximum login attempts before lockout'),
('security.lockout_duration_minutes', 'security', '30', 'number', 'Account lockout duration in minutes'),
('websocket.heartbeat_interval', 'websocket', '30', 'number', 'WebSocket heartbeat interval in seconds'),
('websocket.max_connections_per_user', 'websocket', '5', 'number', 'Maximum WebSocket connections per user')
ON CONFLICT (config_key) DO NOTHING;

-- Create default admin user (password should be changed on first login)
INSERT INTO users (email, name, role, is_active, email_verified) VALUES
('admin@collective-systems.de', 'System Administrator', 'admin', true, true)
ON CONFLICT (email) DO NOTHING;

-- Grant appropriate permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mcp_management_api;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mcp_management_api;