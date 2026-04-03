import { Injectable } from '@nestjs/common';
import { eq, ilike, and, SQL } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { departments } from 'src/db/schema/department';
import { DepartmentSelectorDto } from 'src/types/selector';
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

  /**
   * Get departments for selector/dropdown (lightweight query)
   * Optional search by department name
   * @param searchQuery - Optional search term for department name
   * @param limit - Max results to return (default: 50)
   */
  async findForSelector(
    searchQuery?: string,
    limit: number = 50,
  ): Promise<DepartmentSelectorDto[]> {
    const conditions: SQL[] = [];

    if (searchQuery) {
      conditions.push(ilike(departments.name, `%${searchQuery}%`));
    }

    const query = this.drizzle.db
      .select()
      .from(departments)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limit);

    const results = await query;

    return results.map((dept) => ({
      label: dept.name,
      value: dept.id,
    }));
  }
}
