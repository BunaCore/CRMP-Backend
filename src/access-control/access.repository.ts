import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DB } from 'src/db/db.type';
import { DrizzleService } from 'src/db/db.service';
import { permissions, rolePermissions, roles } from 'src/db/schema/roles';

@Injectable()
export class AccessRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async findRoles(tx?: DB) {
    const db = tx || this.drizzle.db;
    return db.select().from(roles);
  }

  async findRoleById(roleId: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
    return role || null;
  }

  async findRoleByName(roleName: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    const [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, roleName));
    return role || null;
  }

  async createRole(input: { name: string; description?: string }, tx?: DB) {
    const db = tx || this.drizzle.db;
    const [created] = await db
      .insert(roles)
      .values({
        name: input.name,
        description: input.description || null,
      })
      .returning();
    return created;
  }

  async updateRole(
    roleId: string,
    input: { name?: string; description?: string },
    tx?: DB,
  ) {
    const db = tx || this.drizzle.db;
    const patch: Record<string, unknown> = {};

    if (typeof input.name !== 'undefined') {
      patch.name = input.name;
    }

    if (typeof input.description !== 'undefined') {
      patch.description = input.description || null;
    }

    const [updated] = await db
      .update(roles)
      .set(patch)
      .where(eq(roles.id, roleId))
      .returning();

    return updated || null;
  }

  async deleteRole(roleId: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    const result = await db.delete(roles).where(eq(roles.id, roleId));
    return (result.rowCount || 0) > 0;
  }

  async findPermissions(tx?: DB) {
    const db = tx || this.drizzle.db;
    return db.select().from(permissions);
  }

  async findPermissionsByIds(permissionIds: string[], tx?: DB) {
    const db = tx || this.drizzle.db;
    if (permissionIds.length === 0) {
      return [];
    }

    return db
      .select()
      .from(permissions)
      .where(inArray(permissions.id, permissionIds));
  }

  async findRolePermissions(roleId: string, tx?: DB) {
    const db = tx || this.drizzle.db;

    return db
      .select({
        mappingId: rolePermissions.id,
        roleId: rolePermissions.roleId,
        permissionId: permissions.id,
        key: permissions.key,
        description: permissions.description,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
  }

  async deleteRolePermissions(roleId: string, tx?: DB) {
    const db = tx || this.drizzle.db;
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  }

  async insertRolePermissions(
    roleId: string,
    permissionIds: string[],
    tx?: DB,
  ) {
    const db = tx || this.drizzle.db;

    if (permissionIds.length === 0) {
      return;
    }

    const values = permissionIds.map((permissionId) => ({
      roleId,
      permissionId,
    }));

    await db.insert(rolePermissions).values(values);
  }
}
