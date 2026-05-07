-- Down migration for 0014_job_queue_dead_lettered_at.sql
DROP FUNCTION IF EXISTS fn_pickup_jobs(text, int);
ALTER TABLE job_queue DROP COLUMN IF EXISTS dead_lettered_at;
