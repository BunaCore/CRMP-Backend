import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UserSelectorDto } from 'src/types/selector';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AccessGuard } from 'src/access-control/access.guard';
import { RequireCasl } from 'src/access-control/require-permission.decorator';
import { ReplaceUserRolesDto } from './dto/replace-user-roles.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { UsersListResponse } from './types/user-admin-list.type';
import { UserDetailResponse } from './types/user-detail.type';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireCasl({ action: 'read', subject: 'User' })
  async getUsers(@Query() query: GetUsersQueryDto): Promise<UsersListResponse> {
    return this.usersService.getUsers(query);
  }

  /**
   * GET /users/selector
   * Get lightweight user list for dropdowns/selectors
   * Query params:
   *   - q: Search by name or email
   *   - role: Filter by role name (e.g., SUPERVISOR)
   *   - limit: Max results (default: 50)
   */
  @Get('selector')
  async getSelector(
    @Query('q') searchQuery?: string,
    @Query('role') roleName?: string,
    @Query('limit') limit?: string,
  ): Promise<UserSelectorDto[]> {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 200) : 50;
    return this.usersService.getSelector(searchQuery, roleName, parsedLimit);
  }

  @Get(':id/roles')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireCasl({ action: 'read', subject: 'User' })
  async getUserRoles(@Param('id', new ParseUUIDPipe()) userId: string) {
    return this.usersService.getUserRoles(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireCasl({ action: 'read', subject: 'User' })
  async getUserById(
    @Param('id', new ParseUUIDPipe()) userId: string,
  ): Promise<UserDetailResponse> {
    return this.usersService.getUserById(userId);
  }

  @Put(':id/roles')
  @UseGuards(JwtAuthGuard, AccessGuard)
  @RequireCasl({ action: 'assignRole', subject: 'User' })
  async replaceUserRoles(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Body() dto: ReplaceUserRolesDto,
  ) {
    return this.usersService.replaceUserRoles(userId, dto.roleIds);
  }
}
