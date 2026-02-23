import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as schema from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function seed() {
    console.log('🌱 Seeding database...');

    // 1. Users
    const hash = (pw: string) => bcrypt.hashSync(pw, 10);

    console.log('Creating users...');
    const [admin] = await db.insert(schema.users).values({
        fullName: 'System Admin',
        email: 'admin@crmp.edu',
        passwordHash: hash('Admin@1234'),
        accountStatus: 'active',
    }).returning();

    const [pgOffice] = await db.insert(schema.users).values({
        fullName: 'SGS Dean',
        email: 'pgoffice@crmp.edu',
        passwordHash: hash('PGOffice@1234'),
        accountStatus: 'active',
    }).returning();

    const [dgc] = await db.insert(schema.users).values({
        fullName: 'DGC Member One',
        email: 'dgc@crmp.edu',
        passwordHash: hash('DGC@1234'),
        accountStatus: 'active',
    }).returning();

    const [advisor] = await db.insert(schema.users).values({
        fullName: 'Dr. Advisor',
        email: 'advisor@crmp.edu',
        passwordHash: hash('Advisor@1234'),
        accountStatus: 'active',
    }).returning();

    const [evaluator] = await db.insert(schema.users).values({
        fullName: 'Evaluator One',
        email: 'evaluator@crmp.edu',
        passwordHash: hash('Eval@1234'),
        accountStatus: 'active',
    }).returning();

    const [coordinator] = await db.insert(schema.users).values({
        fullName: 'UG Coordinator',
        email: 'coordinator@crmp.edu',
        passwordHash: hash('Coord@1234'),
        accountStatus: 'active',
    }).returning();

    const [rad] = await db.insert(schema.users).values({
        fullName: 'RAD Officer',
        email: 'rad@crmp.edu',
        passwordHash: hash('RAD@1234'),
        accountStatus: 'active',
    }).returning();

    const [finance] = await db.insert(schema.users).values({
        fullName: 'Finance Officer',
        email: 'finance@crmp.edu',
        passwordHash: hash('Finance@1234'),
        accountStatus: 'active',
    }).returning();

    const [researcher] = await db.insert(schema.users).values({
        fullName: 'Alice Researcher',
        email: 'alice@crmp.edu',
        passwordHash: hash('Alice@1234'),
        accountStatus: 'active',
    }).returning();

    const [ugStudent] = await db.insert(schema.users).values({
        fullName: 'Bob Student',
        email: 'bob@crmp.edu',
        passwordHash: hash('Bob@1234'),
        accountStatus: 'active',
    }).returning();

    console.log('✅ Users created');

    // 2. Assign roles
    console.log('Assigning roles...');
    await db.insert(schema.userRoles).values([
        { userId: admin.id, roleName: 'ADMIN', grantedBy: admin.id },
        { userId: pgOffice.id, roleName: 'PG_OFFICE', grantedBy: admin.id },
        { userId: dgc.id, roleName: 'DGC_MEMBER', grantedBy: admin.id },
        { userId: advisor.id, roleName: 'ADVISOR', grantedBy: admin.id },
        { userId: evaluator.id, roleName: 'EVALUATOR', grantedBy: admin.id },
        { userId: coordinator.id, roleName: 'COORDINATOR', grantedBy: admin.id },
        { userId: rad.id, roleName: 'RAD', grantedBy: admin.id },
        { userId: finance.id, roleName: 'FINANCE', grantedBy: admin.id },
        { userId: researcher.id, roleName: 'RESEARCHER', grantedBy: admin.id },
        { userId: ugStudent.id, roleName: 'RESEARCHER', grantedBy: admin.id },
    ]);

    console.log('✅ Roles assigned');

    // 3. Demo PG (Master) proposal
    console.log('Creating demo proposals...');
    const [pgProposal] = await db.insert(schema.proposals).values({
        createdBy: researcher.id,
        title: 'AI-Assisted Drug Discovery for Tropical Diseases',
        abstract: 'This research investigates the use of machine learning models to accelerate drug discovery pipelines targeting tropical diseases prevalent in Sub-Saharan Africa.',
        proposalType: 'Postgraduate',
        degreeLevel: 'Master',
        advisorUserId: advisor.id,
        currentStatus: 'Draft',
    }).returning();

    // 4. Demo UG proposal
    const [ugProposal] = await db.insert(schema.proposals).values({
        createdBy: ugStudent.id,
        title: 'Mobile App for Campus Event Management',
        abstract: 'A cross-platform mobile application to manage and promote campus events at the university.',
        proposalType: 'Undergraduate',
        degreeLevel: 'NA',
        currentStatus: 'Draft',
    }).returning();

    console.log('✅ Demo proposals created');

    // 5. Demo budget request for PG proposal
    console.log('Creating budget requests...');
    const [budget] = await db.insert(schema.budgetRequests).values({
        proposalId: pgProposal.id,
        requestedBy: researcher.id,
        totalAmount: '1400.00',
    }).returning();

    await db.insert(schema.budgetRequestItems).values([
        { budgetRequestId: budget.id, lineIndex: 1, description: 'Field data collection trips', requestedAmount: '600.00' },
        { budgetRequestId: budget.id, lineIndex: 2, description: 'Lab reagents & consumables', requestedAmount: '500.00' },
        { budgetRequestId: budget.id, lineIndex: 3, description: 'Conference registration fee', requestedAmount: '300.00' },
    ]);

    console.log('✅ Budget request + items created');

    // 6. Default routing rules
    console.log('Seeding routing rules...');
    await db.insert(schema.routingRules).values([
        // Undergraduate (1 step, coordinator is final)
        { proposalType: 'Undergraduate', stepOrder: 1, approverRole: 'COORDINATOR', stepLabel: 'Coordinator Screening', isParallel: false, isFinal: true, required: true },

        // Postgraduate (6 steps, PG_OFFICE is final)
        { proposalType: 'Postgraduate', stepOrder: 1, approverRole: 'ADVISOR', stepLabel: 'Advisor Acceptance', isParallel: false, isFinal: false, required: true },
        { proposalType: 'Postgraduate', stepOrder: 2, approverRole: 'DGC_MEMBER', stepLabel: 'DGC Initial Review', isParallel: false, isFinal: false, required: true },
        { proposalType: 'Postgraduate', stepOrder: 3, approverRole: 'EVALUATOR', stepLabel: 'Peer Evaluation (parallel)', isParallel: true, isFinal: false, required: true },
        { proposalType: 'Postgraduate', stepOrder: 4, approverRole: 'DGC_MEMBER', stepLabel: 'DGC Final Sign-off', isParallel: false, isFinal: false, required: true },
        { proposalType: 'Postgraduate', stepOrder: 5, approverRole: 'COLLEGE_REP', stepLabel: 'College Approval', isParallel: false, isFinal: false, required: true },
        { proposalType: 'Postgraduate', stepOrder: 6, approverRole: 'PG_OFFICE', stepLabel: 'SGS Dean Final Approval', isParallel: false, isFinal: true, required: true },

        // Funded_Project (4 steps, VPRTT is final; AC optional)
        { proposalType: 'Funded_Project', stepOrder: 1, approverRole: 'RAD', stepLabel: 'RAD Pre-screen', isParallel: false, isFinal: false, required: true },
        { proposalType: 'Funded_Project', stepOrder: 2, approverRole: 'FINANCE', stepLabel: 'Finance Budget Review', isParallel: false, isFinal: false, required: true },
        { proposalType: 'Funded_Project', stepOrder: 3, approverRole: 'VPRTT', stepLabel: 'VP Research Final Approval', isParallel: false, isFinal: true, required: true },
        { proposalType: 'Funded_Project', stepOrder: 4, approverRole: 'AC', stepLabel: 'Academic Council (if required)', isParallel: false, isFinal: false, required: false },

        // Unfunded_Project (1 step, RAD is final)
        { proposalType: 'Unfunded_Project', stepOrder: 1, approverRole: 'RAD', stepLabel: 'RAD Approval', isParallel: false, isFinal: true, required: true },
    ]);

    console.log('✅ Routing rules created');

    console.log('✨ Seeding complete!');
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seeding failed:');
    console.error(err);
    process.exit(1);
});
