import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    UsersModule,
    DbModule,
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
  providers: [AuthService, JwtStrategy, RolesRepository],
  controllers: [AuthController],
})
export class AuthModule {}
