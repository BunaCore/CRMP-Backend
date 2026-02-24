-- ============================================================
-- CRMP – Core Schema  (Proposal + Approval + Budget + RBAC)
-- ============================================================
-- WHAT'S IN THIS FILE (in order):
--   0.  ENUMs
--   1.  users
--   2.  user_roles          ← who has what role (no department)
--   3.  projects            ← activated project (post-approval)
--   4.  project_members
--   5.  routing_rules       ← which roles approve each track, in what order
--   6.  proposals
--   7.  proposal_files
--   8.  proposal_versions
--   9.  proposal_approvals
--   10. evaluator_assignments
--   11. proposal_status_history
--   12. proposal_comments   ← threaded; comment_attachments live in main-project schema
--   13. budget_requests
--   14. budget_request_items
--   15. budget_installments
--   16. budget_ledger
--   17. verification_uploads
--   18. notifications
--   19. audit_logs
-- ============================================================


-- ── 0. ENUMS ────────────────────────────────────────────────

CREATE TYPE "account_status"        AS ENUM ('active', 'deactive', 'suspended');

CREATE TYPE "proposal_status"       AS ENUM (
  'Draft',
  'Submitted',
  'Under_Review',
  'Partially_Approved',
  'Approved',
  'Rejected',
  'Needs_Revision',
  'Cancelled'
);

CREATE TYPE "approval_decision"     AS ENUM (
  'Pending',
  'Accepted',
  'Rejected',
  'Needs_Revision'
);

-- The three submission tracks. Each track has its own approval chain.
CREATE TYPE "proposal_type"         AS ENUM (
  'Undergraduate',    -- final approver: COORDINATOR
  'Postgraduate',     -- final approver: PG_OFFICE  (Masters or PhD)
  'Funded_Project',   -- final approver: VPRTT
  'Unfunded_Project'  -- final approver: RAD
);

CREATE TYPE "degree_level"          AS ENUM ('Master', 'PhD', 'NA');  -- used only for Postgraduate

CREATE TYPE "fund_release_status"   AS ENUM ('Pending', 'Released', 'Cancelled');

CREATE TYPE "installment_trigger"   AS ENUM ('Auto', 'Manual');  -- Auto = released on final approval; Manual = Finance releases manually

CREATE TYPE "notification_type"     AS ENUM (
  'Submission',
  'Assigned',
  'Decision',
  'Comment',
  'Revision_Required',
  'Budget_Released',
  'Workspace_Unlocked'
);

CREATE TYPE "audit_action"          AS ENUM (
  'CREATED',
  'STATUS_CHANGED',
  'DECISION_MADE',
  'BUDGET_RELEASED',
  'WORKSPACE_UNLOCKED',
  'EVALUATOR_ASSIGNED'
);

-- Existing project enums (kept for backward compat)
CREATE TYPE "project_type"          AS ENUM ('Funded', 'Non-Funded', 'Undergraduate');
CREATE TYPE "project_stage"         AS ENUM ('Submitted', 'Under Review', 'Approved', 'Rejected', 'Completed');
CREATE TYPE "ethical_clearance_status" AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE "project_role"          AS ENUM ('MEMBER', 'PI', 'SUPERVISOR', 'EVALUATOR');
CREATE TYPE "project_program"       AS ENUM ('UG', 'PG', 'GENERAL');


-- ── 1. USERS ────────────────────────────────────────────────

CREATE TABLE "users" (
  "id"             uuid         PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "full_name"      text,
  "email"          text         NOT NULL,
  "password_hash"  text         NOT NULL,
  "department"     text,
  "phone_number"   text,
  "university"     text,
  "university_id"  text,
  "is_external"    boolean      DEFAULT false,  -- external researchers need verification
  "account_status" "account_status" DEFAULT 'deactive' NOT NULL,
  "created_at"     timestamptz  DEFAULT now(),
  CONSTRAINT "users_email_unique" UNIQUE ("email")
);


