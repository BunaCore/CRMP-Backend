import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from 'src/db/db.service';
import { users } from 'src/db/schema/user';
import { User, CreateUserInput, FindUserInput } from 'src/users/types/user';

@Injectable()
export class UsersRepository {
  constructor(private drizzle: DrizzleService) { }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0] || null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return result[0] || null;
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
}
