# MCP Management WebApp - Production Deployment Guide

## 🚀 Production-Ready Enterprise MCP Management Platform

The MCP Management WebApp is a comprehensive, enterprise-grade platform for managing Model Context Protocol servers with advanced security, real-time monitoring, AI-powered operations, and production hardening.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Monitoring & Observability](#monitoring--observability)
- [Security](#security)
- [Performance](#performance)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)

## 🏗️ Architecture Overview

### System Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Reverse Proxy  │    │   SSL/TLS Cert  │
│    (Traefik)    │◄──►│     (Traefik)    │◄──►│   (Let's Encrypt)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (Astro + React)     │   Backend (Node.js + Express)  │
│  - Dynamic Dashboard          │   - REST API                   │
│  - Real-time UI               │   - WebSocket Server           │
│  - AI Assistant               │   - AI Operations              │
│  - Error Boundaries           │   - RBAC & Security            │
└─────────────────────────────────────────────────────────────────┘
           │                                    │
           ▼                                    ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │      Redis      │    │  MCP Bridge     │
│   (Database)    │    │     (Cache)     │    │ (External API)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Monitoring & Observability                      │
├─────────────────────────────────────────────────────────────────┤
│  Prometheus     │   Grafana         │   Loki          │  Alerts │
│  (Metrics)      │   (Dashboards)    │   (Logs)        │ (Email) │
└─────────────────────────────────────────────────────────────────┘
```

### Key Features

- **🔐 Enterprise Security**: RBAC, MFA, audit trails, rate limiting
- **⚡ Real-time Updates**: WebSocket integration with auto-reconnection
- **🤖 AI-Powered Operations**: OpenAI integration for intelligent analysis
- **📊 Comprehensive Monitoring**: Prometheus, Grafana, alerting
- **🔄 High Availability**: Zero-downtime deployments, auto-scaling
- **🛡️ Production Hardening**: Error boundaries, caching, performance optimization

## 📋 Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 20.04+ recommended)
- **CPU**: 4+ cores
- **RAM**: 8GB+ (16GB recommended)
- **Storage**: 50GB+ SSD
- **Network**: Static IP, domain name

### Software Dependencies

- Docker 24.0+
- Docker Compose 2.0+
- Git
- curl/wget

### External Services

- **Domain & DNS**: Cloudflare recommended
- **SSL Certificates**: Let's Encrypt (automated)
- **Email**: SMTP server for notifications
- **OpenAI**: API key for AI features

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/your-org/mcp-management-webapp.git
cd mcp-management-webapp
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.production.example .env.production

# Edit configuration
nano .env.production
```

### 3. Deploy Application

```bash
# Make deployment script executable
chmod +x scripts/deploy.sh

# Run deployment
./scripts/deploy.sh deploy
```

### 4. Verify Deployment

```bash
# Check application health
curl https://your-domain.com/health

# Run smoke tests
./scripts/deploy.sh health
```

## ⚙️ Configuration

### Environment Variables

#### Required Variables

```bash
# Database
DB_PASSWORD=your_secure_db_password
DB_USER=mcpuser
DB_NAME=mcp_management

# Security
JWT_SECRET=your_jwt_secret_256_bits_minimum
SESSION_SECRET=your_session_secret_256_bits_minimum

# MCP Integration
MCP_BRIDGE_URL=http://185.163.117.155:3001
MCP_AUTH_TOKEN=your_mcp_auth_token

# AI Features
OPENAI_API_KEY=sk-proj-your-openai-api-key

# Domain & SSL
DOMAIN=mcp.yourdomain.com
ACME_EMAIL=admin@yourdomain.com
```

#### Optional Variables

```bash
# Performance
REDIS_DB=0
DB_POOL_MAX=20
ENABLE_CACHE=true

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_PASSWORD=secure_password

# Features
ENABLE_MONITORING=true
ENABLE_RATE_LIMITING=true
```

### SSL/TLS Configuration

The application automatically provisions SSL certificates via Let's Encrypt:

```yaml
# Automatic HTTPS with Cloudflare DNS challenge
certificatesresolvers:
  letsencrypt:
    acme:
      dnschallenge:
        provider: cloudflare
      email: your-email@domain.com
```

## 🚀 Deployment

### Production Deployment

```bash
# Full production deployment
./scripts/deploy.sh deploy
```

The deployment process includes:

1. **Prerequisites Check**: Validates environment and dependencies
2. **Backup Creation**: Automated database and volume backups
3. **Infrastructure Setup**: PostgreSQL, Redis, networking
4. **Application Deployment**: Zero-downtime rolling update
5. **Health Checks**: Comprehensive service validation
6. **Monitoring Setup**: Prometheus, Grafana, Loki configuration

### Deployment Options

```bash
# Deploy only
./scripts/deploy.sh deploy

# Create backup only
./scripts/deploy.sh backup

# Health check only
./scripts/deploy.sh health

# Rollback to previous version
./scripts/deploy.sh rollback
```

### CI/CD Pipeline

The included GitHub Actions workflow provides:

- **Code Quality**: ESLint, TypeScript checking, security audits
- **Testing**: Unit tests, integration tests, performance tests
- **Security Scanning**: Trivy, CodeQL analysis
- **Docker Build**: Multi-stage optimized builds
- **Automated Deployment**: Staging and production environments

## 📊 Monitoring & Observability

### Metrics Collection

- **Application Metrics**: Response times, error rates, throughput
- **System Metrics**: CPU, memory, disk, network utilization
- **Business Metrics**: User activity, AI usage, server health

### Dashboards

Access monitoring dashboards:

- **Grafana**: `https://your-domain.com:3001`
- **Prometheus**: `https://your-domain.com:9090`
- **Traefik Dashboard**: `https://your-domain.com:8080`

### Alerting

Configured alerts for:

- High CPU/memory usage (>80%)
- Elevated error rates (>5%)
- Slow response times (>1s)
- Database connection issues
- SSL certificate expiration

### Log Management

- **Structured Logging**: JSON format with correlation IDs
- **Log Aggregation**: Loki for centralized log storage
- **Log Retention**: 30 days default, configurable
- **Real-time Monitoring**: Live log streaming

## 🔐 Security

### Authentication & Authorization

- **Multi-Factor Authentication**: TOTP with backup codes
- **Role-Based Access Control**: Granular permissions system
- **Session Management**: Secure JWT tokens with refresh
- **Password Security**: Bcrypt hashing, complexity requirements

### Network Security

- **HTTPS Only**: Automatic HTTP to HTTPS redirect
- **Security Headers**: HSTS, CSP, X-Frame-Options
- **Rate Limiting**: Per-IP and per-user limits
- **CORS Configuration**: Strict origin policies

### Data Protection

- **Database Encryption**: At-rest encryption enabled
- **Secrets Management**: Environment-based configuration
- **Audit Logging**: Comprehensive security event tracking
- **Backup Encryption**: Encrypted backups with retention

### Compliance

- **GDPR Ready**: Data protection and privacy controls
- **Audit Trails**: Complete user action logging
- **Access Logging**: Detailed request/response tracking
- **Security Monitoring**: Real-time threat detection

## ⚡ Performance

### Caching Strategy

- **Application Cache**: Redis-based intelligent caching
- **CDN Integration**: Cloudflare for global content delivery
- **Database Query Optimization**: Connection pooling, indexing
- **Static Asset Optimization**: Compression, minification

### Performance Metrics

Target performance benchmarks:

- **Response Time**: <200ms for 95% of requests
- **Throughput**: 1000+ requests/second
- **Availability**: 99.9% uptime
- **Error Rate**: <0.1%

### Load Testing

```bash
# Install k6
npm install -g k6

# Run load tests
k6 run tests/performance/load-test.js

# Custom load test
k6 run --vus 50 --duration 5m tests/performance/load-test.js
```

### Scaling

#### Horizontal Scaling

```bash
# Scale application containers
docker-compose -f docker-compose.production.yml up -d --scale app=3

# Load balancer automatically distributes traffic
```

#### Vertical Scaling

```yaml
# Update resource limits in docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
```

## 🔧 Maintenance

### Regular Maintenance Tasks

#### Daily

- Monitor application health and metrics
- Review error logs and alerts
- Check disk space and performance

#### Weekly

- Review security audit logs
- Update dependencies (if needed)
- Backup verification

#### Monthly

- Security assessment and updates
- Performance optimization review
- Capacity planning assessment

### Database Maintenance

```bash
# Database backup
docker-compose exec postgres pg_dump -U mcpuser mcp_management > backup.sql

# Database restore
docker-compose exec -T postgres psql -U mcpuser mcp_management < backup.sql

# Database optimization
docker-compose exec postgres psql -U mcpuser -d mcp_management -c "VACUUM ANALYZE;"
```

### Updates and Patches

```bash
# Update application
git pull origin main
./scripts/deploy.sh deploy

# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker-compose pull
```

## 🛠️ Troubleshooting

### Common Issues

#### Application Won't Start

```bash
# Check logs
docker-compose logs app

# Check environment variables
docker-compose config

# Verify database connection
docker-compose exec postgres pg_isready
```

#### High Memory Usage

```bash
# Check container resources
docker stats

# Analyze memory usage
docker-compose exec app node -e "console.log(process.memoryUsage())"

# Restart services if needed
docker-compose restart app
```

#### SSL Certificate Issues

```bash
# Check certificate status
docker-compose exec traefik traefik config

# Force certificate renewal
docker-compose restart traefik
```

#### Database Connection Issues

```bash
# Check database status
docker-compose exec postgres pg_isready -U mcpuser

# Check connection pool
docker-compose exec app node -e "require('./backend/database/connection').healthCheck()"

# Restart database
docker-compose restart postgres
```

### Performance Issues

#### Slow Response Times

1. Check application metrics in Grafana
2. Review database query performance
3. Verify cache hit rates
4. Check network latency

#### High Error Rates

1. Review application logs
2. Check external service status (MCP Bridge, OpenAI)
3. Verify database connectivity
4. Review rate limiting configuration

### Emergency Procedures

#### Service Restoration

```bash
# Quick restart
docker-compose restart

# Full rebuild
docker-compose down
docker-compose up -d --build

# Rollback to previous version
./scripts/deploy.sh rollback
```

#### Data Recovery

```bash
# List available backups
ls -la backups/

# Restore from backup
./scripts/deploy.sh rollback
```

## 📞 Support

### Documentation

- **API Documentation**: `/api/docs`
- **System Monitoring**: Grafana dashboards
- **Log Analysis**: Loki interface

### Contact

- **Technical Support**: technical@collective-systems.de
- **Security Issues**: security@collective-systems.de
- **Emergency**: +49-xxx-xxx-xxxx (24/7)

### Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Model Context Protocol (MCP) community
- OpenAI for AI capabilities
- Cloudflare for infrastructure
- Open source community for tools and libraries

---

**🎉 Congratulations! Your MCP Management WebApp is now production-ready with enterprise-grade security, monitoring, and performance optimization.**