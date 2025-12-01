#!/bin/bash
# Quick test to verify backend can start locally

set -e

echo "🔍 Backend Startup Test"
echo "======================="

# Change to repo root
cd "$(dirname "$0")"

# Check Python version
echo "✓ Python version:"
python3 --version

# Check if requirements are installed
echo ""
echo "✓ Checking main dependencies:"
python3 -c "import fastapi; print(f'  FastAPI: {fastapi.__version__}')" || echo "  ⚠ FastAPI not installed (install with: pip install -r backend/requirements.txt)"
python3 -c "import uvicorn; print(f'  Uvicorn: {uvicorn.__version__}')" || echo "  ⚠ Uvicorn not installed"
python3 -c "import openai; print(f'  OpenAI: {openai.__version__}')" || echo "  ⚠ OpenAI not installed"

# Check if backend.main can be imported
echo ""
echo "✓ Testing backend.main import:"
python3 -c "from backend.main import app; print('  ✓ Successfully imported backend.main:app')" || {
    echo "  ✗ Failed to import backend.main"
    exit 1
}

# Quick syntax check
echo ""
echo "✓ Checking backend/main.py syntax:"
python3 -m py_compile backend/main.py && echo "  ✓ No syntax errors" || {
    echo "  ✗ Syntax errors found"
    exit 1
}

# Check environment variables
echo ""
echo "✓ Environment variables status:"
python3 << 'EOF'
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
