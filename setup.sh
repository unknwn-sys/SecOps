#!/bin/bash

# Offensive Security Portal - Setup Script
# This script helps configure the portal for first-time use

set -e

echo "========================================"
echo "Offensive Security Portal - Setup"
echo "========================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Please create .env first (see .env.example)"
    exit 1
fi

echo "✓ .env file found"
echo ""

# Check dependencies
echo "Checking dependencies..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found"
    exit 1
fi
echo "✓ Node.js $(node --version)"

if ! command -v mysql &> /dev/null; then
    echo "⚠ mysql CLI not found (optional, but recommended for setup)"
fi

echo ""
echo "========================================"
echo "SETUP STEPS"
echo "========================================"
echo ""

echo "1. ENVIRONMENT VARIABLES"
echo "   Current DATABASE_URL: $(grep DATABASE_URL .env | cut -d'=' -f2)"
echo "   ✓ Check .env for correct credentials"
echo ""

echo "2. CREATE DATABASE (if needed)"
echo "   Run this in MySQL:"
echo "   ---"
echo "   CREATE DATABASE offensive_security CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "   ---"
echo ""

echo "3. RUN DATABASE MIGRATIONS"
echo "   Running: pnpm db:push"
pnpm db:push
echo "   ✓ Migrations complete"
echo ""

echo "4. CREATE ADMIN USER"
echo "   Running initial setup..."
echo ""
echo "   Add this to your MySQL database:"
echo "   ---"
echo "   INSERT INTO users (username, passwordHash, name, email, role, loginMethod, createdAt, updatedAt, lastSignedIn)"
echo "   VALUES ('admin', '\$2b\$10\$rKYq18K4Ic3Dj40mqgTGl..PkL1ouI3GVG40Dds4./Ml5kQLtX7ku', 'Administrator', 'admin@localhost', 'admin', 'local', NOW(), NOW(), NOW());"
echo "   ---"
echo ""
echo "   Or connect via MySQL and run:"
echo "   mysql> USE offensive_security;"
echo "   mysql> INSERT INTO users (...) VALUES (...);"
echo ""

echo "5. START SERVER"
echo "   Run: pnpm dev"
echo "   Then visit: http://localhost:3000/login"
echo "   Credentials: admin / admin"
echo ""

echo "========================================"
echo "Setup Guide Complete!"
echo "========================================"
echo ""
echo "Next Steps:"
echo "1. Update .env with your actual MySQL credentials"
echo "2. Create the MySQL database"
echo "3. Run migrations: pnpm db:push"
echo "4. Create admin user in database (see step 4 above)"
echo "5. Start server: pnpm dev"
echo "6. Login at http://localhost:3000/login"
echo ""
echo "For detailed instructions, see SECURITY_SETUP.md"
