#!/usr/bin/env python3
"""
Final pre-deployment validation script
Checks all files are in place and configured correctly for Render
"""

import os
import sys
import json
from pathlib import Path

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def check(name, condition, error_msg=""):
    status = f"{Colors.GREEN}✓{Colors.RESET}" if condition else f"{Colors.RED}✗{Colors.RESET}"
    print(f"  {status} {name}")
    if not condition and error_msg:
        print(f"    {Colors.YELLOW}→ {error_msg}{Colors.RESET}")
    return condition

def main():
    print(f"\n{Colors.BOLD}{Colors.BLUE}🔍 ShopBrain AI - Render Pre-Deployment Validation{Colors.RESET}\n")
    
    root = Path(__file__).parent
    checks_passed = 0
    checks_total = 0
    
    # 1. Backend files exist
    print(f"{Colors.BOLD}1. Backend Files{Colors.RESET}")
    files_to_check = [
        ("backend/__init__.py", "Package marker"),
        ("backend/main.py", "FastAPI app"),
        ("backend/requirements.txt", "Dependencies"),
    ]
    
    for filepath, desc in files_to_check:
        full_path = root / filepath
        checks_total += 1
        if check(f"{desc} exists ({filepath})", full_path.exists(), f"File not found: {filepath}"):
            checks_passed += 1
    
    # 2. Root requirements files
    print(f"\n{Colors.BOLD}2. Root-Level Requirements{Colors.RESET}")
    root_files = [
        ("requirements.txt", "Root requirements"),
        ("backend/backend/requirements.txt", "Fallback requirements"),
    ]
    
    for filepath, desc in root_files:
        full_path = root / filepath
        checks_total += 1
        if check(f"{desc} exists ({filepath})", full_path.exists(), f"File not found: {filepath}"):
            checks_passed += 1
    
    # 3. Documentation files
    print(f"\n{Colors.BOLD}3. Documentation{Colors.RESET}")
    docs = [
        ("RENDER_SETUP.md", "Render setup guide"),
        ("render.yaml", "Render config reference"),
        ("RENDER_FINAL_SETUP.sh", "Final setup script"),
    ]
    
    for filepath, desc in docs:
        full_path = root / filepath
        checks_total += 1
        if check(f"{desc} exists ({filepath})", full_path.exists(), f"File not found: {filepath}"):
            checks_passed += 1
    
    # 4. Check backend/main.py content
    print(f"\n{Colors.BOLD}4. Backend Configuration{Colors.RESET}")
    main_py = root / "backend/main.py"
    checks_total += 1
    
    if main_py.exists():
        content = main_py.read_text()
        has_app = "app = FastAPI()" in content or "app=FastAPI()" in content
        if check("FastAPI app instance defined", has_app, "FastAPI app() not found in main.py"):
            checks_passed += 1
    else:
        check("FastAPI app instance defined", False, "main.py not found")
    
    # 5. Check requirements.txt content
    print(f"\n{Colors.BOLD}5. Dependency Versions{Colors.RESET}")
    req_file = root / "backend/requirements.txt"
    checks_total += 1
    
    if req_file.exists():
        content = req_file.read_text()
        has_httpx = "httpx==0.23.3" in content
        if check("httpx version correct (0.23.3)", has_httpx, "httpx==0.23.3 not found (conflict risk)"):
            checks_passed += 1
    else:
        check("httpx version correct", False, "requirements.txt not found")
    
    # 6. Git status
    print(f"\n{Colors.BOLD}6. Git Status{Colors.RESET}")
    checks_total += 1
    
    git_status = os.popen("cd '{}' && git status --porcelain 2>/dev/null".format(root)).read().strip()
    if not git_status:
        if check("All files committed to Git", True):
            checks_passed += 1
    else:
        uncommitted = git_status.split('\n')
        check("All files committed to Git", False, f"Uncommitted files: {len(uncommitted)}")
    
    # 7. Latest commit info
    print(f"\n{Colors.BOLD}7. Recent Commits{Colors.RESET}")
    latest_commits = os.popen("cd '{}' && git log --oneline -5 2>/dev/null".format(root)).read().strip()
    if latest_commits:
        print(f"  Latest commits:")
        for line in latest_commits.split('\n')[:3]:
            print(f"    {line}")
    
    # Summary
    print(f"\n{Colors.BOLD}{'='*70}{Colors.RESET}")
    percentage = (checks_passed / checks_total * 100) if checks_total > 0 else 0
    
    if checks_passed == checks_total:
        print(f"{Colors.GREEN}{Colors.BOLD}✅ All checks passed! ({checks_passed}/{checks_total}){Colors.RESET}")
        print(f"\n{Colors.BOLD}Next Steps:{Colors.RESET}")
        print(f"  1. Run: cat RENDER_FINAL_SETUP.sh")
        print(f"  2. Follow the instructions to update Render settings")
        print(f"  3. Go to Render Dashboard and:")
        print(f"     - Update Build Command: pip install -r backend/requirements.txt")
        print(f"     - Update Start Command: uvicorn main:app --app-dir backend --host 0.0.0.0 --port $PORT")
        print(f"     - Ensure Root Directory is blank (default repo root)")
        print(f"  4. Click 'Manual Deploy' → 'Deploy latest commit'")
        print(f"  5. Monitor build logs for success")
        print(f"\n{Colors.BOLD}Status: READY FOR DEPLOYMENT 🚀{Colors.RESET}\n")
        return 0
    else:
        print(f"{Colors.RED}{Colors.BOLD}❌ {checks_total - checks_passed} check(s) failed ({percentage:.0f}% complete){Colors.RESET}")
        print(f"\n{Colors.BOLD}Please fix the issues above before deploying.{Colors.RESET}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
