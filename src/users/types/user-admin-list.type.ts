import { PaginatedResponse } from 'src/common/pagination/types/pagination.type';
import { AccountStatus } from './user';

export type UserRoleItem = {
  id: string;
  name: string;
};

export type UserAdminListItem = {
  id: string;
  fullName: string | null;
  email: string;
  departmentId: string | null;
  departmentName: string | null;
  universityId: string | null;
  phoneNumber: string | null;
  isExternal: boolean;
  accountStatus: AccountStatus;
  avatarUrl: string | null;
  roles: UserRoleItem[];
  createdAt: Date | null;
};

export type UsersListResponse = PaginatedResponse<UserAdminListItem>;
