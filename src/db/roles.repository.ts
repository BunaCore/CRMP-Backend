import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { roles } from 'src/db/schema/roles';
import { DB } from 'src/db/db.type';

@Injectable()
export class RolesRepository {
  constructor(private drizzle: DrizzleService) {}

  /**
   * Find a role by name (e.g., "STUDENT", "ADMIN")
   * @param name - Role name
   * @param tx - Optional transaction to use for the query
   */
  async findByName(name: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    const [role] = await db.select().from(roles).where(eq(roles.name, name));

    return role || null;
  }

  /**
   * Find a role by ID
   * @param id - Role ID (UUID)
   * @param tx - Optional transaction to use for the query
   */
  async findById(id: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    const [role] = await db.select().from(roles).where(eq(roles.id, id));

    return role || null;
  }

  /**
   * Get all roles
   * @param tx - Optional transaction to use for the query
   */
  async findAll(tx?: DB) {
    const db = tx || this.drizzle.db;
    return db.select().from(roles);
  }
}
