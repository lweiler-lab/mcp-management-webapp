# Multi-stage Docker build for MCP Management WebApp
# Optimized for production deployment with security and performance

# Stage 1: Frontend Build
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY astro.config.mjs ./
COPY tailwind.config.mjs ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY public/ ./public/

# Build frontend
ARG PUBLIC_API_URL=http://localhost:3000
ARG PUBLIC_WS_URL=ws://localhost:3001/ws
ARG PUBLIC_ENVIRONMENT=production

ENV PUBLIC_API_URL=${PUBLIC_API_URL}
ENV PUBLIC_WS_URL=${PUBLIC_WS_URL}
ENV PUBLIC_ENVIRONMENT=${PUBLIC_ENVIRONMENT}

RUN npm run build

# Stage 2: Backend Build
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend

# Copy package files
COPY backend/package*.json ./
COPY backend/tsconfig.json ./

# Install dependencies (including dev for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY backend/src/ ./src/

# Build backend
RUN npm run build

# Remove dev dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 3: Production Runtime
FROM node:18-alpine AS runtime

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    postgresql-client \
    && rm -rf /var/cache/apk/*

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built applications
COPY --from=frontend-builder --chown=nodejs:nodejs /app/frontend/dist ./public
COPY --from=backend-builder --chown=nodejs:nodejs /app/backend/dist ./backend
COPY --from=backend-builder --chown=nodejs:nodejs /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder --chown=nodejs:nodejs /app/backend/package.json ./backend/

# Copy additional configuration files
COPY --chown=nodejs:nodejs docker/ ./
COPY --chown=nodejs:nodejs backend/database/schema.sql ./backend/database/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Health check script
COPY --chown=nodejs:nodejs <<EOF /app/healthcheck.js
const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => process.exit(1));
req.on('timeout', () => process.exit(1));
req.end();
EOF

# Startup script
COPY --chown=nodejs:nodejs <<EOF /app/start.sh
#!/bin/sh
set -e

echo "Starting MCP Management WebApp..."

# Wait for database if needed
if [ -n "\$DATABASE_URL" ]; then
  echo "Waiting for database..."
  until pg_isready -d "\$DATABASE_URL" -t 1; do
    echo "Database not ready, waiting..."
    sleep 2
  done
  echo "Database is ready!"
fi

# Run database migrations if needed
if [ "\$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  cd backend && npm run migrate
fi

# Start the application
echo "Starting server..."
exec dumb-init node backend/index.js
EOF

RUN chmod +x /app/start.sh /app/healthcheck.js

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node /app/healthcheck.js

# Labels for metadata
LABEL org.opencontainers.image.title="MCP Management WebApp"
LABEL org.opencontainers.image.description="Enterprise MCP server management platform"
LABEL org.opencontainers.image.vendor="Collective Systems"
LABEL org.opencontainers.image.licenses="MIT"

# Start application
CMD ["/app/start.sh"]