import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as schema from './schema';
import 'dotenv/config';
import { Role } from '../access-control/role.enum';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function seed() {
    console.log('🧹 Clearing existing data...');

    // 1. Break circular references if they exist
    try {
        await db.execute(sql`UPDATE proposals SET current_version_id = NULL`);
    } catch (e) {
        // Table might not exist or be empty
    }

    // 2. Delete in reverse order of dependencies
    await db.delete(schema.auditLogs);
    await db.delete(schema.notifications);
    await db.delete(schema.verificationUploads);
    await db.delete(schema.budgetLedger);
    await db.delete(schema.budgetInstallments);
    await db.delete(schema.budgetRequestItems);
    await db.delete(schema.budgetRequests);
    await db.delete(schema.proposalComments);
    await db.delete(schema.evaluatorAssignments);
    await db.delete(schema.proposalApprovals);
    await db.delete(schema.proposalVersions);
    await db.delete(schema.proposalFiles);
    await db.delete(schema.proposals);
    await db.delete(schema.routingRules);
    await db.delete(schema.userRoles);
    await db.delete(schema.users);

    console.log('🌱 Seeding database...');

    const hash = (pw: string) => bcrypt.hashSync(pw, 10);

    // 1. Core Users
    console.log('Creating users...');
    const [adminUser] = await db.insert(schema.users).values({
        fullName: 'System Admin',
        email: 'admin@crmp.edu',
        passwordHash: hash('Admin@1234'),
        accountStatus: 'active',
    }).returning();

    const [advisorUser] = await db.insert(schema.users).values({
        fullName: 'Dr. Advisor (Supervisor)',
        email: 'advisor@crmp.edu',
        passwordHash: hash('Advisor@1234'),
        accountStatus: 'active',
    }).returning();

    const [dgcUser] = await db.insert(schema.users).values({
        fullName: 'DGC Member (Dept Head)',
        email: 'dgc@crmp.edu',
        passwordHash: hash('DGC@1234'),
        accountStatus: 'active',
    }).returning();

    const [evaluatorUser] = await db.insert(schema.users).values({
        fullName: 'Peer Evaluator',
        email: 'evaluator@crmp.edu',
        passwordHash: hash('Eval@1234'),
        accountStatus: 'active',
    }).returning();

    const [collegeUser] = await db.insert(schema.users).values({
        fullName: 'College Dean (ADRPM)',
        email: 'college@crmp.edu',
        passwordHash: hash('College@1234'),
        accountStatus: 'active',
    }).returning();

    const [pgOfficeUser] = await db.insert(schema.users).values({
        fullName: 'SGS Dean (PG Office)',
        email: 'pgoffice@crmp.edu',
        passwordHash: hash('PGOffice@1234'),
        accountStatus: 'active',
    }).returning();

    const [coordinatorUser] = await db.insert(schema.users).values({
        fullName: 'UG Coordinator',
        email: 'coordinator@crmp.edu',
        passwordHash: hash('Coord@1234'),
        accountStatus: 'active',
    }).returning();

    const [piUser] = await db.insert(schema.users).values({
        fullName: 'Dr. Principal Investigator',
        email: 'pi@crmp.edu',
        passwordHash: hash('PI@1234'),
        accountStatus: 'active',
    }).returning();

    const [studentUser] = await db.insert(schema.users).values({
        fullName: 'Samuel Student',
        email: 'student@crmp.edu',
        passwordHash: hash('Student@1234'),
        accountStatus: 'active',
    }).returning();

    const [radUser] = await db.insert(schema.users).values({
        fullName: 'Director of RAD',
        email: 'rad@crmp.edu',
        passwordHash: hash('Rad@1234'),
        accountStatus: 'active',
    }).returning();

    const [financeUser] = await db.insert(schema.users).values({
        fullName: 'Finance Officer',
        email: 'finance@crmp.edu',
        passwordHash: hash('Finance@1234'),
        accountStatus: 'active',
    }).returning();

    const [vprttUser] = await db.insert(schema.users).values({
        fullName: 'VP of RTT',
        email: 'vprtt@crmp.edu',
        passwordHash: hash('Vprtt@1234'),
        accountStatus: 'active',
    }).returning();

    const [acUser] = await db.insert(schema.users).values({
        fullName: 'Academic Council Rep',
        email: 'ac@crmp.edu',
        passwordHash: hash('Ac@1234'),
        accountStatus: 'active',
    }).returning();

    // 2. Assign Roles
    console.log('Assigning roles...');
    await db.insert(schema.userRoles).values([
        { userId: adminUser.id, roleName: Role.ADMIN, grantedBy: adminUser.id },
        { userId: advisorUser.id, roleName: Role.SUPERVISOR, grantedBy: adminUser.id },
        { userId: dgcUser.id, roleName: Role.DGC_MEMBER, grantedBy: adminUser.id },
        { userId: evaluatorUser.id, roleName: Role.EVALUATOR, grantedBy: adminUser.id },
        { userId: collegeUser.id, roleName: Role.COLLEGE_OFFICE, grantedBy: adminUser.id },
        { userId: pgOfficeUser.id, roleName: Role.PG_OFFICE, grantedBy: adminUser.id },
        { userId: coordinatorUser.id, roleName: Role.COORDINATOR, grantedBy: adminUser.id },
        { userId: piUser.id, roleName: Role.PI, grantedBy: adminUser.id },
        { userId: studentUser.id, roleName: Role.STUDENT, grantedBy: adminUser.id },
        { userId: radUser.id, roleName: Role.RAD, grantedBy: adminUser.id },
        { userId: financeUser.id, roleName: Role.FINANCE, grantedBy: adminUser.id },
        { userId: vprttUser.id, roleName: Role.VPRTT, grantedBy: adminUser.id },
        { userId: acUser.id, roleName: Role.AC, grantedBy: adminUser.id },
    ]);

    // 3. Routing Rules (The "Real Flow")
    console.log('Seeding routing rules...');
    await db.insert(schema.routingRules).values([
        // --- Postgraduate Flow ---
        // 1. DGC assigns evaluators and confirms advisor
        { proposalType: 'Postgraduate', stepOrder: 1, approverRole: Role.DGC_MEMBER, stepLabel: 'Department Initial Review (Assign Evaluators)', isParallel: false, isFinal: false, required: true },
        // 2. Evaluators do the technical review and attach feedback forms
        { proposalType: 'Postgraduate', stepOrder: 2, approverRole: Role.EVALUATOR, stepLabel: 'Peer Evaluation Review', isParallel: true, isFinal: false, required: true },
        // 3. College Sign-off
        { proposalType: 'Postgraduate', stepOrder: 3, approverRole: Role.COLLEGE_OFFICE, stepLabel: 'College Representative Approval', isParallel: false, isFinal: false, required: true },
        // 4. Final SGS Dean Approval
        { proposalType: 'Postgraduate', stepOrder: 4, approverRole: Role.PG_OFFICE, stepLabel: 'SGS Dean (Final Approval)', isParallel: false, isFinal: true, required: true },

        // --- Undergraduate Flow ---
        // 1. Coordinator screens, plagiarism check, assigns advisor
        { proposalType: 'Undergraduate', stepOrder: 1, approverRole: Role.COORDINATOR, stepLabel: 'Coordinator Screening (Final Approval)', isParallel: false, isFinal: true, required: true },

        // --- Funded Project Flow ---
        { proposalType: 'Funded_Project', stepOrder: 1, approverRole: Role.RAD, stepLabel: 'RAD Pre-screening & Assignment', isParallel: false, isFinal: false, required: true },
        { proposalType: 'Funded_Project', stepOrder: 2, approverRole: Role.EVALUATOR, stepLabel: 'Peer Evaluation Review', isParallel: true, isFinal: false, required: true },
        { proposalType: 'Funded_Project', stepOrder: 3, approverRole: Role.FINANCE, stepLabel: 'Finance Budget Integrity Check', isParallel: false, isFinal: false, required: true },
        { proposalType: 'Funded_Project', stepOrder: 4, approverRole: Role.VPRTT, stepLabel: 'VP Research Final Authorization', isParallel: false, isFinal: false, required: true },
        { proposalType: 'Funded_Project', stepOrder: 5, approverRole: Role.AC, stepLabel: 'Academic Council Approval (>500k)', isParallel: false, isFinal: true, required: true },

        // --- Unfunded Project Flow ---
        { proposalType: 'Unfunded_Project', stepOrder: 1, approverRole: Role.RAD, stepLabel: 'RAD Final Approval', isParallel: false, isFinal: true, required: true },
    ]);

    console.log('✨ Seeding complete!');
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seeding failed:');
    console.error(err);
    process.exit(1);
});
