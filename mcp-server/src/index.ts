import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { fileRouter } from './routes/fileRoutes.js';
import { mcpRouter } from './routes/mcpRoutes.js';
import { mcpTools } from './tools/index.js';
import { handleToolCall } from './tools/toolHandler.js';
import { startS3SyncScheduler, manualSync } from './services/s3Sync.js';

dotenv.config();

const PORT = process.env.PORT || 3001;
const app: Express = express();

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_FILE_SIZE || '50mb' }));

// Routes
app.use('/api/files', fileRouter);
app.use('/api/mcp', mcpRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'MCP Server is running' });
});

// S3 同步手动触发端点
app.post('/api/s3/sync', async (req, res) => {
  try {
    const result = await manualSync();
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(500).json({ success: false, message: result.message });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '同步失败',
    });
  }
});

// MCP Server Setup
const mcpServer = new Server(
  {
    name: 'mcp-interview-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register MCP tool handlers
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: mcpTools,
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  return await handleToolCall(request);
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`🚀 MCP Server running on port ${PORT}`);
  console.log(`📁 Upload directory: ${process.env.UPLOAD_DIR || './uploads'}`);
  console.log(`📊 Max file size: ${process.env.MAX_FILE_SIZE || '50mb'}`);
  
  // 启动 S3 同步服务（如果配置了 S3）
  if (process.env.S3_BUCKET) {
    startS3SyncScheduler();
  } else {
    console.log('ℹ️  S3_BUCKET 未配置，跳过 S3 同步功能');
  }
});

// Start MCP stdio transport (for CLI tools)
async function startMCPServer() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.log('🔧 MCP Server connected via stdio');
}

// Uncomment to enable stdio transport
// startMCPServer();

export { app, mcpServer };

