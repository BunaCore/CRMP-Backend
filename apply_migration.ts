import 'dotenv/config';
import { Client } from 'pg';

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "yjs_state" "bytea";');
    console.log("yjs_state column added successfully.");
  } catch (error) {
    console.error("Error adding column:", error);
  } finally {
    await client.end();
  }
}
run();
