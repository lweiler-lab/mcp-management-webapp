#!/bin/bash

# MCP Management WebApp Deployment Script
# Production deployment with zero-downtime and rollback capabilities

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_DIR}/.env.production"
BACKUP_DIR="${PROJECT_DIR}/backups"
LOG_FILE="${PROJECT_DIR}/deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $message"
            ;;
        "DEBUG")
            echo -e "${BLUE}[DEBUG]${NC} $message"
            ;;
    esac
    
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

# Error handler
error_exit() {
    log "ERROR" "$1"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        error_exit "Docker is not installed"
    fi
    
    if ! docker info &> /dev/null; then
        error_exit "Docker is not running"
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error_exit "Docker Compose is not installed"
    fi
    
    # Check if environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        error_exit "Environment file not found: $ENV_FILE"
    fi
    
    # Load environment variables
    set -a
    source "$ENV_FILE"
    set +a
    
    # Check required environment variables
    local required_vars=(
        "DB_PASSWORD"
        "JWT_SECRET"
        "SESSION_SECRET"
        "MCP_AUTH_TOKEN"
        "OPENAI_API_KEY"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            error_exit "Required environment variable $var is not set"
        fi
    done
    
    log "INFO" "Prerequisites check passed"
}

# Create backup
create_backup() {
    log "INFO" "Creating backup..."
    
    local backup_timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_path="${BACKUP_DIR}/backup_${backup_timestamp}"
    
    mkdir -p "$backup_path"
    
    # Database backup
    if docker-compose -f docker-compose.production.yml ps postgres | grep -q "Up"; then
        log "INFO" "Creating database backup..."
        docker-compose -f docker-compose.production.yml exec -T postgres pg_dump \
            -U "${DB_USER:-mcpuser}" \
            -d "${DB_NAME:-mcp_management}" \
            --clean --if-exists --create \
            > "${backup_path}/database.sql"
        
        if [[ $? -eq 0 ]]; then
            log "INFO" "Database backup created: ${backup_path}/database.sql"
        else
            error_exit "Failed to create database backup"
        fi
    else
        log "WARN" "PostgreSQL container not running, skipping database backup"
    fi
    
    # Application data backup
    if docker volume ls | grep -q "mcp-management"; then
        log "INFO" "Creating volume backups..."
        docker run --rm \
            -v "$(pwd)":/backup \
            -v mcp-management_postgres-data:/data \
            alpine tar czf "/backup/${backup_path}/postgres-data.tar.gz" -C /data .
        
        docker run --rm \
            -v "$(pwd)":/backup \
            -v mcp-management_redis-data:/data \
            alpine tar czf "/backup/${backup_path}/redis-data.tar.gz" -C /data .
    fi
    
    log "INFO" "Backup completed: $backup_path"
    echo "$backup_path" > "${BACKUP_DIR}/latest_backup.txt"
}

# Health check
health_check() {
    local service=$1
    local max_attempts=${2:-30}
    local attempt=1
    
    log "INFO" "Performing health check for $service..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker-compose -f docker-compose.production.yml ps "$service" | grep -q "healthy\|Up"; then
            log "INFO" "$service is healthy"
            return 0
        fi
        
        log "DEBUG" "Health check attempt $attempt/$max_attempts for $service"
        sleep 2
        ((attempt++))
    done
    
    error_exit "$service failed health check after $max_attempts attempts"
}

# Deploy application
deploy() {
    log "INFO" "Starting deployment..."
    
    cd "$PROJECT_DIR"
    
    # Pull latest images
    log "INFO" "Pulling latest images..."
    docker-compose -f docker-compose.production.yml pull
    
    # Build application if needed
    if [[ "${BUILD_LOCALLY:-false}" == "true" ]]; then
        log "INFO" "Building application locally..."
        docker-compose -f docker-compose.production.yml build --no-cache app
    fi
    
    # Start infrastructure services first
    log "INFO" "Starting infrastructure services..."
    docker-compose -f docker-compose.production.yml up -d postgres redis
    
    # Wait for database to be ready
    health_check postgres 60
    health_check redis 30
    
    # Run database migrations
    log "INFO" "Running database migrations..."
    docker-compose -f docker-compose.production.yml run --rm \
        -e RUN_MIGRATIONS=true \
        app sh -c "cd backend && npm run migrate"
    
    # Start application with rolling update
    log "INFO" "Starting application..."
    docker-compose -f docker-compose.production.yml up -d app
    
    # Wait for application to be healthy
    health_check app 60
    
    # Start monitoring and proxy services
    log "INFO" "Starting monitoring services..."
    docker-compose -f docker-compose.production.yml up -d traefik prometheus grafana loki
    
    # Final health checks
    health_check traefik 30
    
    log "INFO" "Deployment completed successfully"
}

# Smoke tests
run_smoke_tests() {
    log "INFO" "Running smoke tests..."
    
    local app_url="${PUBLIC_API_URL:-http://localhost:3000}"
    local max_attempts=10
    local attempt=1
    
    # Test API health endpoint
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "${app_url}/health" > /dev/null; then
            log "INFO" "API health check passed"
            break
        fi
        
        log "DEBUG" "API health check attempt $attempt/$max_attempts"
        sleep 3
        ((attempt++))
        
        if [[ $attempt -gt $max_attempts ]]; then
            error_exit "API health check failed after $max_attempts attempts"
        fi
    done
    
    # Test API endpoints
    local endpoints=(
        "/health"
        "/api"
        "/api/v1/system/info"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if curl -f -s "${app_url}${endpoint}" > /dev/null; then
            log "INFO" "Endpoint $endpoint is accessible"
        else
            log "WARN" "Endpoint $endpoint is not accessible"
        fi
    done
    
    log "INFO" "Smoke tests completed"
}

# Rollback function
rollback() {
    log "WARN" "Initiating rollback..."
    
    local backup_path
    if [[ -f "${BACKUP_DIR}/latest_backup.txt" ]]; then
        backup_path=$(cat "${BACKUP_DIR}/latest_backup.txt")
    else
        error_exit "No backup found for rollback"
    fi
    
    if [[ ! -d "$backup_path" ]]; then
        error_exit "Backup directory not found: $backup_path"
    fi
    
    # Stop current services
    docker-compose -f docker-compose.production.yml down
    
    # Restore database
    if [[ -f "${backup_path}/database.sql" ]]; then
        log "INFO" "Restoring database..."
        docker-compose -f docker-compose.production.yml up -d postgres
        health_check postgres 60
        
        docker-compose -f docker-compose.production.yml exec -T postgres \
            psql -U "${DB_USER:-mcpuser}" -d "${DB_NAME:-mcp_management}" \
            < "${backup_path}/database.sql"
    fi
    
    # Restore volumes if needed
    if [[ -f "${backup_path}/postgres-data.tar.gz" ]]; then
        log "INFO" "Restoring volume data..."
        docker run --rm \
            -v "$(pwd)":/backup \
            -v mcp-management_postgres-data:/data \
            alpine sh -c "cd /data && tar xzf /backup/${backup_path}/postgres-data.tar.gz"
    fi
    
    log "INFO" "Rollback completed"
}

# Cleanup old backups
cleanup_old_backups() {
    log "INFO" "Cleaning up old backups..."
    
    if [[ -d "$BACKUP_DIR" ]]; then
        find "$BACKUP_DIR" -name "backup_*" -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
        log "INFO" "Old backups cleaned up (kept last 7 days)"
    fi
}

# Main deployment logic
main() {
    local action=${1:-deploy}
    
    # Create necessary directories
    mkdir -p "$BACKUP_DIR"
    touch "$LOG_FILE"
    
    log "INFO" "Starting MCP Management WebApp deployment script"
    log "INFO" "Action: $action"
    
    case $action in
        "deploy")
            check_prerequisites
            create_backup
            deploy
            run_smoke_tests
            cleanup_old_backups
            log "INFO" "Deployment completed successfully!"
            ;;
        "rollback")
            rollback
            log "INFO" "Rollback completed!"
            ;;
        "backup")
            check_prerequisites
            create_backup
            log "INFO" "Backup completed!"
            ;;
        "health")
            check_prerequisites
            run_smoke_tests
            log "INFO" "Health check completed!"
            ;;
        *)
            echo "Usage: $0 [deploy|rollback|backup|health]"
            echo ""
            echo "  deploy   - Full deployment with backup and health checks"
            echo "  rollback - Rollback to latest backup"
            echo "  backup   - Create backup only"
            echo "  health   - Run health checks only"
            exit 1
            ;;
    esac
}

# Trap errors and cleanup
trap 'error_exit "Deployment script failed"' ERR

# Run main function
main "$@"