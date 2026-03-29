import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as schema from './schema';
import 'dotenv/config';
import { Role } from '../access-control/role.enum';

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
    roles: [Role.ADMIN],
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
    roles: [Role.FACULTY, Role.AC],
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

    console.log('Assigning roles...');
    const roleAssignments = USERS.flatMap((userConfig) => {
      const user = createdUsers.get(userConfig.email);
      if (!user) {
        throw new Error(`Missing created user for ${userConfig.email}.`);
      }

      return userConfig.roles.map((roleName) => ({
        userId: user.id,
        roleName,
        grantedBy: adminUser.id,
      }));
    });

    await tx.insert(schema.userRoles).values(roleAssignments);

    // 3. Routing Rules (The "Real Flow")
    console.log('Seeding routing rules...');
    await tx.insert(schema.routingRules).values([
      // --- Postgraduate Flow ---
      // 1. Department review
      {
        proposalProgram: 'PG',
        currentStatus: 'Under_Review',
        nextRole: 'PG_OFFICE',
        stepOrder: 1,
        approverRole: 'DGC_MEMBER',
        stepLabel: 'Department Initial Review',
        isParallel: false,
        isFinal: false,
        required: true,
      },
      // 2. PG Office final approval
      {
        proposalProgram: 'PG',
        currentStatus: 'Under_Review',
        nextRole: null,
        stepOrder: 2,
        approverRole: 'PG_OFFICE',
        stepLabel: 'PG Office Final Approval',
        isParallel: false,
        isFinal: true,
        required: true,
      },

      // --- Undergraduate Flow ---
      // 1. Coordinator screens, plagiarism check, assigns advisor
      {
        proposalProgram: 'UG',
        currentStatus: 'Draft',
        nextRole: null,
        stepOrder: 1,
        approverRole: 'COORDINATOR',
        stepLabel: 'Coordinator Screening (Final Approval)',
        isParallel: false,
        isFinal: true,
        required: true,
      },

      // --- Funded Project Flow ---
      {
        proposalProgram: 'GENERAL',
        currentStatus: 'Draft',
        nextRole: null,
        stepOrder: 1,
        approverRole: 'RAD',
        stepLabel: 'RAD Pre-screening & Assignment',
        isParallel: false,
        isFinal: false,
        required: true,
      },
      {
        proposalProgram: 'GENERAL',
        currentStatus: 'Draft',
        nextRole: null,
        stepOrder: 2,
        approverRole: 'EVALUATOR',
        stepLabel: 'Peer Evaluation Review',
        isParallel: true,
        isFinal: false,
        required: true,
      },
      {
        proposalProgram: 'GENERAL',
        currentStatus: 'Draft',
        nextRole: null,
        stepOrder: 3,
        approverRole: 'FINANCE',
        stepLabel: 'Finance Budget Integrity Check',
        isParallel: false,
        isFinal: false,
        required: true,
      },
      {
        proposalProgram: 'GENERAL',
        currentStatus: 'Draft',
        nextRole: null,
        stepOrder: 4,
        approverRole: 'VPRTT',
        stepLabel: 'VP Research Final Authorization',
        isParallel: false,
        isFinal: false,
        required: true,
      },
      {
        proposalProgram: 'GENERAL',
        currentStatus: 'Draft',
        nextRole: null,
        stepOrder: 5,
        approverRole: 'AC',
        stepLabel: 'Academic Council Approval (>500k)',
        isParallel: false,
        isFinal: true,
        required: true,
      },

      // --- Unfunded Project Flow ---
      {
        proposalProgram: 'GENERAL',
        currentStatus: 'Draft',
        nextRole: null,
        stepOrder: 1,
        approverRole: 'RAD',
        stepLabel: 'RAD Final Approval',
        isParallel: false,
        isFinal: true,
        required: true,
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
        title: 'Funded Research Project',
        proposalProgram: 'GENERAL' as const,
        isFunded: true,
        currentStatus: 'Draft' as const,
        createdBy: studentUser.id,
        projectId: null,
        promoteToProject: true,
        abstract:
          'This is a test funded project proposal for development and testing purposes.',
        submittedAt: new Date('2024-03-15'),
        durationMonths: 36,
        degreeLevel: 'NA' as const,
        members: [
          { email: 'student@crmp.edu', role: 'PI' as const },
          { email: 'evaluator@crmp.edu', role: 'EVALUATOR' as const },
        ],
      },
      {
        title: 'Unfunded Research Plan',
        proposalProgram: 'GENERAL' as const,
        isFunded: false,
        currentStatus: 'Draft' as const,
        createdBy: studentUser.id,
        projectId: null,
        promoteToProject: false,
        abstract:
          'This is a test unfunded project proposal for development and testing purposes.',
        submittedAt: null,
        durationMonths: 12,
        degreeLevel: 'NA' as const,
        members: [
          { email: 'student@crmp.edu', role: 'PI' as const },
          { email: 'advisor@crmp.edu', role: 'ADVISOR' as const },
        ],
      },
      {
        title: 'Second Postgraduate Proposal',
        proposalProgram: 'PG' as const,
        isFunded: false,
        currentStatus: 'Draft' as const,
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
      const [proposal] = await tx
        .insert(schema.proposals)
        .values(proposalData)
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

      const matchingRules = routingRules
        .filter(
          (rule) =>
            rule.proposalProgram === proposal.proposalProgram &&
            (rule.currentStatus === proposal.currentStatus ||
              rule.currentStatus === null),
        )
        .sort((a, b) => a.stepOrder - b.stepOrder);

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
  });

  console.log('✨ Seeding complete!');
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
