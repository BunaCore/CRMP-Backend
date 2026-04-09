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
        name: 'Advisor',
        phase: 'PROPOSAL' as const,
        type: 'continuous' as const,
        maxPoints: '20.00',
      },
      {
        name: 'Proposal Defence',
        phase: 'PROPOSAL' as const,
        type: 'continuous' as const,
        maxPoints: '15.00',
      },
      {
        name: 'Documentation',
        phase: 'PROJECT' as const,
        type: 'continuous' as const,
        maxPoints: '20.00',
      },
      {
        name: 'Defence — Individual',
        phase: 'PROJECT' as const,
        type: 'continuous' as const,
        maxPoints: '15.00',
      },
      {
        name: 'Defence — Group',
        phase: 'PROJECT' as const,
        type: 'final' as const,
        maxPoints: '30.00',
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
