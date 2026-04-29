import { MongoAbility } from '@casl/ability';
import { and, eq, ilike, inArray, or, sql, SQL } from 'drizzle-orm';
import { DB } from 'src/db/db.type';
import * as schema from 'src/db/schema';
import { GetProposalsQueryDto } from '../dto/get-proposals-query.dto';

const VALID_STATUSES = [
  'Draft',
  'Under_Review',
  'Needs_Revision',
  'Approved',
  'Rejected',
] as const;

const VALID_PROGRAMS = ['UG', 'PG', 'GENERAL'] as const;

function memberPredicate(db: DB, userId: string): SQL<unknown> {
  return inArray(
    schema.proposals.id,
    db
      .select({ proposalId: schema.proposalMembers.proposalId })
      .from(schema.proposalMembers)
      .where(eq(schema.proposalMembers.userId, userId)),
  );
}

function toProgramPredicate(
  programCondition: unknown,
): SQL<unknown> | undefined {
  if (typeof programCondition === 'string') {
    if (
      VALID_PROGRAMS.includes(
        programCondition as (typeof VALID_PROGRAMS)[number],
      )
    ) {
      return eq(schema.proposals.proposalProgram, programCondition as any);
    }
    return undefined;
  }

  if (
    typeof programCondition === 'object' &&
    programCondition !== null &&
    '$in' in programCondition
  ) {
    const values = (programCondition as { $in?: unknown[] }).$in;
    if (!Array.isArray(values) || values.length === 0) {
      return undefined;
    }

    const normalized = values.filter(
      (v): v is string =>
        typeof v === 'string' &&
        VALID_PROGRAMS.includes(v as (typeof VALID_PROGRAMS)[number]),
    );

    if (normalized.length === 0) {
      return undefined;
    }

    return inArray(schema.proposals.proposalProgram, normalized as any);
  }

  return undefined;
}

export function combineWithAnd(
  predicates: Array<SQL<unknown> | undefined>,
): SQL<unknown> | undefined {
  const active = predicates.filter((predicate): predicate is SQL<unknown> =>
    Boolean(predicate),
  );

  if (active.length === 0) {
    return undefined;
  }

  if (active.length === 1) {
    return active[0];
  }

  return and(...active);
}

export function buildProposalAuthorizationWhere(
  db: DB,
  ability: MongoAbility,
  currentUserId: string,
): SQL<unknown> | undefined {
  const rules = ability
    .rulesFor('read', 'Proposal')
    .filter((rule) => !rule.inverted);

  if (rules.length === 0) {
    return sql`1 = 0`;
  }

  const rulePredicates: SQL<unknown>[] = [];

  for (const rule of rules) {
    if (!rule.conditions || Object.keys(rule.conditions).length === 0) {
      return undefined;
    }

    const parts: SQL<unknown>[] = [];

    const programPredicate = toProgramPredicate(
      (rule.conditions as Record<string, unknown>).program,
    );
    if (programPredicate) {
      parts.push(programPredicate);
    }

    if ((rule.conditions as Record<string, unknown>).isMember === true) {
      parts.push(memberPredicate(db, currentUserId));
    }

    if (parts.length === 0) {
      continue;
    }

    if (parts.length === 1) {
      rulePredicates.push(parts[0]);
    } else {
      const combinedRule = and(...parts);
      if (combinedRule) {
        rulePredicates.push(combinedRule);
      }
    }
  }

  if (rulePredicates.length === 0) {
    return sql`1 = 0`;
  }

  if (rulePredicates.length === 1) {
    return rulePredicates[0];
  }

  return or(...rulePredicates);
}

export function buildProposalRequestWhere(
  db: DB,
  query: GetProposalsQueryDto,
  currentUserId: string,
): SQL<unknown> | undefined {
  const predicates: SQL<unknown>[] = [];

  if (
    query.status &&
    VALID_STATUSES.includes(query.status as (typeof VALID_STATUSES)[number])
  ) {
    predicates.push(eq(schema.proposals.currentStatus, query.status as any));
  }

  if (
    query.program &&
    VALID_PROGRAMS.includes(query.program as (typeof VALID_PROGRAMS)[number])
  ) {
    predicates.push(eq(schema.proposals.proposalProgram, query.program as any));
  }

  if (query.departmentId) {
    predicates.push(eq(schema.proposals.departmentId, query.departmentId));
  }

  if (query.search) {
    predicates.push(ilike(schema.proposals.title, `%${query.search}%`));
  }

  if (query.me === true) {
    predicates.push(
      or(
        eq(schema.proposals.createdBy, currentUserId),
        memberPredicate(db, currentUserId),
      )!,
    );
  }

  const roles = query.getRolesArray();
  console.log('Roles from query:', roles);
  if (roles.length > 0) {
    predicates.push(
      inArray(
        schema.proposals.id,
        db
          .select({ proposalId: schema.proposalMembers.proposalId })
          .from(schema.proposalMembers)
          .where(
            and(
              eq(schema.proposalMembers.userId, currentUserId),
              inArray(schema.proposalMembers.role, roles),
            ),
          ),
      ),
    );
  }

  return combineWithAnd(predicates);
}
