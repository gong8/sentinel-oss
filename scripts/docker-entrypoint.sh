#!/bin/sh
# Docker entrypoint script - starts all SENTINEL services

set -e

echo "Starting SENTINEL services..."

# Start API server (port 3000)
echo "Starting API server on port ${PORT:-3000}..."
tsx packages/api/dist/index.js &
API_PID=$!

# Start MCP Proxy server (port 3001)
echo "Starting MCP Proxy server on port ${MCP_PORT:-3001}..."
tsx packages/mcp/dist/index.js &
MCP_PID=$!

# Start A2A server (port 3002)
echo "Starting A2A server on port ${A2A_PORT:-3002}..."
tsx packages/a2a/dist/server.js &
A2A_PID=$!

# Start MCP Admin server (port 3003)
echo "Starting MCP Admin server on port ${ADMIN_MCP_PORT:-3003}..."
tsx packages/mcp-admin/dist/server.js &
MCP_ADMIN_PID=$!

# Handle shutdown signals
shutdown() {
  echo "Shutting down services..."
  kill -TERM $API_PID $MCP_PID $A2A_PID $MCP_ADMIN_PID 2>/dev/null || true
  wait
  exit 0
}

trap shutdown SIGTERM SIGINT

echo "All services started. Waiting..."
wait
