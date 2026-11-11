-- Rollback de 0011_shift_demo_activity.sql
DROP FUNCTION IF EXISTS public.shift_demo_activity_dates(uuid, integer, boolean);
DROP TABLE IF EXISTS public.demo_activity_shift_log;
