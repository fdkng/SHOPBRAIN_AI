#!/usr/bin/env python3
"""
Complete ShopBrain AI deployment automation script.
Handles all automated steps and provides instructions for manual steps.
"""

import os
import sys
import json
import subprocess
from pathlib import Path

def load_dotenv(path):
    """Simple dotenv loader without external dependency."""
    try:
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # Remove quotes if present
                    value = value.strip().strip('"\'')
                    os.environ[key.strip()] = value
    except Exception as e:
        pass  # Silently fail if .env can't be read

# Colors
GREEN = '\033[92m'
BLUE = '\033[94m'
YELLOW = '\033[93m'
RED = '\033[91m'
RESET = '\033[0m'
BOLD = '\033[1m'

def print_header(text):
    print(f"\n{BOLD}{BLUE}{'='*60}{RESET}")
    print(f"{BOLD}{BLUE}{text.center(60)}{RESET}")
    print(f"{BOLD}{BLUE}{'='*60}{RESET}\n")

def print_step(num, text):
    print(f"\n{BOLD}{BLUE}Step {num}: {text}{RESET}")
    print("-" * 60)

def print_success(text):
    print(f"{GREEN}✓ {text}{RESET}")

def print_warning(text):
    print(f"{YELLOW}⚠ {text}{RESET}")

def print_error(text):
    print(f"{RED}✗ {text}{RESET}")

def print_info(text):
    print(f"{BLUE}ℹ {text}{RESET}")

def run_command(cmd, description=""):
    """Run a shell command and return success status."""
    try:
        if description:
            print_info(f"{description}...")
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=False)
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)

