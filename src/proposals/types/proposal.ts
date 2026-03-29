/**
 * Result of user → proposal role resolution
 * Determines if a user can approve a specific proposal
 */
export interface ApproverResolution {
  canApprove: boolean;
  reason?: string; // If canApprove is false, explain why
}
