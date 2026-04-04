import { Injectable } from '@nestjs/common';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DB } from './db.type';
import * as schema from './schema';

@Injectable()
export class DrizzleService {
  public db: DB;
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    this.db = drizzle(this.pool, { schema });
  }

  /**
   * Execute operations within a database transaction
   * Automatically rolls back on error
   * @param callback - Function to execute within the transaction
   */
  async transaction<T>(callback: (tx: DB) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }
}
