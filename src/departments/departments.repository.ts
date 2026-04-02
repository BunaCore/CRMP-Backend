import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { departments } from 'src/db/schema/department';
import { DB } from 'src/db/db.type';

@Injectable()
export class DepartmentsRepository {
  constructor(private drizzle: DrizzleService) {}

  /**
   * Find a department by ID
   * @param id - Department ID (UUID)
   * @param tx - Optional transaction to use for the query
   */
  async findById(id: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    const [department] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, id));

    return department || null;
  }

  /**
   * Find a department by code
   * @param code - Department code
   * @param tx - Optional transaction to use for the query
   */
  async findByCode(code: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    const [department] = await db
      .select()
      .from(departments)
      .where(eq(departments.code, code));

    return department || null;
  }

  /**
   * Get all departments
   * @param tx - Optional transaction to use for the query
   */
  async findAll(tx?: DB) {
    const db = tx || this.drizzle.db;
    return db.select().from(departments);
  }
}