-- ── 2. USER ROLES ───────────────────────────────────────────
-- Simple table: maps a user to one or more named roles.
-- No departments. A role is just a label that controls what a user can see and do.
--
-- Available roles:
--   RESEARCHER      – submits proposals (any track)
--   ADMIN           – manages users, routing rules, system config
--   ADVISOR         – guides a researcher; approves in UG and PG tracks
--   DGC_MEMBER      – Directorate of Graduate Studies; approves & assigns evaluators (PG)
--   EVALUATOR       – peer reviewer assigned by DGC
--   COORDINATOR     – UG track screener; FINAL approver for Undergraduate
--   COLLEGE_REP     – college-level sign-off in PG chain
--   PG_OFFICE       – School of Graduate Studies dean; FINAL approver for Postgraduate
--   RAD             – Research Administration; FINAL approver for Unfunded projects
--   FINANCE         – approves budgets and releases funds
--   VPRTT           – VP Research Teaching & Training; FINAL approver for Funded projects
--   AC              – Academic Council; optional extra step in Funded track
--
-- A user can hold multiple roles (e.g. someone who is both ADVISOR and EVALUATOR).

CREATE TABLE "user_roles" (
  "id"        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"   uuid        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_name" varchar(50) NOT NULL,  -- one of the roles listed above
  "granted_at" timestamptz DEFAULT now(),
  "granted_by" uuid        REFERENCES "users"("id"),  -- ADMIN who assigned this role
  CONSTRAINT "uq_user_role" UNIQUE ("user_id", "role_name")
);
CREATE INDEX "idx_ur_user"      ON "user_roles" ("user_id");
CREATE INDEX "idx_ur_role_name" ON "user_roles" ("role_name");


-- ── 3. PROJECTS ─────────────────────────────────────────────
-- This is the ACTIVATED project record, created only after a proposal is fully approved.
-- Progress reports, milestones, and comment attachments all belong to this entity
-- and are defined in the main-project schema file (not here).

CREATE TABLE "projects" (
  "project_id"               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_title"            text        NOT NULL,
  "project_type"             "project_type"  NOT NULL,
  "project_stage"            "project_stage" NOT NULL,
  "project_description"      text,
  "submission_date"          date        NOT NULL,
  "proposal_file"            text,
  "research_area"            text,
  "project_program"          "project_program",
  "duration_months"          integer     NOT NULL,
  "pi_id"                    uuid        NOT NULL,       -- Principal Investigator (user_id)
  "ethical_clearance_status" "ethical_clearance_status" NOT NULL,
  "created_at"               timestamptz DEFAULT now()
  -- NOTE: progress_reports, milestones, comment_attachments → defined in main-project schema
);


-- ── 4. PROJECT MEMBERS ──────────────────────────────────────

CREATE TABLE "project_members" (
  "project_id" uuid          NOT NULL REFERENCES "projects"("project_id"),
  "user_id"    uuid          NOT NULL,
  "role"       "project_role",
  PRIMARY KEY ("project_id", "user_id")
);


