# MCP Management Web App

**AI-powered web interface for Model Context Protocol server management**

## 🎯 Overview

Modern, conversational web application for managing MCP (Model Context Protocol) bridges and servers. Features an AI assistant powered by OpenAI GPT-4 for natural language server management, real-time status monitoring, and intuitive dashboard interface.

## ✨ Key Features

### 🤖 AI Assistant
- **Natural Language Commands**: "Restart GitHub MCP server", "Show performance metrics"
- **OpenAI GPT-4 Integration**: Intelligent command parsing and execution
- **Conversational Interface**: Chat-based interaction with command history
- **Smart Suggestions**: Context-aware command recommendations

### 📊 Real-time Dashboard
- **Status Cards**: Live MCP server health and performance metrics
- **WebSocket Updates**: Instant status updates without page refresh
- **Performance Visualization**: Response times, success rates, request counts
- **System Overview**: System health, active connections, memory usage

### 🔧 Server Management
- **CRUD Operations**: Create, configure, restart, and delete MCP servers
- **Configuration Editor**: Visual and JSON-based configuration management
- **Real-time Monitoring**: Live server metrics and health status

## 🚀 Technology Stack

- **Frontend**: Astro 4.x + React 19 + TypeScript
- **Styling**: Tailwind CSS 4.x with custom dark theme
- **AI Integration**: OpenAI GPT-4 API
- **Real-time**: WebSocket connections
- **Deployment**: Cloudflare Pages
- **Domain**: mcp.collective-systems.de

## 🛠️ Quick Start

```bash
# Navigate to project
cd /Users/collective/Development/Services/bridges/mcp-bridge/mcp-management-webapp

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your OpenAI API key

# Start development server
npm run dev

# Open http://localhost:4321
```

## 📊 Implementation Status

### ✅ Phase 1 Complete (Current)
- [x] Project initialization and setup
- [x] Basic dashboard layout with system overview cards
- [x] AI assistant integration with OpenAI GPT-4
- [x] MCP bridge client service layer
- [x] Real-time WebSocket connection framework
- [x] Modern UI components (Cards, Buttons)
- [x] TypeScript definitions and configuration

### 🔄 Phase 2 Next
- [ ] Dynamic server cards with real MCP data
- [ ] WebSocket real-time status updates
- [ ] Server configuration management interface
- [ ] Performance metrics visualization
- [ ] Cloudflare Pages deployment

### ⏳ Phase 3 Future
- [ ] Advanced analytics dashboard
- [ ] Role-based access control
- [ ] Mobile PWA optimization

## 🏗️ Project Structure

```
src/
├── components/
│   ├── ui/                 # Reusable UI components
│   └── dashboard/          # Dashboard-specific components
├── services/               # Business logic
│   ├── mcp-client.ts      # MCP bridge communication
│   └── ai-assistant.ts    # OpenAI integration
├── lib/config.ts          # Configuration
├── types/index.ts         # TypeScript definitions
└── pages/index.astro      # Main dashboard page
```

## 💰 Cost Estimate

- **Cloudflare Pages**: Free tier
- **OpenAI API**: $20-50/month (usage-based)
- **Total**: ~$20-50/month

## 🎯 Next Steps

1. **Connect to real MCP data** - Integrate with existing MCP bridge server
2. **Implement WebSocket updates** - Real-time status monitoring
3. **Deploy to Cloudflare** - Production deployment on mcp.collective-systems.de
4. **Add server management** - CRUD operations for MCP servers

---

**Status**: ✅ Foundation Complete - Ready for Phase 2 Development  
**Live Demo**: http://localhost:4321 (development)  
**Production Domain**: mcp.collective-systems.de (pending deployment)