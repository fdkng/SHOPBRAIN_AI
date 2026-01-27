#!/bin/bash
# Quick test to verify backend can start locally

set -e

echo "🔍 Backend Startup Test"
echo "======================="

# Change to repo root
cd "$(dirname "$0")"

PYTHON_BIN="python3"
if [ -x "./.venv/bin/python" ]; then
    PYTHON_BIN="./.venv/bin/python"
fi

# Check Python version
echo "✓ Python version:"
"$PYTHON_BIN" --version

# Check if requirements are installed
echo ""
echo "✓ Checking main dependencies:"
"$PYTHON_BIN" -c "import fastapi; print(f'  FastAPI: {fastapi.__version__}')" || echo "  ⚠ FastAPI not installed (install with: pip install -r backend/requirements.txt)"
"$PYTHON_BIN" -c "import uvicorn; print(f'  Uvicorn: {uvicorn.__version__}')" || echo "  ⚠ Uvicorn not installed"
"$PYTHON_BIN" -c "import openai; print(f'  OpenAI: {openai.__version__}')" || echo "  ⚠ OpenAI not installed"

# Check if backend.main can be imported
echo ""
echo "✓ Testing backend.main import:"
"$PYTHON_BIN" -c "from backend.main import app; print('  ✓ Successfully imported backend.main:app')" || {
    echo "  ✗ Failed to import backend.main"
    exit 1
}

# Quick syntax check
echo ""
echo "✓ Checking backend/main.py syntax:"
"$PYTHON_BIN" -m py_compile backend/main.py && echo "  ✓ No syntax errors" || {
    echo "  ✗ Syntax errors found"
    exit 1
}

# Check environment variables
echo ""
echo "✓ Environment variables status:"
"$PYTHON_BIN" << 'EOF'
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")

vars_to_check = [
    "OPENAI_API_KEY",
    "STRIPE_SECRET_KEY",
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_JWT_SECRET",
]

for var in vars_to_check:
    value = os.getenv(var)
    if value:
        masked = value[:8] + "***" if len(value) > 8 else "***"
        print(f"  ✓ {var}: {masked}")
    else:
        print(f"  ⚠ {var}: NOT SET")
EOF

echo ""
echo "✅ All tests passed! Backend should start successfully on Render."
echo ""
echo "Next: Verify Render deployment by visiting:"
echo "  https://dashboard.render.com → Select service → View live URL"
