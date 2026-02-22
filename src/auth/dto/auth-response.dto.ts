export class AuthResponseDto {
  access_token: string;
  user?: {
    id: string;
    email: string;
    fullName?: string | null;
    department?: string | null;
    phoneNumber?: string | null;
    university?: string | null;
    universityId?: string | null;
    role: string;
    accountStatus: string;
    createdAt?: Date | null;
  };
}
