import { Controller, Get, Query } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { DepartmentSelectorDto } from 'src/types/selector';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  /**
   * GET /departments/selector
   * Get lightweight department list for dropdowns/selectors
   * Query params:
   *   - q: Search by name or code
   *   - limit: Max results (default: 50)
   */
  @Get('selector')
  async getSelector(
    @Query('q') searchQuery?: string,
    @Query('limit') limit?: string,
  ): Promise<DepartmentSelectorDto[]> {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 200) : 50;
    return this.service.getSelector(searchQuery, parsedLimit);
  }

  /**
   * GET /departments
   * Get all departments with full details
   */
  @Get()
  async getAll() {
    return this.service.getAll();
  }
}
