#!/bin/bash
# Quick test script to verify backend health

BACKEND_URL="https://shopbrain-backend.onrender.com"
TIMEOUT=5

echo "🔍 Testing backend health..."
echo "URL: $BACKEND_URL/health"

response=$(curl -s -w "\n%{http_code}" -m $TIMEOUT "$BACKEND_URL/health")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: $http_code"
echo "Response Body:"
echo "$body" | jq . 2>/dev/null || echo "$body"

if [ "$http_code" = "200" ]; then
    echo "✅ Backend is healthy!"
    exit 0
else
    echo "❌ Backend returned status $http_code"
    exit 1
fi
