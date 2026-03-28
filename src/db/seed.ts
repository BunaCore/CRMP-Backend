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
  role: Role;
};

const UNIVERSAL_PASSWORD = 'Password@1234';

const USERS: SeedUserConfig[] = [
  {
    name: 'System Admin',
    email: 'admin@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.ADMIN,
  },
  {
    name: 'Dr. Advisor (Supervisor)',
    email: 'advisor@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.SUPERVISOR,
  },
  {
    name: 'DGC Member (Dept Head)',
    email: 'dgc@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.DGC_MEMBER,
  },
  {
    name: 'Peer Evaluator',
    email: 'evaluator@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.EVALUATOR,
  },
  {
    name: 'College Dean (ADRPM)',
    email: 'college@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.COLLEGE_OFFICE,
  },
  {
    name: 'SGS Dean (PG Office)',
    email: 'pgoffice@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.PG_OFFICE,
  },
  {
    name: 'UG Coordinator',
    email: 'coordinator@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.COORDINATOR,
  },
  {
    name: 'Dr. Principal Investigator',
    email: 'pi@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.PI,
  },
  {
    name: 'Samuel Student',
    email: 'student@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.STUDENT,
  },
  {
    name: 'Director of RAD',
    email: 'rad@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.RAD,
  },
  {
    name: 'Finance Officer',
    email: 'finance@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.FINANCE,
  },
  {
    name: 'VP of RTT',
    email: 'vprtt@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.VPRTT,
  },
  {
    name: 'Academic Council Rep',
    email: 'ac@crmp.edu',
    password: UNIVERSAL_PASSWORD,
    role: Role.AC,
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
    const roleAssignments = USERS.map((userConfig) => {
      const user = createdUsers.get(userConfig.email);
      if (!user) {
        throw new Error(`Missing created user for ${userConfig.email}.`);
      }

      return {
        userId: user.id,
        roleName: userConfig.role,
        grantedBy: adminUser.id,
      };
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
