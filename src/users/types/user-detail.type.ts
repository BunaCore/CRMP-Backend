export type UserDepartmentCoordination = {
  isCoordinator: boolean;
  departments: Array<{
    id: string;
    name: string;
    code: string;
    assignedAt: Date | null;
  }>;
};

export type UserDetailResponse = {
  id: string;
  fullName: string | null;
  email: string;
  departmentId: string | null;
  departmentName: string | null;
  universityId: string | null;
  university: string | null;
  phoneNumber: string | null;
  isExternal: boolean;
  accountStatus: 'active' | 'deactive' | 'suspended';
  avatarUrl: string | null;
  roles: Array<{
    id: string;
    name: string;
    grantedAt: Date | null;
  }>;
  departmentCoordination: UserDepartmentCoordination;
  createdAt: Date | null;
};
