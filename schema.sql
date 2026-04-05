-- network_facilities table
CREATE TABLE IF NOT EXISTS network_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  facility_id TEXT NOT NULL,
  facility_type TEXT NOT NULL DEFAULT 'other',
  name TEXT,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  capacity_cfs NUMERIC,
  capacity_mgd NUMERIC,
  allocated_cfs NUMERIC DEFAULT 0,
  allocated_mgd NUMERIC DEFAULT 0,
  remaining_cfs NUMERIC GENERATED ALWAYS AS (COALESCE(capacity_cfs, 0) - COALESCE(allocated_cfs, 0)) STORED,
  remaining_mgd NUMERIC GENERATED ALWAYS AS (COALESCE(capacity_mgd, 0) - COALESCE(allocated_mgd, 0)) STORED,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE network_facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own facilities"
  ON network_facilities FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS facilities_project_id_idx ON network_facilities(project_id);
CREATE INDEX IF NOT EXISTS facilities_user_id_idx ON network_facilities(user_id);
