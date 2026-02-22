import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; role: string }) {
    // Fetch full user from database to provide complete context
    // for AccessService and other authorization checks
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      return null; // Will be rejected by guard
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
      accountStatus: user.accountStatus,
      fullName: user.fullName,
      phone: user.phoneNumber,
      universityId: user.universityId,
    };
  }
}
