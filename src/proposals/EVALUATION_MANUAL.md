# AI Logic Manual: Proposal & Project Continuous Evaluation Flow

## 🌟 Architecture Overview

The Evaluation Module is designed to sustain a continuous grading ecosystem that persists from a student's initial **Proposal Review** all the way to their final **Project Defence**. It bridges multiple stages through unified rubric structures.

### 📋 Database Tables (`src/db/schema/evaluation.ts`)

1. **`evaluation_rubrics` (Static Configuration)**
   Stores the static rulebook (the 100 pt total cap).
   - **`name`**: e.g., 'Proposal Defence', 'Advisor', 'Defence — Group'.
   - **`phase`**: Enum `['PROPOSAL', 'PROJECT']` -> Crucial for determining IF this score is granted before or after the Master approval.
   - **`type`**: Enum `['continuous', 'final']` -> Differentiates between continuous tracking and final submission caps.
   - **`maxPoints`**: The maximum cap value (e.g., `15.00`).

2. **`evaluation_scores` (The Dynamic Results)**
   Stores the points pushed by the evaluators.
   - **`proposalId`**: Always present. The origin of the evaluation.
   - **`projectId`**: `UUID | Null`. Left fully `null` during the `PROPOSAL` phase. Once the master approves and generates the project, backend logic will pass the generated `projectId` to future scores!
   - **`studentId`**: The user receiving the score.
   - **`evaluatorId`**: The professor/advisor pushing the score.
   - **`score`**: The actual awarded numeric score.
   - **Unique Index constraint**: An evaluator can only grade a specific student on a specific rubric inside a proposal ONCE. (Subsequent submissions act as updates).

### 🛠️ API Design (`src/proposals/proposals.controller.ts`)

#### 1. `GET /proposals/:id/evaluations`
**Purpose**: Fetch the entire grading sheet for a proposal/project to populate the UI.
- Generates a nested JSON response grouping all assigned `rubrics` with their given `awardedScores`.
- Matches the UI structure of:
```json
{
  "proposalId": "uuid",
  "rubrics": [
    {
      "id": "rubric-uuid",
      "name": "Advisor",
      "phase": "PROPOSAL",
      "maxPoints": 20,
      "awardedScores": [ { "score": 19, "studentId": "...", "evaluatorId": "..." } ]
    }
  ]
}
```

#### 2. `POST /proposals/:id/evaluations`
**Purpose**: The actual endpoint for an Evaluator or Advisor to push a score.
- Uses `SubmitEvaluationScoreDto`.
- Expects `rubricId`, `studentId`, `score`, and optionally `feedback` and `projectId`.
- Employs Postgres `ON CONFLICT DO UPDATE` (Upsert): If the evaluator resubmits a score for the same student, instead of throwing an error or duplicating rows, it cleanly overwrites the previous score and bumps the `updatedAt` timestamp.

## 🤝 Project vs Proposal Context

**Important AI Instruction**: When rendering or posting evaluation scores during the UI's final `Defence` phase, ensure you grab the `projectId` from the previously approved proposal data and pass it into the `POST /proposals/:id/evaluations` DTO under the `projectId` field. This ensures complete database relation trace-ability.
