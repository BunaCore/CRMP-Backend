import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { User, CreateUserInput } from 'src/users/types/user';

@Injectable()
export class UsersService {
  constructor(private usersRepository: UsersRepository) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
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
}
