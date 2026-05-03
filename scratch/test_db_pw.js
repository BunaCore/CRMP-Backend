
const { Pool } = require('pg');

const passwords = ['1234b', '12345678', 'postgres', '123456'];

async function test() {
  for (const pw of passwords) {
    console.log(`Testing password: ${pw}`);
    const pool = new Pool({
      user: 'postgres',
      host: 'localhost',
      database: 'crmp',
      password: pw,
      port: 5434,
    });

    try {
      const client = await pool.connect();
      console.log(`✅ Success with password: ${pw}`);
      await client.release();
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.log(`❌ Failed with password: ${pw} - ${err.message}`);
      await pool.end();
    }
  }
  process.exit(1);
}

test();
