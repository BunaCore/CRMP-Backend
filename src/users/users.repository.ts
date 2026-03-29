import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { users } from 'src/db/schema/user';
import { userRoles } from 'src/db/schema/roles';
import { departmentCoordinators } from 'src/db/schema/department';
import { User, CreateUserInput, FindUserInput } from 'src/users/types/user';

@Injectable()
export class UsersRepository {
  constructor(private drizzle: DrizzleService) {}

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.drizzle.db
      .select({
        user: users,
        role: userRoles.roleName,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(users.email, email));

    if (!rows.length) return null;

    const user = rows[0].user;
    const roles = rows.map((r) => r.role).filter(Boolean) as string[];

    return {
      ...user,
      roles,
      role: roles[0] || '',
    } as any;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.drizzle.db
      .select({
        user: users,
        role: userRoles.roleName,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(users.id, id));

    if (!rows.length) return null;

    const user = rows[0].user;
    const roles = rows.map((r) => r.role).filter(Boolean) as string[];

    return {
      ...user,
      roles,
      role: roles[0] || '',
    } as any;
  }

  async findOne(input: FindUserInput): Promise<User | null> {
    if (input.email) {
      return this.findByEmail(input.email);
    }
    if (input.id) {
      return this.findById(input.id);
    }
    return null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const [user] = await this.drizzle.db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        department: input.department,
        phoneNumber: input.phoneNumber,
        university: input.university,
        universityId: input.universityId,
        accountStatus: input.accountStatus || 'deactive',
      })
      .returning();

    return user;
  }

  async findAll(): Promise<User[]> {
    return this.drizzle.db.select().from(users);
  }

  async update(
    id: string,
    input: Partial<CreateUserInput>,
  ): Promise<User | null> {
    const [user] = await this.drizzle.db
      .update(users)
      .set(input as any)
      .where(eq(users.id, id))
      .returning();

    return user || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.drizzle.db.delete(users).where(eq(users.id, id));

    return !!result.rowCount;
  }

  /**
   * Get all roles assigned to a user
   */
  async getUserRoles(userId: string) {
    return this.drizzle.db
      .select({
        id: userRoles.id,
        roleName: userRoles.roleName,
        grantedAt: userRoles.grantedAt,
      })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
  }

  /**
   * Check if user is a coordinator of a specific department
   */
  async isCoordinatorOfDepartment(
    userId: string,
    departmentId: string,
  ): Promise<boolean> {
    const [coordinator] = await this.drizzle.db
      .select()
      .from(departmentCoordinators)
      .where(
        and(
          eq(departmentCoordinators.userId, userId),
          eq(departmentCoordinators.departmentId, departmentId),
        ),
      );

    return !!coordinator;
  }
}
