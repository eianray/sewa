-- Add pipe_type column to network_pipes
-- Values: 'gravity' (default) | 'force_main'
ALTER TABLE network_pipes
  ADD COLUMN IF NOT EXISTS pipe_type text NOT NULL DEFAULT 'gravity'
  CHECK (pipe_type IN ('gravity', 'force_main'));
