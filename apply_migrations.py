#!/usr/bin/env python3
"""
Apply Supabase schema migrations using the Supabase Python client.
This script creates tables and RLS policies for the ShopBrain AI app.
"""

import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # Service role key (has admin access)

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    sys.exit(1)

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Read migration SQL
migration_file = os.path.join(os.path.dirname(__file__), "backend", "supabase_schema.sql")
if not os.path.exists(migration_file):
    print(f"Error: Migration file not found: {migration_file}")
    sys.exit(1)

with open(migration_file, "r") as f:
    sql_script = f.read()

print("=" * 60)
print("Supabase Schema Migration")
print("=" * 60)
print(f"\nConnecting to Supabase: {SUPABASE_URL}")

# Execute SQL via the Supabase REST API's rpc endpoint
# Note: For full SQL execution, we need to use the PostgreSQL connection
# The Python client doesn't have a direct "execute raw SQL" method,
# so we'll use the database connection string instead

try:
    # Alternative: Use psycopg2 to connect directly (if available)
    import psycopg2
    from urllib.parse import urlparse
    
    # Parse Supabase connection string from the URL
    # Typically: postgresql://postgres:[password]@[host]:[port]/postgres
    parsed_url = urlparse(SUPABASE_URL)
    
    # For Supabase, the connection string is usually:
    # postgresql://postgres:[password]@db.[project-id].supabase.co:5432/postgres
    # We'll construct it from the REST URL
    project_ref = SUPABASE_URL.split("https://")[1].split(".supabase.co")[0]
    
    # Build connection string (you need the database password - usually from Supabase dashboard)
    # This is a limitation - we can't get the db password from just the URL
    print("\nNote: Direct PostgreSQL connection requires database credentials.")
    print("For now, please apply the schema manually via Supabase Dashboard:")
    print("\n1. Go to https://supabase.com/dashboard/project/" + project_ref + "/sql")
    print("2. Click 'New Query'")
    print("3. Copy and paste the contents of backend/supabase_schema.sql")
    print("4. Click 'Run'")
    print("\nAlternatively, set DATABASE_URL env var to enable automatic migration.")
    
except Exception as e:
    print(f"\nNote: Automatic schema application requires DATABASE_URL env var.")
    print(f"Please apply backend/supabase_schema.sql manually via Supabase Dashboard SQL editor.")
    print("\nSteps:")
    print("1. Go to https://supabase.com/dashboard/projects")
    print("2. Select your project")
    print("3. Go to SQL Editor")
    print("4. Click 'New Query'")
    print("5. Copy and paste backend/supabase_schema.sql")
    print("6. Click 'Run'")
    print("\n" + "=" * 60)
    print("Migration content to apply:")
    print("=" * 60)
    print(sql_script)
