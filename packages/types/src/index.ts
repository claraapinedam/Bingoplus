/**
 * Shared types mirrored from the API's Prisma schema (apps/api/prisma/schema.prisma).
 * Frontend apps and the API both import from here so contracts can't silently drift.
 */

export enum RoleName {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  BUSINESS_OWNER = 'BUSINESS_OWNER',
  BUSINESS_STAFF = 'BUSINESS_STAFF',
  RIDER = 'RIDER',
  CUSTOMER = 'CUSTOMER',
}

export enum BusinessStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
  ACTIVE = 'ACTIVE',
}

export enum OrderStatus {
  CREATED = 'CREATED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAID = 'PAID',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  SEARCHING_RIDER = 'SEARCHING_RIDER',
  RIDER_ASSIGNED = 'RIDER_ASSIGNED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum RiderStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
  SUSPENDED = 'SUSPENDED',
}

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

export interface ApiSuccess<T> {
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export interface UserDto {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roles: RoleName[];
  isActive: boolean;
  ratingAvg: number;
  reviewCount: number;
  createdAt: string;
}

export interface PetDto {
  id: string;
  ownerId: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  birthDate: string | null;
  weight: number | null;
  photoUrl: string | null;
  allergies: string[];
  foodPreferences: string[];
  medicalNotes: string | null;
  veterinarian: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessDto {
  id: string;
  ownerId: string;
  categoryId: string;
  tradeName: string;
  legalName: string;
  taxId: string;
  email: string;
  phone: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  addressLine: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  status: BusinessStatus;
  ratingAvg: number;
  reviewCount: number;
  createdAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
