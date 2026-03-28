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
        proposalType: 'Postgraduate',
        currentStatus: 'Submitted',
        nextRole: Role.PG_OFFICE,
        stepOrder: 1,
        approverRole: Role.DGC_MEMBER,
        stepLabel: 'Department Initial Review',
        isParallel: false,
        isFinal: false,
        required: true,
      },
      // 2. PG Office final approval
      {
        proposalType: 'Postgraduate',
        currentStatus: 'Under_Review',
        nextRole: null,
        stepOrder: 2,
        approverRole: Role.PG_OFFICE,
        stepLabel: 'PG Office Final Approval',
        isParallel: false,
        isFinal: true,
        required: true,
      },

      // --- Undergraduate Flow ---
      // 1. Coordinator screens, plagiarism check, assigns advisor
      {
        proposalType: 'Undergraduate',
        currentStatus: 'Submitted',
        nextRole: null,
        stepOrder: 1,
        approverRole: Role.COORDINATOR,
        stepLabel: 'Coordinator Screening (Final Approval)',
        isParallel: false,
        isFinal: true,
        required: true,
      },

      // --- Funded Project Flow ---
      {
        proposalType: 'Funded_Project',
        stepOrder: 1,
        approverRole: Role.RAD,
        stepLabel: 'RAD Pre-screening & Assignment',
        isParallel: false,
        isFinal: false,
        required: true,
      },
      {
        proposalType: 'Funded_Project',
        stepOrder: 2,
        approverRole: Role.EVALUATOR,
        stepLabel: 'Peer Evaluation Review',
        isParallel: true,
        isFinal: false,
        required: true,
      },
      {
        proposalType: 'Funded_Project',
        stepOrder: 3,
        approverRole: Role.FINANCE,
        stepLabel: 'Finance Budget Integrity Check',
        isParallel: false,
        isFinal: false,
        required: true,
      },
      {
        proposalType: 'Funded_Project',
        stepOrder: 4,
        approverRole: Role.VPRTT,
        stepLabel: 'VP Research Final Authorization',
        isParallel: false,
        isFinal: false,
        required: true,
      },
      {
        proposalType: 'Funded_Project',
        stepOrder: 5,
        approverRole: Role.AC,
        stepLabel: 'Academic Council Approval (>500k)',
        isParallel: false,
        isFinal: true,
        required: true,
      },

      // --- Unfunded Project Flow ---
      {
        proposalType: 'Unfunded_Project',
        currentStatus: 'Submitted',
        nextRole: null,
        stepOrder: 1,
        approverRole: Role.RAD,
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

    // 6. Seed Test Projects
    console.log('Seeding test projects...');
    const studentUser = createdUsers.get('student@crmp.edu');
    if (!studentUser) {
      throw new Error('Student user not found');
    }

    const [testProject1] = await tx
      .insert(schema.projects)
      .values({
        projectTitle: 'AI Research Initiative',
        projectType: 'Funded',
        projectStage: 'Submitted',
        projectDescription: 'Research on machine learning applications',
        submissionDate: '2024-01-15',
        researchArea: 'Artificial Intelligence',
        projectProgram: 'PG',
        departmentId: createdDepartments[0].id,
        durationMonths: 24,
        PI_ID: studentUser.id,
        ethicalClearanceStatus: 'Pending',
      })
      .returning();

    const [testProject2] = await tx
      .insert(schema.projects)
      .values({
        projectTitle: 'Advanced Mathematics Study',
        projectType: 'Non-Funded',
        projectStage: 'Under Review',
        projectDescription: 'Study of pure mathematics',
        submissionDate: '2024-02-01',
        researchArea: 'Pure Mathematics',
        projectProgram: 'PG',
        departmentId: createdDepartments[1].id,
        durationMonths: 12,
        PI_ID: studentUser.id,
        ethicalClearanceStatus: 'Pending',
      })
      .returning();

    const [testProject3] = await tx
      .insert(schema.projects)
      .values({
        projectTitle: 'Undergraduate Physics Project',
        projectType: 'Undergraduate',
        projectStage: 'Submitted',
        projectDescription: 'UG level physics experiment',
        submissionDate: '2024-03-10',
        researchArea: 'Physics',
        projectProgram: 'UG',
        departmentId: createdDepartments[2].id,
        durationMonths: 6,
        PI_ID: studentUser.id,
        ethicalClearanceStatus: 'Pending',
      })
      .returning();

    const projectIds = [
      testProject1.projectId,
      testProject2.projectId,
      testProject3.projectId,
    ];

    // 7. Seed Test Proposals
    console.log('Seeding test proposals...');
    const advisorUserObj = createdUsers.get('advisor@crmp.edu');

    const proposalConfigs = [
      {
        title: 'Undergraduate Research Proposal 1',
        proposalType: 'Undergraduate' as const,
        currentStatus: 'Submitted' as const,
        createdBy: studentUser?.id || adminUser.id,
        advisorUserId: advisorUserObj?.id,
        projectId: projectIds[2],
        abstract:
          'This is a test undergraduate proposal for development and testing purposes.',
        submittedAt: new Date('2024-03-15'),
        durationMonths: 12,
        degreeLevel: 'NA' as const,
      },
      {
        title: 'Postgraduate Thesis Proposal',
        proposalType: 'Postgraduate' as const,
        currentStatus: 'Under_Review' as const,
        createdBy: studentUser.id,
        advisorUserId: advisorUserObj?.id,
        projectId: projectIds[0],
        abstract:
          'This is a test postgraduate proposal for development and testing purposes.',
        submittedAt: new Date('2024-03-15'),
        durationMonths: 24,
        degreeLevel: 'Master' as const,
      },
      {
        title: 'Funded Research Project',
        proposalType: 'Funded_Project' as const,
        currentStatus: 'Submitted' as const,
        createdBy: studentUser.id,
        advisorUserId: null,
        projectId: projectIds[0],
        abstract:
          'This is a test funded project proposal for development and testing purposes.',
        submittedAt: new Date('2024-03-15'),
        durationMonths: 36,
        degreeLevel: 'NA' as const,
      },
      {
        title: 'Unfunded Research Plan',
        proposalType: 'Unfunded_Project' as const,
        currentStatus: 'Draft' as const,
        createdBy: studentUser.id,
        advisorUserId: null,
        projectId: projectIds[2],
        abstract:
          'This is a test unfunded project proposal for development and testing purposes.',
        submittedAt: null,
        durationMonths: 12,
        degreeLevel: 'NA' as const,
      },
      {
        title: 'Second Postgraduate Proposal',
        proposalType: 'Postgraduate' as const,
        currentStatus: 'Draft' as const,
        createdBy: studentUser.id,
        advisorUserId: advisorUserObj?.id,
        projectId: projectIds[1],
        abstract:
          'This is a test postgraduate draft proposal for development and testing purposes.',
        submittedAt: null,
        durationMonths: 18,
        degreeLevel: 'PhD' as const,
      },
    ];

    const createdProposals: (typeof schema.proposals.$inferSelect)[] = [];
    for (const config of proposalConfigs) {
      const [proposal] = await tx
        .insert(schema.proposals)
        .values(config)
        .returning();
      createdProposals.push(proposal);
    }

    // 8. Prepopulate Proposal Approvals from routing workflow
    console.log('Prepopulating proposal approvals...');
    const routingRules = await tx.select().from(schema.routingRules);

    const approvalsToInsert: (typeof schema.proposalApprovals.$inferInsert)[] =
      [];
    for (const proposal of createdProposals) {
      const matchingRules = routingRules
        .filter(
          (rule) =>
            rule.proposalType === proposal.proposalType &&
            (rule.currentStatus === proposal.currentStatus ||
              rule.currentStatus === null),
        )
        .sort((a, b) => a.stepOrder - b.stepOrder);

      for (const rule of matchingRules) {
        approvalsToInsert.push({
          proposalId: proposal.id,
          routingRuleId: rule.id,
          stepOrder: rule.stepOrder,
          approverRole: rule.approverRole,
          decision: 'Pending',
        });
      }
    }

    if (approvalsToInsert.length > 0) {
      await tx.insert(schema.proposalApprovals).values(approvalsToInsert);
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
