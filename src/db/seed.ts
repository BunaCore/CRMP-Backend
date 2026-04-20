import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql, eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as schema from './schema';
import 'dotenv/config';
import { Role } from '../access-control/role.enum';
import { Permission } from '../access-control/permission.enum';
import { RolePermissions } from '../access-control/role-permissions';

if (process.env.NODE_ENV === 'production') {
  throw new Error('❌ Seeder is disabled in production environments.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

type SeedUserConfig = {
  name: string;
  email: string;
  password: string;
  roles: Role[];
};

const UNIVERSAL_PASSWORD = 'Password@1234';

const USERS: SeedUserConfig[] = [
  {
    name: 'System Admin',
    email: 'admin@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.SYSTEM_ADMIN],
  },
  {
    name: 'Dr. Advisor (Supervisor)',
    email: 'advisor@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY],
  },
  {
    name: 'DGC Member (Dept Head)',
    email: 'dgc@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY, Role.DGC_MEMBER],
  },
  {
    name: 'Peer Evaluator',
    email: 'evaluator@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY],
  },
  {
    name: 'College Dean (ADRPM)',
    email: 'college@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY, Role.COLLEGE_OFFICE],
  },
  {
    name: 'SGS Dean (PG Office)',
    email: 'pgoffice@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY, Role.PG_OFFICE],
  },
  {
    name: 'UG Coordinator',
    email: 'coordinator@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY, Role.COORDINATOR],
  },
  {
    name: 'Samuel Student',
    email: 'student@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.STUDENT],
  },
  {
    name: 'Director of RAD',
    email: 'rad@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY, Role.RAD],
  },
  {
    name: 'Finance Officer',
    email: 'finance@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY, Role.FINANCE],
  },
  {
    name: 'VP of RTT',
    email: 'vprtt@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY, Role.VPRTT],
  },
  {
    name: 'Academic Council Rep',
    email: 'ac@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    roles: [Role.FACULTY, Role.AC_MEMBER],
  },
];

const ADMIN_EMAIL = 'admin@crmp.edu';

async function seed() {
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  await db.transaction(async (tx) => {
    console.log('🧹 Clearing existing data...');

    await tx.execute(sql`
      DO $$
      DECLARE
        table_names text;
      BEGIN
        SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
        INTO table_names
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('__drizzle_migrations', '_drizzle_migrations');

        IF table_names IS NOT NULL THEN
          EXECUTE 'TRUNCATE TABLE ' || table_names || ' RESTART IDENTITY CASCADE';
        END IF;
      END $$;
    `);

    console.log('🌱 Seeding database...');

    console.log('Creating users...');
    const createdUsers = new Map<string, typeof schema.users.$inferSelect>();

    for (const userConfig of USERS) {
      const [user] = await tx
        .insert(schema.users)
        .values({
          fullName: userConfig.name,
          email: userConfig.email,
          passwordHash: hash(userConfig.password),
          accountStatus: 'active',
        })
        .returning();

      createdUsers.set(userConfig.email, user);
    }

    const adminUser = createdUsers.get(ADMIN_EMAIL);
    if (!adminUser) {
      throw new Error(`Missing admin user (${ADMIN_EMAIL}) in USERS config.`);
    }

    console.log('Seeding roles...');
    // Insert all roles from the Role enum
    const roleValues = Object.values(Role);
    const insertedRoles = await tx
      .insert(schema.roles)
      .values(
        roleValues.map((roleName) => ({
          name: roleName,
          description: `Role: ${roleName}`,
        })),
      )
      .returning();

    // Create mapping of role name to ID
    const roleNameToId = new Map<string, string>();
    insertedRoles.forEach((role) => {
      roleNameToId.set(role.name, role.id);
    });

    console.log('Assigning roles...');
    const roleAssignments = USERS.flatMap((userConfig) => {
      const user = createdUsers.get(userConfig.email);
      if (!user) {
        throw new Error(`Missing created user for ${userConfig.email}.`);
      }

      return userConfig.roles.map((roleName) => {
        const roleId = roleNameToId.get(roleName);
        if (!roleId) {
          throw new Error(`Role ${roleName} not found in database.`);
        }
        return {
          userId: user.id,
          roleId,
          grantedBy: adminUser.id,
        };
      });
    });

    await tx.insert(schema.userRoles).values(roleAssignments);

    // 3. Seed Permissions
    console.log('Seeding permissions...');
    const permissionValues = Object.values(Permission);
    const insertedPermissions = await tx
      .insert(schema.permissions)
      .values(
        permissionValues.map((permKey) => ({
          key: permKey,
          description: `Permission: ${permKey}`,
        })),
      )
      .returning();

    // Create mapping of permission key to ID
    const permKeyToId = new Map<string, string>();
    insertedPermissions.forEach((perm) => {
      permKeyToId.set(perm.key, perm.id);
    });

    // 3a. Map roles to permissions
    console.log('Mapping roles to permissions...');
    const rolePermissionsToInsert: (typeof schema.rolePermissions.$inferInsert)[] =
      [];
    for (const [roleName, permissions] of Object.entries(RolePermissions)) {
      const roleId = roleNameToId.get(roleName);
      if (!roleId) {
        throw new Error(`Role ${roleName} not found in database.`);
      }

      for (const permKey of permissions) {
        const permId = permKeyToId.get(permKey);
        if (!permId) {
          throw new Error(`Permission ${permKey} not found in database.`);
        }

        rolePermissionsToInsert.push({
          roleId,
          permissionId: permId,
        });
      }
    }

    if (rolePermissionsToInsert.length > 0) {
      await tx.insert(schema.rolePermissions).values(rolePermissionsToInsert);
    }

    // 3. Routing Rules (The "Real Flow")
    console.log('Seeding routing rules...');
    await tx.insert(schema.routingRules).values([
      // --- Postgraduate Flow ---
      {
        proposalProgram: 'PG',
        stepOrder: 1,
        approverRole: 'DGC_MEMBER',
        stepLabel: 'DGC Committee Review',
        stepType: 'FORM',
        isParallel: false,
        dynamicFieldsJson: {
          fields: [
            {
              name: 'meetingMinutes',
              type: 'file',
              required: true,
              multiple: false,
            },
          ],
        },
      },
      {
        proposalProgram: 'PG',
        stepOrder: 2,
        approverRole: 'COLLEGE_OFFICE',
        stepLabel: 'ADRPM Approval',
        stepType: 'APPROVAL',
      },
      {
        proposalProgram: 'PG',
        stepOrder: 3,
        approverRole: 'PG_OFFICE',
        stepLabel: 'PG Office Finalization',
        stepType: 'APPROVAL',
        isFinal: true,
      },

      // --- Undergraduate Flow ---
      {
        proposalProgram: 'UG',
        stepOrder: 1,
        approverRole: 'COORDINATOR',
        stepLabel: 'Initial Screening',
        stepType: 'APPROVAL',
        isFinal: false,
        // no fields – coordinator just approves
      },
      {
        proposalProgram: 'UG',
        stepOrder: 2,
        approverRole: 'EVALUATOR',
        stepLabel: 'Evaluation Review',
        stepType: 'APPROVAL',
        voteThreshold: 3,
        voteThresholdStrategy: 'MAJORITY',
        isParallel: false,
        isFinal: false,
        dynamicFieldsJson: {
          fields: [
            {
              name: 'evaluationReport',
              type: 'file',
              required: true,
              multiple: false,
            },
            { name: 'comments', type: 'textarea', required: false },
          ],
        },
      },
      {
        proposalProgram: 'UG',
        stepOrder: 3,
        approverRole: 'COORDINATOR',
        stepLabel: 'Final Coordinator Approval',
        stepType: 'APPROVAL',
        isFinal: true,
      },

      // --- Funded Project Flow ---
      {
        proposalProgram: 'GENERAL',
        stepOrder: 1,
        approverRole: 'RAD',
        stepLabel: 'RAD Pre-screening',
        stepType: 'APPROVAL',
        isFinal: false,
      },
      {
        proposalProgram: 'GENERAL',
        stepOrder: 2,
        approverRole: 'ADRPM',
        stepLabel: 'ADRPM Review',
        stepType: 'APPROVAL',
        // no fields
      },
      {
        proposalProgram: 'GENERAL',
        stepOrder: 3,
        approverRole: 'VPRTT',
        stepLabel: 'VPRTT Approval (<500k)',
        stepType: 'FORM',
        conditionGroup: 'BUDGET',
        branchKey: 'LOW_BUDGET',
        branchConditionJson: {
          field: 'budgetAmount',
          operator: 'lt',
          value: 500000,
        },
        isFinal: true,
        dynamicFieldsJson: {
          fields: [
            {
              name: 'approvalMemo',
              type: 'file',
              required: true,
              multiple: false,
            },
          ],
        },
      },
      {
        proposalProgram: 'GENERAL',
        stepOrder: 3,
        approverRole: 'AC_MEMBER',
        stepLabel: 'Academic Council Review (>=500k)',
        stepType: 'VOTE',
        voteThreshold: 7,
        voteThresholdStrategy: 'MAJORITY',
        conditionGroup: 'BUDGET',
        branchKey: 'HIGH_BUDGET',
        branchConditionJson: {
          field: 'budgetAmount',
          operator: 'gte',
          value: 500000,
        },
        isParallel: false,
        isFinal: true,
      },
    ]);

    // 4. Seed Departments
    console.log('Seeding departments...');
    const departments = [
      { name: 'Computer Science', code: 'CS' },
      { name: 'Mathematics', code: 'MATH' },
      { name: 'Physics', code: 'PHYS' },
      { name: 'Engineering', code: 'ENG' },
    ];

    const createdDepartments = await Promise.all(
      departments.map(async (dept) => {
        const [result] = await tx
          .insert(schema.departments)
          .values(dept)
          .returning();
        return result;
      }),
    );

    // 5. Seed Department Coordinators
    console.log('Seeding department coordinators...');
    const coordinatorUser = createdUsers.get('coordinator@crmp.edu');
    if (!coordinatorUser) {
      throw new Error('Coordinator user not found');
    }

    const coordinators = [
      { dept: createdDepartments[0], userId: coordinatorUser.id },
      { dept: createdDepartments[1], userId: coordinatorUser.id },
      { dept: createdDepartments[2], userId: coordinatorUser.id },
      { dept: createdDepartments[3], userId: coordinatorUser.id },
    ];

    for (const coord of coordinators) {
      await tx.insert(schema.departmentCoordinators).values({
        departmentId: coord.dept.id,
        userId: coord.userId,
      });
    }

    // 6. Seed Test Proposals
    const studentUser = createdUsers.get('student@crmp.edu');
    if (!studentUser) {
      throw new Error('Student user not found');
    }
    console.log('Seeding test proposals...');

    const departmentByProgram = {
      UG: createdDepartments[2],
      PG: createdDepartments[0],
      GENERAL: createdDepartments[3],
    } as const;

    const toDateString = (dateValue: Date | null | undefined) => {
      if (!dateValue) return new Date().toISOString().slice(0, 10);
      return dateValue.toISOString().slice(0, 10);
    };

    const proposalConfigs = [
      {
        title: 'Undergraduate Research Proposal 1',
        proposalProgram: 'UG' as const,
        isFunded: false,
        currentStatus: 'Draft' as const,
        createdBy: studentUser?.id || adminUser.id,
        projectId: null,
        promoteToProject: false,
        abstract:
          'This is a test undergraduate proposal for development and testing purposes.',
        submittedAt: new Date('2024-03-15'),
        durationMonths: 12,
        degreeLevel: 'NA' as const,
        members: [
          { email: 'student@crmp.edu', role: 'PI' as const },
          { email: 'advisor@crmp.edu', role: 'ADVISOR' as const },
        ],
      },
      {
        title: 'Postgraduate Thesis Proposal',
        proposalProgram: 'PG' as const,
        isFunded: false,
        currentStatus: 'Under_Review' as const,
        createdBy: studentUser.id,
        projectId: null,
        promoteToProject: true,
        abstract:
          'This is a test postgraduate proposal for development and testing purposes.',
        submittedAt: new Date('2024-03-15'),
        durationMonths: 24,
        degreeLevel: 'Master' as const,
        members: [
          { email: 'student@crmp.edu', role: 'PI' as const },
          { email: 'advisor@crmp.edu', role: 'ADVISOR' as const },
        ],
      },
      {
        title: 'Funded Research Project (Large Budget)',
        proposalProgram: 'GENERAL' as const,
        isFunded: true,
        currentStatus: 'Draft' as const,
        createdBy: studentUser.id,
        projectId: null,
        promoteToProject: true,
        abstract:
          'This is a test funded project proposal with large budget (>500k) for development and testing purposes.',
        submittedAt: new Date('2024-03-15'),
        durationMonths: 36,
        degreeLevel: 'NA' as const,
        budgetAmount: 750000,
        members: [
          { email: 'student@crmp.edu', role: 'PI' as const },
          { email: 'evaluator@crmp.edu', role: 'EVALUATOR' as const },
        ],
      },
      {
        title: 'Unfunded Research Plan (Small Budget)',
        proposalProgram: 'GENERAL' as const,
        isFunded: false,
        currentStatus: 'Draft' as const,
        createdBy: studentUser.id,
        projectId: null,
        promoteToProject: false,
        abstract:
          'This is a test unfunded project proposal with small budget (<500k) for development and testing purposes.',
        submittedAt: null,
        durationMonths: 12,
        degreeLevel: 'NA' as const,
        budgetAmount: 250000,
        members: [
          { email: 'student@crmp.edu', role: 'PI' as const },
          { email: 'advisor@crmp.edu', role: 'ADVISOR' as const },
        ],
      },
      {
        title: 'Second Postgraduate Proposal',
        proposalProgram: 'PG' as const,
        isFunded: false,
        currentStatus: 'Under_Review' as const,
        createdBy: studentUser.id,
        projectId: null,
        promoteToProject: false,
        abstract:
          'This is a test postgraduate draft proposal for development and testing purposes.',
        submittedAt: null,
        durationMonths: 18,
        degreeLevel: 'PhD' as const,
        members: [{ email: 'student@crmp.edu', role: 'PI' as const }],
      },
    ];

    const routingRules = await tx.select().from(schema.routingRules);
    const approvalsToInsert: (typeof schema.proposalApprovals.$inferInsert)[] =
      [];
    const proposalStepUpdates: { id: string; currentStepOrder: number }[] = [];
    const seededProposals: {
      proposal: typeof schema.proposals.$inferSelect;
      members: (typeof schema.proposalMembers.$inferInsert)[];
      promoteToProject: boolean;
    }[] = [];

    for (const config of proposalConfigs) {
      const { members, promoteToProject, ...proposalData } = config;

      // Add departmentId for UG and PG proposals only
      let proposalValues: any = proposalData;
      if (config.proposalProgram === 'UG') {
        proposalValues = {
          ...proposalData,
          departmentId: departmentByProgram.UG.id,
        };
      } else if (config.proposalProgram === 'PG') {
        proposalValues = {
          ...proposalData,
          departmentId: departmentByProgram.PG.id,
        };
      }
      // GENERAL proposals have no departmentId

      const [proposal] = await tx
        .insert(schema.proposals)
        .values(proposalValues)
        .returning();

      const proposalMembers = members
        .map((member) => {
          const user = createdUsers.get(member.email);
          if (!user) return null;
          return {
            proposalId: proposal.id,
            userId: user.id,
            role: member.role,
          };
        })
        .filter(
          (member): member is NonNullable<typeof member> => member !== null,
        );

      if (proposalMembers.length > 0) {
        await tx.insert(schema.proposalMembers).values(proposalMembers);
      }

      seededProposals.push({
        proposal,
        members: proposalMembers,
        promoteToProject,
      });

      // Evaluate branch conditions and filter matching rules
      const budgetAmount = proposal.budgetAmount
        ? parseFloat(String(proposal.budgetAmount))
        : 0;

      const evaluateCondition = (condition: any): boolean => {
        if (!condition) return true; // No condition = include step

        const field = condition.field as string;
        const operator = condition.operator as string;
        const value = condition.value;

        let fieldValue: any;
        if (field === 'budgetAmount') {
          fieldValue = budgetAmount;
        } else if (field === 'degreeLevel') {
          fieldValue = proposal.degreeLevel || '';
        } else if (field === 'proposalProgram') {
          fieldValue = proposal.proposalProgram;
        } else {
          return true; // Unknown field, include step
        }

        switch (operator) {
          case 'gt':
            return fieldValue > value;
          case 'gte':
            return fieldValue >= value;
          case 'lt':
            return fieldValue < value;
          case 'lte':
            return fieldValue <= value;
          case 'eq':
            return fieldValue === value;
          case 'neq':
            return fieldValue !== value;
          case 'in':
            return Array.isArray(value) && value.includes(fieldValue);
          default:
            return true;
        }
      };

      const programRules = routingRules
        .filter((rule) => rule.proposalProgram === proposal.proposalProgram)
        .sort((a, b) => a.stepOrder - b.stepOrder);

      // Filter based on branch conditions
      const matchingRules = programRules.filter((rule) =>
        evaluateCondition(rule.branchConditionJson),
      );

      if (matchingRules.length === 0) {
        throw new Error(
          `No routing rules found for proposal "${proposal.title}" (${proposal.proposalProgram}, ${proposal.currentStatus}).`,
        );
      }

      const activeStepOrder = matchingRules[0].stepOrder;
      proposalStepUpdates.push({
        id: proposal.id,
        currentStepOrder: activeStepOrder,
      });

      for (const rule of matchingRules) {
        approvalsToInsert.push({
          proposalId: proposal.id,
          routingRuleId: rule.id,
          stepOrder: rule.stepOrder,
          approverRole: rule.approverRole,
          stepType: rule.stepType, // Copy step type from routing rule
          dynamicFieldsJson: rule.dynamicFieldsJson || null, // Copy form schema snapshot
          voteThreshold: rule.voteThreshold || null, // Copy vote threshold
          voteThresholdStrategy: rule.voteThresholdStrategy || null, // Copy strategy
          branchKey: rule.branchKey || null, // Copy branching info
          conditionGroup: rule.conditionGroup || null,
          decision: 'Pending',
          isActive: rule.stepOrder === activeStepOrder,
        });
      }
    }

    for (const update of proposalStepUpdates) {
      await tx
        .update(schema.proposals)
        .set({ currentStepOrder: update.currentStepOrder })
        .where(sql`${schema.proposals.id} = ${update.id}`);
    }

    if (approvalsToInsert.length > 0) {
      await tx.insert(schema.proposalApprovals).values(approvalsToInsert);
    }

    // 7. Only proposals with fully accepted steps are promoted to projects
    console.log('Promoting approved proposals to projects...');
    for (const seeded of seededProposals) {
      if (!seeded.promoteToProject) continue;

      const proposalApprovals = approvalsToInsert.filter(
        (approval) => approval.proposalId === seeded.proposal.id,
      );

      if (proposalApprovals.length === 0) continue;

      await tx
        .update(schema.proposalApprovals)
        .set({
          decision: 'Accepted',
          approverUserId: adminUser.id,
          decisionAt: new Date(),
          isActive: false,
        })
        .where(
          sql`${schema.proposalApprovals.proposalId} = ${seeded.proposal.id}`,
        );

      const nonAcceptedApprovals = await tx
        .select({ id: schema.proposalApprovals.id })
        .from(schema.proposalApprovals)
        .where(
          sql`${schema.proposalApprovals.proposalId} = ${seeded.proposal.id} AND ${schema.proposalApprovals.decision} <> 'Accepted'`,
        );

      if (nonAcceptedApprovals.length > 0) {
        continue;
      }

      const department =
        seeded.proposal.proposalProgram === 'UG'
          ? departmentByProgram.UG
          : seeded.proposal.proposalProgram === 'PG'
            ? departmentByProgram.PG
            : departmentByProgram.GENERAL;

      const [project] = await tx
        .insert(schema.projects)
        .values({
          projectTitle: seeded.proposal.title,
          isFunded: seeded.proposal.isFunded,
          projectStage: 'Approved',
          projectDescription: seeded.proposal.abstract,
          submissionDate: toDateString(seeded.proposal.submittedAt),
          researchArea: seeded.proposal.researchArea,
          projectProgram: seeded.proposal.proposalProgram,
          departmentId: department.id,
          durationMonths: seeded.proposal.durationMonths ?? 12,
          ethicalClearanceStatus: 'Pending',
        })
        .returning();

      const projectMembers = seeded.members.map((member) => ({
        projectId: project.projectId,
        userId: member.userId,
        role: member.role,
      }));

      if (projectMembers.length > 0) {
        await tx.insert(schema.projectMembers).values(projectMembers);
      }

      const finalStepOrder = proposalApprovals.reduce(
        (maxStep, approval) =>
          approval.stepOrder > maxStep ? approval.stepOrder : maxStep,
        0,
      );

      await tx
        .update(schema.proposals)
        .set({
          projectId: project.projectId,
          currentStatus: 'Approved',
          currentStepOrder: finalStepOrder,
        })
        .where(sql`${schema.proposals.id} = ${seeded.proposal.id}`);
    }

    // Seed sample data for testing
    console.log('Seeding sample project and workspace for student...');

    if (studentUser) {
      const [project] = await tx
        .insert(schema.projects)
        .values({
          projectTitle: 'Sample Student Project',
          isFunded: false,
          projectStage: 'Submitted',
          projectDescription:
            'A sample project for testing the document editor',
          submissionDate: new Date().toISOString().split('T')[0],
          researchArea: 'Computer Science',
          projectProgram: 'UG',
          departmentId: null,
          durationMonths: 6,
          ethicalClearanceStatus: 'Pending',
        })
        .returning();

      await tx.insert(schema.projectMembers).values({
        projectId: project.projectId,
        userId: studentUser.id,
        role: 'MEMBER',
        addedAt: new Date(),
      });

      // Create workspace
      const [workspace] = await tx
        .insert(schema.workspaces)
        .values({
          projectId: project.projectId,
          name: 'Main Document',
          createdBy: studentUser.id,
        })
        .returning();

      // Create initial document
      const initialContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Start writing your document here...' },
            ],
          },
        ],
      };

      const [document] = await tx
        .insert(schema.documents)
        .values({
          workspaceId: workspace.id,
          currentContent: initialContent,
        })
        .returning();

      // Create initial version
      const contentHash = createHash('sha256')
        .update(JSON.stringify(initialContent))
        .digest('hex');
      const [version] = await tx
        .insert(schema.documentVersions)
        .values({
          documentId: document.id,
          versionNumber: 1,
          content: initialContent,
          createdBy: studentUser.id,
          sourceAction: 'initial',
          contentHash,
        })
        .returning();

      // Update document with current version
      await tx
        .update(schema.documents)
        .set({ currentVersionId: version.id })
        .where(eq(schema.documents.id, document.id));
    }

    console.log('✅ Database seeded successfully!');
  });
}

seed()
  .catch((err) => {
    console.error('❌ Seeding failed:');
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
