import { Controller, Get } from '@nestjs/common';
import type { AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';
import { AppService } from '../app.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('profile')
  @Auth()
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: 'Welcome to your profile',
      user,
    };
  }

  @Get('protected')
  @Auth()
  getProtected(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: 'This is a protected route',
      userId: user.userId,
      role: user.role,
    };
  }
}
