CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view activity logs for their team"
    ON activity_logs FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = activity_logs.team_id
        AND team_members.profile_id = auth.uid()
    ));

CREATE POLICY "Users can insert activity logs for their team"
    ON activity_logs FOR INSERT
    WITH CHECK (
        profile_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = activity_logs.team_id
            AND team_members.profile_id = auth.uid()
        )
    );
