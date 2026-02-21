export type AccountStatus = 'active' | 'deactive' | 'suspended';

export interface User {
  id: string;
  fullName?: string | null;
  email: string;
  passwordHash: string;
  department?: string | null;
  phoneNumber?: string | null;
  university?: string | null;
  universityId?: string | null;
  role: string;
  accountStatus: AccountStatus;
  createdAt?: Date | null;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName?: string;
  department?: string;
  phoneNumber?: string;
  university?: string;
  universityId?: string;
  role?: string;
  accountStatus?: AccountStatus;
}

export interface FindUserInput {
  email?: string;
  id?: string;
}
