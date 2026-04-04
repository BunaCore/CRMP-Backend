import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserSelectorDto } from 'src/types/selector';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
