ALTER TABLE review_instructions
ADD COLUMN review_scope TEXT NOT NULL DEFAULT 'pr'
CHECK (review_scope IN ('pr', 'repository'));