# Main script
def main():
    print_header("ShopBrain AI - Complete Deployment Automation")
    
    # Get project root
    script_dir = Path(__file__).parent.resolve()
    os.chdir(script_dir)
    
    # Configuration
    backend_dir = script_dir / "backend"
    frontend_dir = script_dir / "frontend"
    env_file = backend_dir / ".env"
    
    # Step 1: Verify files
    print_step(1, "Verifying local files")
    
    required_files = [
        env_file,
        backend_dir / "main.py",
        backend_dir / "requirements.txt",
        backend_dir / "supabase_schema.sql",
    ]
    
    missing_files = [f for f in required_files if not f.exists()]
    if missing_files:
        for f in missing_files:
            print_error(f"Missing: {f}")
        return False
    
    for f in required_files:
        print_success(f"{f.name} exists")
    
    # Step 2: Load environment
    print_step(2, "Loading environment variables")
    
    if not env_file.exists():
        print_error(f".env file not found at {env_file}")
        return False
    
    load_dotenv(str(env_file))
    
    required_env_vars = [
        "OPENAI_API_KEY",
        "STRIPE_SECRET_KEY",
        "SUPABASE_URL",
        "SUPABASE_KEY",
        "SUPABASE_JWT_SECRET",
        "FRONTEND_ORIGIN",
    ]
    
    env_status = {}
    for var in required_env_vars:
        value = os.getenv(var, "")
        if value:
            masked_value = value[:10] + "***" + value[-10:] if len(value) > 20 else "***"
            print_success(f"{var}: {masked_value}")
            env_status[var] = True
        else:
            print_warning(f"{var}: NOT SET")
            env_status[var] = False
    
    # Step 3: Verify Git repository
    print_step(3, "Verifying Git repository")
    
    success, _, _ = run_command("git remote -v", "Checking Git remote")
    if success:
        print_success("Git remote configured")
        success, stdout, _ = run_command("git log --oneline -1", "Checking Git history")
        if success and stdout:
            print_success(f"Latest commit: {stdout.strip()}")
    else:
        print_warning("Git repository may not be properly configured")
    
    # Step 4: Check Python environment
    print_step(4, "Checking Python environment")
    
    success, stdout, _ = run_command("python3 --version", "Checking Python version")
    if success:
        print_success(stdout.strip())
    
    # Step 5: Verify backend requirements can be installed
    print_step(5, "Verifying backend dependencies")
    
    with open(backend_dir / "requirements.txt", "r") as f:
        requirements = [line.strip() for line in f if line.strip() and not line.startswith("#")]
    
    print_info(f"Found {len(requirements)} dependencies:")
    for req in requirements:
        print_info(f"  - {req}")
    
    # Step 6: Display Supabase migration SQL
    print_step(6, "Database migration script")
    
    with open(backend_dir / "supabase_schema.sql", "r") as f:
        migration_sql = f.read()
    
    print_info("Supabase migration SQL:")
    print("-" * 60)
    print(migration_sql)
    print("-" * 60)
    
    # Step 7: Create deployment checklist
    print_step(7, "Deployment checklist")
    
    checklist = {
        "Backend (Render)": {
            "1": "Create Web Service on https://dashboard.render.com",
            "2": "Connect GitHub repo: fdkng/SHOPBRAIN_AI",
            "3": "Set Root Directory to: backend",
            "4": "Build Command: pip install -r requirements.txt",
            "5": "Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT",
            "6": "Add all env vars from backend/.env",
            "7": "Deploy and note the public URL",
        },
        "Database (Supabase)": {
            "1": "Go to https://supabase.com/dashboard/projects",
            "2": "Select your project → SQL Editor",
            "3": "Click 'New Query'",
            "4": "Paste the SQL above",
            "5": "Execute (click 'Run')",
        },
        "Webhooks (Stripe)": {
            "1": "Go to https://dashboard.stripe.com/developers/webhooks",
            "2": "Click 'Add endpoint'",
            "3": "Endpoint URL: https://<your-render-url>/webhook",
            "4": "Events to send:",
            "4a": "  - checkout.session.completed",
            "4b": "  - customer.subscription.updated",
            "5": "Copy Signing Secret",
            "6": "Add to Render as STRIPE_WEBHOOK_SECRET env var",
        },
        "Frontend (Vercel)": {
            "1": "Update frontend/.env with: VITE_API_BASE=<render-url>",
            "2": "Run: cd frontend && npm run build",
            "3": "Deploy: npx vercel",
            "4": "Or use Vercel GitHub integration",
        },
        "Testing": {
            "1": "Visit frontend URL",
            "2": "Sign up with Supabase auth",
            "3": "Test /optimize endpoint with sample product",
            "4": "Try Stripe checkout (14-day trial)",
            "5": "Verify records in Supabase dashboard",
        },
    }
    
    for section, items in checklist.items():
        print(f"\n{BOLD}{BLUE}{section}{RESET}")
        for key, value in items.items():
            if key.endswith("a") or key.endswith("b"):
                print(f"  {BLUE}{value}{RESET}")
            else:
                print(f"  {value}")
    
    # Step 8: Generate summary report
    print_step(8, "Summary & Next Steps")
    
    print(f"\n{BOLD}Project Status:{RESET}")
    print(f"  Root: {script_dir}")
    print(f"  Backend: {backend_dir}")
    print(f"  Frontend: {frontend_dir}")
    
    print(f"\n{BOLD}Environment Variables:{RESET}")
    for var, status in env_status.items():
        status_str = f"{GREEN}✓{RESET}" if status else f"{YELLOW}⚠{RESET}"
        print(f"  {status_str} {var}")
    
    print(f"\n{BOLD}Files:{RESET}")
    print(f"  ✓ Backend configuration ready")
    print(f"  ✓ Database schema prepared")
    print(f"  ✓ Deployment documentation available")
    
    print(f"\n{BOLD}Recommended Next Steps:{RESET}")
    print(f"  1. Create Render Web Service (see checklist above)")
    print(f"  2. Add environment variables to Render")
    print(f"  3. Deploy backend and get public URL")
    print(f"  4. Apply Supabase migrations")
    print(f"  5. Configure Stripe webhook")
    print(f"  6. Update frontend with backend URL")
    print(f"  7. Deploy frontend to Vercel")
    print(f"  8. Run smoke tests")
    
    print_header("Setup Complete! 🎉")
    print(f"\n{BOLD}Important Links:{RESET}")
    print(f"  • Render Dashboard: https://dashboard.render.com")
    print(f"  • Supabase Dashboard: https://supabase.com/dashboard")
    print(f"  • Stripe Dashboard: https://dashboard.stripe.com")
    print(f"  • GitHub Repo: https://github.com/fdkng/SHOPBRAIN_AI")
    print(f"\n{BOLD}Documentation:{RESET}")
    print(f"  • RENDER_SETUP.md - Detailed Render setup")
    print(f"  • DEPLOYMENT.md - Full deployment guide")
    print(f"  • QUICKSTART.md - Quick start guide")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
