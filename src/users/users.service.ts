import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import { users } from 'src/db/schema/user';
import { eq } from 'drizzle-orm';

@Injectable()
export class UsersService {
  constructor(private drizzle: DrizzleService) {}

  async findByEmail(email: string) {
    const result = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0] || null;
  }

  async create(email: string, passwordHash: string) {
    const [user] = await this.drizzle.db
      .insert(users)
      .values({ email, passwordHash, role: 'student' })
      .returning();

    return user;
  }

  async findById(id: string) {
    const result = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return result[0] || null;
  }
}
