#!/bin/bash

# Start SAM Local API Gateway

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NETWORK_NAME="${PROJECT_ROOT##*/}_screenshot-network"
PORT=${1:-3000}

echo "🚀 Starting SAM Local API Gateway"
echo "=================================="
echo ""
echo "Port: $PORT"
echo "Network: $NETWORK_NAME"
echo ""
echo "Endpoints:"
echo "  POST http://localhost:$PORT/screenshots"
echo "  GET  http://localhost:$PORT/screenshots/{requestId}"
echo ""
echo "Press Ctrl+C to stop"
echo ""

sam local start-api \
  --port "$PORT" \
  --docker-network "$NETWORK_NAME" \
  --env-vars env.json
