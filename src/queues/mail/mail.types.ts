/**
 * Mail job payload types for BullMQ
 */

/**
 * Payload for welcome email job
 */
export interface WelcomeEmailJobData {
  userId: string;
  email: string;
  fullName?: string;
}

/**
 * Payload for proposal status notification email job
 */
export interface ProposalStatusEmailJobData {
  userId: string;
  email: string;
  proposalTitle: string;
  proposalId: string;
  newStatus: string;
}

/**
 * Payload for defense scheduled notification email job
 */
export interface DefenseScheduledEmailJobData {
  userId: string;
  email: string;
  proposalTitle: string;
  defenseDate: Date;
  location?: string;
}

/**
 * Payload for password reset email job
 */
export interface PasswordResetEmailJobData {
  userId: string;
  email: string;
  resetToken: string;
  resetLink: string;
}

/**
 * Payload for invitation onboarding email job
 */
export interface InvitationEmailJobData {
  email: string;
  invitationLink: string;
  roleName: string;
  invitedByName: string;
  expiresAt: Date;
}
