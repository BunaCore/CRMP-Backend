DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspaces_project_id_unique'
  ) THEN
    ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_project_id_unique" UNIQUE("project_id");
  END IF;
END $$;