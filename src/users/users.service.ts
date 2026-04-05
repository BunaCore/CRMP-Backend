import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { User, CreateUserInput } from 'src/users/types/user';
import { UserSelectorDto } from 'src/types/selector';

@Injectable()
export class UsersService {
  constructor(private usersRepository: UsersRepository) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async findOne(input: any): Promise<User | null> {
    return this.usersRepository.findOne(input);
  }

  async create(input: CreateUserInput): Promise<User> {
    return this.usersRepository.create(input);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.findAll();
  }

  async update(
    id: string,
    input: Partial<CreateUserInput>,
  ): Promise<User | null> {
    return this.usersRepository.update(id, input);
  }

  async delete(id: string): Promise<boolean> {
    return this.usersRepository.delete(id);
  }

  /**
   * Get all roles assigned to a user
   */
  async getUserRoles(userId: string) {
    return this.usersRepository.getUserRoles(userId);
  }

  /**
   * Check if user is a coordinator of a specific department
   */
  async isCoordinatorOfDepartment(
    userId: string,
    departmentId: string,
  ): Promise<boolean> {
    return this.usersRepository.isCoordinatorOfDepartment(userId, departmentId);
  }

  /**
   * Get all permission keys for a user
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    return this.usersRepository.getUserPermissions(userId);
  }

  /**
   * Get users in selector format (lightweight for dropdowns)
   * Optionally filter by role
   */
  async getSelector(
    searchQuery?: string,
    roleName?: string,
    limit: number = 50,
  ): Promise<UserSelectorDto[]> {
    return this.usersRepository.findForSelector(searchQuery, roleName, limit);
  }

  /**
   * Find multiple users by IDs (bulk query)
   * Useful for avoiding N+1 queries when fetching user details
   *
   * @param userIds Array of user IDs
   * @returns Array of users found
   */
  async findByIds(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.usersRepository.findByIds(userIds);
  }
}
