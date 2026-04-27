import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponse } from 'src/types/auth-response';
import { UserWithPermissions } from 'src/types/user-with-permissions';
import { JwtAuthGuard } from './jwt.guard';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Register a new user with transactional role assignment
   * Returns accessToken, refreshToken, and user with permissions
   */
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  /**
   * Login user with email and password
   * Returns accessToken, refreshToken, and user with permissions
   */
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Post('invitations/accept')
  async acceptInvitation(@Body() dto: AcceptInvitationDto): Promise<AuthResponse> {
    return this.authService.acceptInvitation(dto);
  }

  /**
   * Get current authenticated user
   * Returns user with permissions
   * Requires valid JWT access token
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any): Promise<UserWithPermissions> {
    const userId = req.user?.sub || req.user?.id;
    return this.authService.getCurrentUser(userId);
  }
}
