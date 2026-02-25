# Proposal Approval Workflow & Architectural Guide

This document explains the core logic, sequential flow, and database relationships governing the Research Management System's proposal lifecycle.

## 🏛️ 1. The Core Architecture: "Step-Gate" Logic

The system uses a **Step-Gate** approach to ensure that research proposals move through a predictable path. Every action is recorded in the `proposal_approvals` table, which serves as the "Digital Passport" for each proposal.

### Key Data Pillars:
- **`step_order`**: An integer (1, 2, 3...) that defines the absolute sequence.
- **`approver_role`**: Specifies which role (e.g., `DGC_MEMBER`, `PG_OFFICE`) is authorized for that specific step.
- **`is_parallel`**: Allows multiple reviewers (like Evaluators) to work simultaneously without blocking each other.
- **`attachment_file_id`**: Links evaluation feedback or required approval forms directly to the approval decision.

---

## 🚀 2. The Official Flows

### A. Postgraduate (PG) Flow
The most complex hierarchy, involving 4 distinct gates:
1.  **Department Initial Review**: DGC checks the proposal, formally assigns the Advisor (if requested or missing), and assigns Peer Evaluators.
2.  **Peer Evaluators**: Detailed technical review (Parallel step). The peer evaluators conduct the technical evaluation on behalf of the department and attach feedback forms.
3.  **College Office**: Institutional administrative check / College Representative sign-off.
4.  **SGS Dean (PG Office)**: Final legal/compliance approval.

### B. Undergraduate (UG) Flow
A streamlined path focused on quality and integrity:
1.  **Coordinator Screening**: Single gate. The coordinator checks for plagiarism and technical feasibility, assigns the advisor, and gives Final Approval.

### C. Funded Projects
1.  **RAD Pre-screening**: Administrative validity.
2.  **Finance Review**: Budget integrity and funding availability.
3.  **VP Research**: High-level authorization (Final Approval).

### D. Unfunded Projects
1.  **RAD Final Approval**: Single step authorization from Research Administration.

---

## 🔍 3. Implementation Logic (The "Brain")

### I. The "My Tasks" Query (Turn-Based Check)
To prevent the SGS Dean from seeing a proposal before the Department has approved it, the backend uses a **Sequential Check** in its SQL query:

**The Filter Logic:**
```sql
SELECT * FROM proposal_approvals 
WHERE approver_role = 'PG_OFFICE' 
  AND decision = 'Pending'
  AND NOT EXISTS (
    SELECT 1 FROM proposal_approvals prev
    WHERE prev.proposal_id = proposal_approvals.proposal_id
      AND prev.step_order < proposal_approvals.step_order
      AND prev.decision != 'Accepted'
  );
```
*Effect: Approvers only see proposals when it is actually their turn.*

### II. The Decision Trigger (`submitDecision`)
When an approver hits "Accept," the system executes an atomic transaction that:
1.  **Validates Role**: Confirms the user actually has the required role.
2.  **Checks Sequence**: Verifies no previous steps were skipped.
3.  **Propagates Status**: 
    - If `Accepted` AND it's the **Final Step** → Marks Proposal as `Approved`.
    - If `Accepted` but more steps remain → Keeps Proposal as `Under_Review`.
    - If `Rejected` → Immediately halts the workflow and marks Proposal as `Rejected`.

---

## 🔓 4. Activation Phase (Post-Approval)

Once the **Final Step** is marked as `Accepted`, the system triggers two automatic side-effects:

### 1. Workspace Unlocking
- The `proposals.workspace_unlocked` flag is set to `true`.
- **Result**: The researcher's frontend reveals the Tiptap Editor and Task Management modules, allowing them to begin their actual research work.

### 2. Finance Initialization
Based on the `degree_level`, the system auto-populates `budget_installments`:
- **Masters / UG**: Generates a single installment for **100%** of requested funds.
- **PhD**: Generates the **1st installment (30%)** automatically. Subsequent funds (40%, 30%) require Milestone Verification by the DGC.

---

## 📜 5. Compliance & Auditing

Every decision (Accept/Reject/Revision) is logged in the `audit_logs` table with:
- `actor_user_id`: Who made the decision.
- `metadata`: The specific step order, decision timestamp, and any comments provided.

This ensures a 100% transparent history for every research project within the system.
