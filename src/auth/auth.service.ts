import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';

import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private users: UsersService) {}
}
