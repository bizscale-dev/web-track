-- Clears out test/demo data from task_revisions.
-- Run this in the Supabase SQL editor.

truncate table task_revisions restart identity;

-- Optional: the revision_count on assigned_tasks won't reset on its own
-- since it's a separate counter column, not derived from this table.
-- Uncomment below if you also want those counts back to 0.
-- update assigned_tasks set revision_count = 0 where revision_count <> 0;
