import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/drizzle/drizzle.service';
import { users } from 'src/drizzle/schema/user';

@Injectable()
export class UsersService {
  constructor(private drizzle: DrizzleService) {}

  async findByEmail(email: string) {
    return this.drizzle.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    });
  }

  async create(email: string, passwordHash: string) {
    const [user] = await this.drizzle.db
      .insert(users)
      .values({ email, passwordHash })
      .returning();

    return user;
  }
}
