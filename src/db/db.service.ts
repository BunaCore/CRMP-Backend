import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DB } from './db.type';
import * as schema from './schema';

@Injectable()
export class DrizzleService {
  public db: DB;
  private pool: Pool;
  private readonly enableQueryLogging: boolean;

  constructor(private readonly configService: ConfigService) {
    const logLevel =
      this.configService.get<string>('DB_LOG_LEVEL') ??
      this.configService.get<string>('LOG_LEVEL') ??
      'info';

    const explicitDbLogging = this.configService.get<string>('DB_LOG_QUERIES');
    this.enableQueryLogging =
      explicitDbLogging === 'true' ||
      (explicitDbLogging !== 'false' && ['debug', 'trace'].includes(logLevel));

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    this.db = drizzle(this.pool, { schema, logger: this.enableQueryLogging });
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
