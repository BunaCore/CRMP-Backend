import { Injectable } from '@nestjs/common';
import { DepartmentsRepository } from './departments.repository';
import { DepartmentSelectorDto } from 'src/types/selector';

@Injectable()
export class DepartmentsService {
  constructor(private readonly repository: DepartmentsRepository) {}

  /**
   * Get departments in selector format (lightweight for dropdowns)
   */
  async getSelector(
    searchQuery?: string,
    limit: number = 50,
  ): Promise<DepartmentSelectorDto[]> {
    const departments = await this.repository.findAll();

    let filtered = departments;

    // Filter by search query (search in name and code)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = departments.filter(
        (d) =>
          d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q),
      );
    }

    // Apply limit
    filtered = filtered.slice(0, limit);

    // Map to selector format
    return filtered.map((d) => ({
      label: d.name,
      value: d.id,
    }));
  }

  /**
   * Get all departments with full details
   */
  async getAll() {
    return this.repository.findAll();
  }
}
