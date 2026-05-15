import { Module } from '@nestjs/common';
import { RateLimitGuard } from 'src/common/guards/rate-limit.guard';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from 'src/users/users.module';
import { DbModule } from 'src/db/db.module';
import { DepartmentsModule } from 'src/departments/departments.module';
import { RolesRepository } from 'src/db/roles.repository';
import { QueuesModule } from 'src/queues/queues.module';

@Module({
  imports: [
    UsersModule,
    DbModule,
    QueuesModule,
    DepartmentsModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: parseInt(
            config.get<string>('JWT_EXPIRATION_MS') || '3600000',
            10,
          ),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, RolesRepository, RateLimitGuard],
  controllers: [AuthController],
})
export class AuthModule {}