-- ── 5. ROUTING RULES ────────────────────────────────────────
-- ┌─────────────────────────────────────────────────────────────┐
-- │  WHAT IS THIS TABLE?                                        │
-- │                                                             │
-- │  It is a simple list that answers:                          │
-- │  "When a proposal of TYPE X is submitted,                   │
-- │   which roles must approve it, and in what order?"          │
-- │                                                             │
-- │  Each row = one approval step for one proposal type.        │
-- │  step_order 1 goes first, step_order 2 goes second, etc.    │
-- │                                                             │
-- │  Default chains (admin can change these):                   │
-- │                                                             │
-- │  Undergraduate:                                             │
-- │    1. COORDINATOR  ← screens for plagiarism → FINAL         │
-- │                                                             │
-- │  Postgraduate (Master / PhD):                               │
-- │    1. ADVISOR      ← accepts to guide                       │
-- │    2. DGC_MEMBER   ← initial check                          │
-- │    3. EVALUATOR    ← peer review (parallel, 2+ reviewers)   │
-- │    4. DGC_MEMBER   ← final DGC sign-off                     │
-- │    5. COLLEGE_REP  ← college approval                       │
-- │    6. PG_OFFICE    ← SGS Dean → FINAL                       │
-- │                                                             │
-- │  Funded_Project:                                            │
-- │    1. RAD          ← pre-screen                             │
-- │    2. FINANCE      ← budget review                          │
-- │    3. VPRTT        ← VP approval → FINAL                    │
-- │    4. AC           ← optional Academic Council              │
-- │                                                             │
-- │  Unfunded_Project:                                          │
-- │    1. RAD          ← FINAL                                  │
-- │                                                             │
-- │  At proposal submission the system reads this table and     │
-- │  creates one proposal_approvals row per matching rule row.  │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE "routing_rules" (
  "id"            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_type" "proposal_type" NOT NULL,   -- which track this rule belongs to
  "step_order"    integer       NOT NULL,      -- 1 = first to approve, 2 = second, etc.
  "approver_role" varchar(50)   NOT NULL,      -- role_name that must approve at this step
  "step_label"    varchar(100),                -- human-readable label, e.g. "DGC Initial Review"
  "is_parallel"   boolean       DEFAULT false, -- true = multiple users with this role all approve simultaneously
  "is_final"      boolean       DEFAULT false, -- true = approving this step triggers workspace unlock
  "required"      boolean       DEFAULT true   -- false = step can be skipped by admin
);
CREATE INDEX "idx_rr_type" ON "routing_rules" ("proposal_type", "step_order");

-- ── Seed data: default routing rules ──
INSERT INTO "routing_rules" ("proposal_type", "step_order", "approver_role", "step_label", "is_parallel", "is_final", "required") VALUES
  -- Undergraduate (1 step, coordinator is final)
  ('Undergraduate', 1, 'COORDINATOR', 'Coordinator Screening',         false, true,  true),

  -- Postgraduate (6 steps, PG_OFFICE is final)
  ('Postgraduate',  1, 'ADVISOR',     'Advisor Acceptance',            false, false, true),
  ('Postgraduate',  2, 'DGC_MEMBER',  'DGC Initial Review',            false, false, true),
  ('Postgraduate',  3, 'EVALUATOR',   'Peer Evaluation (parallel)',     true,  false, true),
  ('Postgraduate',  4, 'DGC_MEMBER',  'DGC Final Sign-off',            false, false, true),
  ('Postgraduate',  5, 'COLLEGE_REP', 'College Approval',              false, false, true),
  ('Postgraduate',  6, 'PG_OFFICE',   'SGS Dean Final Approval',       false, true,  true),

  -- Funded_Project (4 steps, VPRTT is final; AC optional)
  ('Funded_Project',  1, 'RAD',     'RAD Pre-screen',                  false, false, true),
  ('Funded_Project',  2, 'FINANCE', 'Finance Budget Review',           false, false, true),
  ('Funded_Project',  3, 'VPRTT',  'VP Research Final Approval',       false, true,  true),
  ('Funded_Project',  4, 'AC',     'Academic Council (if required)',   false, false, false),

  -- Unfunded_Project (1 step, RAD is final)
  ('Unfunded_Project', 1, 'RAD',   'RAD Approval',                    false, true,  true);


-- ── 6. PROPOSALS ────────────────────────────────────────────

CREATE TABLE "proposals" (
  "id"                    uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_by"            uuid              NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "title"                 varchar(255)      NOT NULL,
  "abstract"              text,
  "proposal_type"         "proposal_type"   NOT NULL,
  "degree_level"          "degree_level"    DEFAULT 'NA',  -- only relevant for Postgraduate
  "research_area"         varchar(255),
  "duration_months"       integer,
  "advisor_user_id"       uuid              REFERENCES "users"("id"),
  "current_status"        "proposal_status" DEFAULT 'Draft',
  "submitted_at"          timestamptz,
  "current_version_id"    uuid,             -- FK filled in after proposal_versions is created
  "project_id"            uuid              REFERENCES "projects"("project_id"),  -- set after approval
  "workspace_unlocked"    boolean           DEFAULT false,
  "workspace_unlocked_at" timestamptz,
  "created_at"            timestamptz       DEFAULT now(),
  "updated_at"            timestamptz
);
CREATE INDEX "idx_proposals_status"  ON "proposals" ("current_status");
CREATE INDEX "idx_proposals_creator" ON "proposals" ("created_by");


