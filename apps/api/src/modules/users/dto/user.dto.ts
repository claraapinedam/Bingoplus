import { User } from '@prisma/client';

export interface UserDto {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roles: string[];
  isActive: boolean;
  ratingAvg: number;
  reviewCount: number;
  createdAt: Date;
}

export function toUserDto(user: User, roles: string[]): UserDto {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    roles,
    isActive: user.isActive,
    ratingAvg: user.ratingAvg,
    reviewCount: user.reviewCount,
    createdAt: user.createdAt,
  };
}
