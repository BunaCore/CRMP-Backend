/**
 * Evaluation context for branch conditions
 * Contains only the fields needed for workflow branching decisions
 * No full proposal object - explicit fields only
 */
export interface EvaluationContext {
  budgetAmount: number;
  degreeLevel?: string;
  proposalProgram: string;
}

/**
 * Branch condition definition
 * Evaluates to true/false to determine if a workflow step should be included
 * Example: { operator: 'gt', field: 'budgetAmount', value: 500000 }
 */
export interface BranchCondition {
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'in';
  field: keyof EvaluationContext;
  value: number | string | (number | string)[];
}