-- ── 7. PROPOSAL FILES ───────────────────────────────────────
-- Stores every uploaded PDF (and any other file) tied to a proposal.
-- Shared by proposal_versions, proposal_comments, and verification_uploads.

CREATE TABLE "proposal_files" (
  "id"          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id" uuid         NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "uploaded_by" uuid         REFERENCES "users"("id"),
  "file_name"   varchar(255) NOT NULL,
  "file_path"   varchar(500) NOT NULL,   -- S3 key or filesystem path
  "file_type"   varchar(50),
  "checksum"    varchar(64),
  "file_size"   bigint,
  "created_at"  timestamptz  DEFAULT now()
);
CREATE INDEX "idx_pf_proposal" ON "proposal_files" ("proposal_id");


-- ── 8. PROPOSAL VERSIONS ────────────────────────────────────
-- Every resubmission = a new version row.
-- Reviewer decisions are linked to a version so history stays accurate.
-- Only one version per proposal can be is_current = true (enforced by partial unique index).

CREATE TABLE "proposal_versions" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id"    uuid        NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "created_by"     uuid        REFERENCES "users"("id"),
  "version_number" integer     NOT NULL DEFAULT 1,
  "is_current"     boolean     DEFAULT false,
  "file_id"        uuid        REFERENCES "proposal_files"("id"),
  "content_json"   jsonb,       -- optional Tiptap rich-editor state
  "change_summary" text,        -- e.g. "Addressed evaluator comments on methodology"
  "created_at"     timestamptz DEFAULT now()
);
CREATE INDEX "idx_pv_proposal"   ON "proposal_versions" ("proposal_id");
CREATE UNIQUE INDEX "idx_pv_one_current" ON "proposal_versions" ("proposal_id") WHERE "is_current" = true;

-- Now safe to add FK from proposals → proposal_versions
ALTER TABLE "proposals"
  ADD CONSTRAINT "fk_proposals_current_version"
  FOREIGN KEY ("current_version_id") REFERENCES "proposal_versions"("id");


-- ── 9. PROPOSAL APPROVALS ───────────────────────────────────
-- Created automatically at submission time by reading routing_rules.
-- One row per (proposal, step_order, approver).
-- This is the full audit trail: who decided, when, on which version, with what comment.

CREATE TABLE "proposal_approvals" (
  "id"               uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id"      uuid               NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "routing_rule_id"  uuid               REFERENCES "routing_rules"("id"),  -- which rule generated this row
  "step_order"       integer            NOT NULL,
  "approver_role"    varchar(50)        NOT NULL,
  "approver_user_id" uuid               REFERENCES "users"("id"),   -- NULL until a user with this role is assigned
  "decision"         "approval_decision" DEFAULT 'Pending',
  "comment"          text,
  "decision_at"      timestamptz,
  "notified_at"      timestamptz,
  "version_id"       uuid               REFERENCES "proposal_versions"("id"),  -- which version was reviewed
  "created_at"       timestamptz        DEFAULT now()
);
CREATE INDEX "idx_pa_proposal" ON "proposal_approvals" ("proposal_id");
CREATE INDEX "idx_pa_approver" ON "proposal_approvals" ("approver_user_id");
CREATE INDEX "idx_pa_step"     ON "proposal_approvals" ("proposal_id", "step_order");


-- ── 10. EVALUATOR ASSIGNMENTS ───────────────────────────────
-- DGC members explicitly assign evaluators for the parallel peer-review step.
-- Separate from proposal_approvals so we can track: who assigned whom, and when.

CREATE TABLE "evaluator_assignments" (
  "id"                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id"          uuid        NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "evaluator_user_id"    uuid        NOT NULL REFERENCES "users"("id"),
  "assigned_by"          uuid        NOT NULL REFERENCES "users"("id"),  -- the DGC member
  "proposal_approval_id" uuid        REFERENCES "proposal_approvals"("id"),  -- the approval row this maps to
  "assigned_at"          timestamptz DEFAULT now(),
  "due_date"             date
);
CREATE INDEX "idx_ea_proposal" ON "evaluator_assignments" ("proposal_id");


