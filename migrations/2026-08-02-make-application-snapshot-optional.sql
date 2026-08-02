-- Allow a job application to enter the pipeline before a resume snapshot is selected.
-- This migration intentionally adds no foreign keys.

ALTER TABLE job_applications
    ALTER COLUMN snapshot_version_id DROP NOT NULL;
