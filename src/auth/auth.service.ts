import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { sanitizeUser } from 'src/utils/sanitize';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) { }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      department: dto.department,
      phoneNumber: dto.phoneNumber,
      university: dto.university,
      universityId: dto.universityId,
      role: 'user', // For compatibility in the returned object if needed, though db won't store it
      accountStatus: 'deactive',
    });

    const access_token = this.jwtService.sign({
      sub: user.id,
      role: user.role || (user.roles && user.roles[0]) || 'user',
    });

    return {
      access_token,
      user: sanitizeUser(user),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const access_token = this.jwtService.sign({
      sub: user.id,
      role: user.role || (user.roles && user.roles[0]) || 'user',
    });

    return {
      access_token,
      user: sanitizeUser(user),
    };
  }
}