-- ── 11. PROPOSAL STATUS HISTORY ─────────────────────────────
-- Append-only log of every status change. Never updated, only inserted.

CREATE TABLE "proposal_status_history" (
  "id"          uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id" uuid               NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "old_status"  "proposal_status",
  "new_status"  "proposal_status"  NOT NULL,
  "changed_by"  uuid               REFERENCES "users"("id"),
  "note"        text,
  "changed_at"  timestamptz        DEFAULT now()
);
CREATE INDEX "idx_psh_proposal" ON "proposal_status_history" ("proposal_id");


-- ── 12. PROPOSAL COMMENTS ───────────────────────────────────
-- Threaded discussion on a proposal. Optionally anchored to a specific version or file.
-- parent_comment_id = NULL → root-level comment; NOT NULL → reply.
--
-- NOTE: comment_attachments (files attached to comments) belong to the
--       main-project schema and are defined there. A placeholder FK from
--       that schema will reference proposal_comments.id.

CREATE TABLE "proposal_comments" (
  "id"                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id"       uuid        NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "version_id"        uuid        REFERENCES "proposal_versions"("id"),  -- comment on a specific version
  "file_id"           uuid        REFERENCES "proposal_files"("id"),     -- comment on a specific file
  "author_id"         uuid        NOT NULL REFERENCES "users"("id"),
  "parent_comment_id" uuid        REFERENCES "proposal_comments"("id"), -- NULL = root comment
  "comment_text"      text        NOT NULL,
  "anchor_data"       jsonb,       -- optional: page number / highlight position
  "is_resolved"       boolean     DEFAULT false,
  "created_at"        timestamptz DEFAULT now()
  -- comment_attachments → defined in main-project schema, FK → this table's id
);
CREATE INDEX "idx_pc_proposal" ON "proposal_comments" ("proposal_id");
CREATE INDEX "idx_pc_version"  ON "proposal_comments" ("version_id");


-- ── 13. BUDGET REQUESTS ─────────────────────────────────────
-- One budget request per proposal (and optionally linked to the resulting project).
-- Stores a simple list of what the researcher is asking money for.
-- Finance approves the total; installments handle how it is released.

CREATE TABLE "budget_requests" (
  "id"                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id"         uuid          REFERENCES "proposals"("id") ON DELETE SET NULL,
  "project_id"          uuid          REFERENCES "projects"("project_id"),  -- set after project activation
  "requested_by"        uuid          REFERENCES "users"("id"),
  "total_amount"        numeric(15,2),             -- sum of all items (updated on item save)
  "approved_amount"     numeric(15,2),             -- set by FINANCE role
  "finance_approved_by" uuid          REFERENCES "users"("id"),
  "finance_approved_at" timestamptz,
  "created_at"          timestamptz   DEFAULT now()
);
CREATE INDEX "idx_br_proposal" ON "budget_requests" ("proposal_id");


-- ── 14. BUDGET REQUEST ITEMS ────────────────────────────────
-- Line items inside a budget request.
-- Keep it simple: just description + amount.
-- Example:
--   1 | "Field travel (3 trips)"  | 100.00
--   2 | "Lab consumables"         | 250.00
--   3 | "Publication fees"        |  50.00
--   Total (budget_requests.total_amount) = 400.00

CREATE TABLE "budget_request_items" (
  "id"                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_request_id" uuid          NOT NULL REFERENCES "budget_requests"("id") ON DELETE CASCADE,
  "line_index"        integer       DEFAULT 1,
  "description"       varchar(255)  NOT NULL,
  "requested_amount"  numeric(15,2) NOT NULL
);
CREATE INDEX "idx_bri_budget" ON "budget_request_items" ("budget_request_id");


-- ── 15. BUDGET INSTALLMENTS ─────────────────────────────────
-- Controls HOW the approved budget is released.
--   Master / UG / Funded  → 1 installment row, trigger=Auto (released on final approval)
--   PhD                   → multiple rows, trigger=Manual (Finance releases each one)
-- Finance sets release_status = 'Released' and records a budget_ledger entry.

