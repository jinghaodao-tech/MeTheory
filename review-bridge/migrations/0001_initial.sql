CREATE TABLE IF NOT EXISTS review_instructions (
  id TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail')),
  objective TEXT NOT NULL,
  blocking_issues_json TEXT NOT NULL DEFAULT '[]',
  suggestions_json TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  constraints_json TEXT NOT NULL DEFAULT '[]',
  review_cycle INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'completed', 'failed', 'stale')),
  fingerprint TEXT NOT NULL,
  claimed_at TEXT,
  completed_at TEXT,
  failure_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(repository, pr_number, head_sha, review_cycle),
  UNIQUE(fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_review_instructions_pending
ON review_instructions(repository, pr_number, status, created_at DESC);
