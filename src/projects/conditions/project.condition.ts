import { MongoAbility } from '@casl/ability';
import { and, eq, ilike, inArray, or, sql, SQL } from 'drizzle-orm';
import { DB } from 'src/db/db.type';
import * as schema from 'src/db/schema';
import { GetProjectsQueryDto } from '../dto/get-projects-query.dto';

const VALID_STAGES = [
  'Submitted',
  'Under Review',
  'Approved',
  'Rejected',
  'Completed',
] as const;

const VALID_PROGRAMS = ['UG', 'PG', 'GENERAL'] as const;

function memberPredicate(db: DB, userId: string): SQL<unknown> {
  return inArray(
    schema.projects.projectId,
    db
      .select({ projectId: schema.projectMembers.projectId })
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.userId, userId)),
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
      return eq(schema.projects.projectProgram, programCondition as any);
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

    return inArray(schema.projects.projectProgram, normalized as any);
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

export function buildProjectAuthorizationWhere(
  db: DB,
  ability: MongoAbility,
  currentUserId: string,
): SQL<unknown> | undefined {
  const rules = ability
    .rulesFor('read', 'Project')
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

export function buildProjectRequestWhere(
  db: DB,
  query: GetProjectsQueryDto,
  currentUserId: string,
): SQL<unknown> | undefined {
  const predicates: SQL<unknown>[] = [];

  // Stage filter
  if (
    query.stage &&
    VALID_STAGES.includes(query.stage as (typeof VALID_STAGES)[number])
  ) {
    predicates.push(eq(schema.projects.projectStage, query.stage as any));
  }

  // Program filter
  if (
    query.program &&
    VALID_PROGRAMS.includes(query.program as (typeof VALID_PROGRAMS)[number])
  ) {
    predicates.push(eq(schema.projects.projectProgram, query.program as any));
  }

  // Department filter
  if (query.departmentId) {
    predicates.push(eq(schema.projects.departmentId, query.departmentId));
  }

  // Search filter
  if (query.search) {
    predicates.push(ilike(schema.projects.projectTitle, `%${query.search}%`));
  }

  // "me" filter - only projects where user is a member
  if (query.me === true) {
    predicates.push(memberPredicate(db, currentUserId));
  }

  // Role filter: if roles specified, filter by project_members.role
  if (query.roles) {
    const rolesArray = query.roles
      .split(',')
      .map((r) => r.trim().toUpperCase());

    if (rolesArray.length > 0) {
      predicates.push(
        inArray(
          schema.projects.projectId,
          db
            .selectDistinct({ projectId: schema.projectMembers.projectId })
            .from(schema.projectMembers)
            .where(inArray(schema.projectMembers.role, rolesArray as any)),
        ),
      );
    }
  }

  return combineWithAnd(predicates);
}