CREATE TABLE "budget_installments" (
  "id"                 uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_request_id"  uuid                  NOT NULL REFERENCES "budget_requests"("id") ON DELETE CASCADE,
  "installment_number" integer               NOT NULL,
  "amount"             numeric(15,2)         NOT NULL,
  "percentage"         numeric(5,2),          -- e.g. 100.00 for Master, 30.00 / 40.00 / 30.00 for PhD
  "trigger_type"       "installment_trigger"  DEFAULT 'Auto',
  "release_status"     "fund_release_status"  DEFAULT 'Pending',
  "released_at"        timestamptz,
  "released_by"        uuid                   REFERENCES "users"("id"),   -- FINANCE user who clicked release
  "ledger_entry_id"    uuid                   -- FK added after budget_ledger is created below
);
CREATE INDEX "idx_bi_budget" ON "budget_installments" ("budget_request_id");


-- ── 16. BUDGET LEDGER ───────────────────────────────────────
-- Finance accounting record. Every actual fund release creates one row here.
-- Referenced by budget_installments.ledger_entry_id.

CREATE TABLE "budget_ledger" (
  "id"                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_request_id" uuid          NOT NULL REFERENCES "budget_requests"("id"),
  "installment_id"    uuid          REFERENCES "budget_installments"("id"),
  "amount_released"   numeric(15,2) NOT NULL,
  "release_date"      timestamptz   DEFAULT now(),
  "released_by"       uuid          REFERENCES "users"("id"),
  "note"              text
);
CREATE INDEX "idx_bl_budget" ON "budget_ledger" ("budget_request_id");

-- Now safe to close the FK loop
ALTER TABLE "budget_installments"
  ADD CONSTRAINT "fk_bi_ledger_entry"
  FOREIGN KEY ("ledger_entry_id") REFERENCES "budget_ledger"("id");


-- ── 17. VERIFICATION UPLOADS ────────────────────────────────
-- External researchers must upload credentials before they can submit proposals.
-- An ADMIN reviews and either approves or rejects the upload.

CREATE TABLE "verification_uploads" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"             uuid        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "file_id"             uuid        NOT NULL REFERENCES "proposal_files"("id"),
  "verification_status" varchar(20) DEFAULT 'Pending',  -- Pending | Approved | Rejected
  "reviewed_by"         uuid        REFERENCES "users"("id"),
  "reviewed_at"         timestamptz,
  "note"                text
);
CREATE INDEX "idx_vu_user" ON "verification_uploads" ("user_id");


-- ── 18. NOTIFICATIONS ───────────────────────────────────────
-- One row per event that a user needs to see (bell icon / email trigger).

CREATE TABLE "notifications" (
  "id"                uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipient_user_id" uuid                NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sender_user_id"    uuid                REFERENCES "users"("id"),
  "type"              "notification_type" NOT NULL,
  "title"             varchar(255),
  "body"              text,
  "proposal_id"       uuid                REFERENCES "proposals"("id"),
  "project_id"        uuid                REFERENCES "projects"("project_id"),
  "is_read"           boolean             DEFAULT false,
  "created_at"        timestamptz         DEFAULT now()
);
CREATE INDEX "idx_notif_recipient" ON "notifications" ("recipient_user_id", "is_read");


-- ── 19. AUDIT LOGS ──────────────────────────────────────────
-- Append-only server-side compliance log. Every significant action writes here.

CREATE TABLE "audit_logs" (
  "id"            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" uuid          REFERENCES "users"("id"),
  "action"        "audit_action" NOT NULL,
  "entity_type"   varchar(50)   NOT NULL,   -- e.g. 'proposals', 'proposal_approvals'
  "entity_id"     uuid,
  "metadata"      jsonb,                     -- snapshot of relevant fields at time of action
  "ip_address"    inet,
  "created_at"    timestamptz   DEFAULT now()
);
CREATE INDEX "idx_al_actor"  ON "audit_logs" ("actor_user_id");
CREATE INDEX "idx_al_entity" ON "audit_logs" ("entity_type", "entity_id");