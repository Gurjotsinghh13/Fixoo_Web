// ─── AUTH TYPES ─────────────────────────────────────────────
export type UserRole = "customer" | "partner" | "admin";
export type AdminRole = "SUPER_ADMIN" | "TENANT_OWNER" | "STAFF";

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
  role: UserRole;
  tenantId: string;
  adminRole?: AdminRole;
}

export interface AuthPartner {
  id: string;
  phone: string;
  name: string;
  shopName: string;
  isApproved: boolean;
  role: "partner";
}

// ─── REQUEST STATUS ──────────────────────────────────────────
export type RequestStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "ON_THE_WAY"
  | "ARRIVED"
  | "REPAIR_IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

// ─── VEHICLE & SERVICE ───────────────────────────────────────
export interface VehicleType {
  id: string;
  name: string;
  displayName: string;
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Service {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  icon?: string | null;
  category: string;
  isActive: boolean;
}

export interface ServicePricing {
  id: string;
  serviceId: string;
  vehicleTypeId: string;
  serviceFee: number;
  platformFee: number;
  nightSurcharge: number;
  etaMin: number;
  etaMax: number;
  totalAmount: number;
  isNight: boolean;
}

// ─── SERVICE REQUEST ─────────────────────────────────────────
export interface ServiceRequest {
  id: string;
  userId: string;
  partnerId?: string | null;
  serviceId: string;
  vehicleTypeId: string;
  status: RequestStatus;
  latitude: number;
  longitude: number;
  address?: string | null;
  area?: string | null;
  serviceFee: number;
  platformFee: number;
  nightSurcharge: number;
  totalAmount: number;
  searchRadius: number;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  estimatedEtaSeconds?: number | null;
  estimatedDistanceKm?: number | null;
  etaUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    phone: string;
    name?: string | null;
  };
  partner?: {
    id: string;
    name: string;
    shopName: string;
    phone: string;
    rating: number;
    totalJobs: number;
    location?: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      heading?: number | null;
      speed?: number | null;
      lastSeenAt?: string;
    } | null;
  } | null;
  feedback?: {
    rating: number;
    comment?: string | null;
    createdAt: string;
  } | null;
  service?: Service;
  vehicleType?: VehicleType;
}

// ─── PARTNER ─────────────────────────────────────────────────
export interface Partner {
  id: string;
  phone: string;
  name: string;
  shopName: string;
  address?: string | null;
  serviceRadius: number;
  isOnline: boolean;
  isApproved: boolean;
  isSuspended: boolean;
  rating: number;
  totalJobs: number;
  completedJobs: number;
  acceptanceRate: number;
  createdAt: string;
  location?: {
    latitude: number;
    longitude: number;
  } | null;
}

// ─── SOCKET EVENTS ───────────────────────────────────────────
export interface BroadcastPayload {
  requestId: string;
  serviceName: string;
  vehicleType: string;
  distance: number;
  area: string;
  earning: number;
  expiresAt: number;
}

export interface RequestAcceptedPayload {
  requestId: string;
  partnerName: string;
  shopName: string;
  partnerPhone: string;
  eta: string;
  rating: number;
}

export interface StatusUpdatePayload {
  requestId: string;
  status: RequestStatus;
  timestamp: string;
}

// ─── API RESPONSE ────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─── ADMIN ANALYTICS ─────────────────────────────────────────
export interface AdminAnalytics {
  requestsToday: number;
  requestsThisWeek: number;
  completedToday: number;
  cancelledToday: number;
  revenueToday: number;
  revenueThisWeek: number;
  activePartners: number;
  totalPartners: number;
  avgAcceptanceTime: number;
  completionRate: number;
}
