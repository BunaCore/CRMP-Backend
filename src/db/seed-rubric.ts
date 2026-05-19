import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

async function seedRubric() {
  console.log('🌱 Starting Evaluation Rubric Seed...');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in environment variables');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool, { schema });

  try {
    const rubrics = [
      {
        id: '2897fb5d-dfd5-49e9-bfb0-11b2757199a6',
        name: 'Advisor',
        phase: 'PROPOSAL' as const,
        type: 'continuous' as const,
        maxPoints: '20.00',
        isIndividual: false,
      },
      {
        id: '52946fb0-b278-43e6-b9cb-8fe7706ecdde',
        name: 'Proposal Defence',
        phase: 'PROPOSAL' as const,
        type: 'continuous' as const,
        maxPoints: '15.00',
        isIndividual: false,
      },
      {
        id: '82c53578-0210-4133-9b25-f627f6ae2252',
        name: 'Advisor',
        phase: 'PROJECT' as const,
        type: 'continuous' as const,
        maxPoints: '20.00',
        isIndividual: false,
      },
      {
        id: '399e0be9-2279-4d1c-a79e-169bc0334c04',
        name: 'Defence Individual',
        phase: 'PROJECT' as const,
        type: 'continuous' as const,
        maxPoints: '15.00',
        isIndividual: true,
      },
      {
        id: '32619a47-d652-404b-b98f-e4398a1186e8',
        name: 'Defence Group',
        phase: 'PROJECT' as const,
        type: 'final' as const,
        maxPoints: '30.00',
        isIndividual: false,
      },
    ];

    await db.insert(schema.evaluationRubrics).values(rubrics);

    console.log('✅ Evaluation Rubric Seeded Successfully!');
    console.log(rubrics);
  } catch (error) {
    console.error('❌ Failed to seed rubrics', error);
  } finally {
    process.exit(0);
  }
}

seedRubric();
