-- Fix duplicate active sessions: close all but the most recent per table.
-- This was caused by a schema drift where the 'origin' column was missing from
-- the orders table, causing loadSessions() to fail silently and always show
-- tables as free, prompting staff to re-open already-open tables.
WITH latest_sessions AS (
  SELECT DISTINCT ON (table_number) id
  FROM public.sessions
  WHERE status = 'active'
  ORDER BY table_number, started_at DESC
)
UPDATE public.sessions
SET status = 'closed', ended_at = now()
WHERE status = 'active'
  AND id NOT IN (SELECT id FROM latest_sessions);
