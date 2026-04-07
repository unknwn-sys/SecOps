-- Offensive Security Portal - Database Initialization SQL
-- Run this after migrations are complete

-- Create database (if not already created)
-- Run this separately first:
-- CREATE DATABASE offensive_security CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Make sure we're using the correct database
USE offensive_security;

-- Check if admin user exists
SELECT 'Admin user status:' as 'Info';
SELECT COUNT(*) as 'Existing admin users' FROM users WHERE username = 'admin';

-- Create admin user (if not exists)
-- Password: admin
-- Hash: $2b$10$rKYq18K4Ic3Dj40mqgTGl..PkL1ouI3GVG40Dds4./Ml5kQLtX7ku
INSERT IGNORE INTO users (
  id,
  username,
  passwordHash,
  name,
  email,
  role,
  loginMethod,
  createdAt,
  updatedAt,
  lastSignedIn
) VALUES (
  1,
  'admin',
  '$2b$10$rKYq18K4Ic3Dj40mqgTGl..PkL1ouI3GVG40Dds4./Ml5kQLtX7ku',
  'Administrator',
  'admin@localhost',
  'admin',
  'local',
  NOW(),
  NOW(),
  NOW()
);

-- Verify setup
SELECT '---' as 'Verification';
SELECT 'Admin user:' as 'Type', COUNT(*) as 'Count' FROM users WHERE role = 'admin' AND username = 'admin';

-- Show admin user details (without password)
SELECT 'User Details:' as 'Type';
SELECT id, username, name, email, role, loginMethod, createdAt, lastSignedIn 
FROM users 
WHERE username = 'admin' 
LIMIT 1;

-- Check tables
SELECT '---' as 'Setup';
SELECT 'Total tables:' as 'Type', COUNT(*) as 'Count' FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'offensive_security';

-- Summary
SELECT '✓ Setup Complete!' as 'Status';
