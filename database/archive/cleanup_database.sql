-- ========================================================
-- OUTPLEX CLEANUP & SEED SCRIPT
-- ========================================================
-- This script wipes all application data and ensures 
-- the 6 test profiles are correctly set up.
-- ========================================================

-- 1. CLEANUP: Delete all data from transactional tables
TRUNCATE public.store_orders CASCADE;
TRUNCATE public.raffle_entries CASCADE;
TRUNCATE public.ot_slots CASCADE;
TRUNCATE public.ot_batches CASCADE;
TRUNCATE public.notifications CASCADE;
TRUNCATE public.broadcast_notifications CASCADE;
TRUNCATE public.company_announcements CASCADE;
TRUNCATE public.support_tickets CASCADE;
TRUNCATE public.points_ledger CASCADE;

-- 2. CLEANUP: Delete all users except admins (if you want to keep them)
-- Or just wipe everything for a true "0" start:
-- DELETE FROM auth.users; 

-- 3. RESET POINTS: Set everyone's points to 0
UPDATE public.users SET points = 0;

-- 4. ENSURE TEST PROFILES (SQL version for public.users)
-- This updates the existing users you already have in the database.

UPDATE public.users SET role = 'admin', name = 'Admin Test', points = 0 WHERE email = 'AdminTest@Outplex.com';
UPDATE public.users SET role = 'moderator', name = 'Moderador A1', points = 0 WHERE email = 'ModeradorA1@Outplex.com';
UPDATE public.users SET role = 'moderator', name = 'Moderador B1', points = 0 WHERE email = 'ModeradorB1@Outplex.com';
UPDATE public.users SET role = 'employee', name = 'Empleado 001', points = 0 WHERE email = 'Empleado001@Outplex.com';
UPDATE public.users SET role = 'employee', name = 'Empleado 002', points = 0 WHERE email = 'Empleado002@Outplex.com';
UPDATE public.users SET role = 'employee', name = 'Empleado 003', points = 0 WHERE email = 'Empleado003@Outplex.com';

-- ========================================================
-- INSTRUCTIONS FOR VERCEL DOMAIN
-- ========================================================
-- In your DNS provider (e.g. GoDaddy), set:
-- Type: A
-- Name: @
-- Value: 76.76.21.21
-- ========================================================
