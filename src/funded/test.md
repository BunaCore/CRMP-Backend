# Testing the Funded Project Workflow

This guide walks you through testing the entire logically-isolated Funded Project Approval workflow via Postman. You will need to log in as different users sequentially to progress the state.

## 0. Initial Setup

1. Make sure your database is seeded with the new test users. Run:
   ```bash
   pnpm run db:seed
   ```
2. In Postman, set up a collection variable `{{baseUrl}}` pointing to `http://localhost:3000` (or your app's port).
3. We will be using the standard `POST /auth/login` endpoint to extract JWTs. You will need to pass the token as a Bearer Token for all requests.

---

## Step 1: PI Submits Proposal

**Actor:** Primary Investigator (`PI`)
**Action:** Submit the initial proposal and budget.

1. **Login:**
   * **POST** `{{baseUrl}}/auth/login`
   * **Body (JSON):** 
     ```json
     { 
       "email": "pi@crmp.edu", 
       "password": "PI@1234" 
     }
     ```
   * *Copy the `access_token`.*
2. **Submit Proposal:**
   * **POST** `{{baseUrl}}/funded/pi/submit`
   * **Auth:** Bearer Token -> *Paste PI token*
   * **Body (JSON):**
     ```json
     {
       "title": "Renewable Energy AI Analysis",
       "abstract": "Using ML to predict grid load.",
       "researchArea": "Computer Science",
       "durationMonths": 24,
       "budgetItems": [
         { "description": "Server compute", "requestedAmount": 200000 },
         { "description": "Field gear", "requestedAmount": 250000 }
       ]
     }
     ```
   * *Copy the returned `proposal.id`.*

---

## Step 2: RAD Pre-screens and Assigns Evaluators

**Actor:** RAD Director (`RAD`)
**Action:** The proposal transitions to Step 1. RAD logs in, assigns Evaluators, and approves the triage.

1. **Login:**
   * **POST** `{{baseUrl}}/auth/login`
   * **Body (JSON):** `{ "email": "rad@crmp.edu", "password": "Rad@1234" }`
   * *Copy the `access_token`.*
2. **Get Pending Queue:**
   * **GET** `{{baseUrl}}/funded/rad/pending`
   * **Auth:** Bearer Token -> *Paste RAD token*
   * *Find your proposal. Inside the response, find the matching `approval.id`. Copy it.*
3. **Assign Evaluators:**
   * **POST** `{{baseUrl}}/funded/rad/{proposal.id}/assign-evaluators`
   * **Body (JSON):**
     *(Requires obtaining the Evaluator User ID from the DB)*
     ```json
     {
       "evaluatorIds": ["<UUID_OF_EVALUATOR_FROM_DB>"]
     }
     ```
4. **Approve Triage:**
   * **POST** `{{baseUrl}}/funded/rad/{proposal.id}/review/{approval.id}`
   * **Body (JSON):**
     ```json
     {
       "decision": "Accepted",
       "comment": "Looks viable. Sending to evaluators."
     }
     ```

---

## Step 3: Peer Evaluator Reviews

**Actor:** Peer Evaluator (`EVALUATOR`)
**Action:** Proposal is now in Step 2. Evaluator accepts it.

1. **Login:**
   * **POST** `{{baseUrl}}/auth/login`
   * **Body (JSON):** `{ "email": "evaluator@crmp.edu", "password": "Eval@1234" }`
2. **Get Pending Queue:**
   * **GET** `{{baseUrl}}/funded/evaluator/pending`
   * *Find `approval.id`.*
3. **Submit Review:**
   * **POST** `{{baseUrl}}/funded/evaluator/{proposal.id}/review/{approval.id}`
   * **Body (JSON):**
     ```json
     {
       "decision": "Accepted",
       "comment": "Excellent methodology."
     }
     ```

*(If multiple evaluators were assigned, log in as each one and repeat this step. The workflow will only advance to Finance once ALL logically required parallel steps are "Accepted")*

---

## Step 4: Finance Approves Budget

**Actor:** Finance Officer (`FINANCE`)
**Action:** Proposal is in Step 3. Finance sets the official operating budget limit.

1. **Login:**
   * **POST** `{{baseUrl}}/auth/login`
   * **Body (JSON):** `{ "email": "finance@crmp.edu", "password": "Finance@1234" }`
2. **Get Pending Queue:**
   * **GET** `{{baseUrl}}/funded/approver/pending`
   * *Find `approval.id`.*
3. **Submit Approval (Locking the amount):**
   * **POST** `{{baseUrl}}/funded/approver/{proposal.id}/review/{approval.id}`
   * **Body (JSON):**
     ```json
     {
       "decision": "Accepted",
       "comment": "Approved at a slightly reduced rate.",
       "approvedAmount": 450000 
     }
     ```
   * *(Note: Because 450,000 <= 500,000, this will trigger the AC bypass logic in the next step!)*

---

## Step 5: VPRTT Final Authorization

**Actor:** VP of RTT (`VPRTT`)
**Action:** Proposal is in Step 4. Usually, this sends it to AC, but because Finance locked in $450k, the VPRTT acts as the Master Approver.

1. **Login:**
   * **POST** `{{baseUrl}}/auth/login`
   * **Body (JSON):** `{ "email": "vprtt@crmp.edu", "password": "Vprtt@1234" }`
2. **Get Pending Queue:**
   * **GET** `{{baseUrl}}/funded/approver/pending`
   * *Find `approval.id`.*
3. **Submit Final Approval:**
   * **POST** `{{baseUrl}}/funded/approver/{proposal.id}/review/{approval.id}`
   * **Body (JSON):**
     ```json
     {
       "decision": "Accepted",
       "comment": "Final sign-off granted."
     }
     ```

**Expected Result:**
The system will return:
`"message": "Project Fully Approved! Workspace Unlocked (AC Bypassed)."`

The proposal is instantly converted to a live project in the DB, and the PI's workspace is unlocked.

---

## (Optional) Testing Rejection Resets

If at **any step**, you send:
```json
{
  "decision": "Needs_Revision",
  "comment": "Please rewrite the budget."
}
```
The API will reply: `"Proposal marked as Needs_Revision. Workflow halted."`
It legally prevents any further routing steps from triggering.
