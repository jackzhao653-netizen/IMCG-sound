#!/bin/bash
# backend:7862 frontend:7863
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() { kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true; }
trap cleanup EXIT

# Start backend
cd "$ROOT/backend"
/Users/jack/tools/tangoflux/venv/bin/python server.py &
BACKEND_PID=$!
sleep 2

# Start frontend
cd "$ROOT/frontend"
npm run dev -- --port 7863 &
FRONTEND_PID=$!

wait $FRONTEND_PID
