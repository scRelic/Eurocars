export type AdminStats = {
  totalUsers: number;
  totalListings: number;
  activeListings: number;
  pendingListings: number;
  verifiedDealers: number;
  newUsers: number;
  newListings: number;
};

export type AdminListingTrend = {
  date: string;
  count: number;
};

export type AdminPendingListing = {
  id: string;
  title: string;
  brand: string;
  model: string;
  price: number;
  currency: string;
  year: number;
  mileage: number;
  country: string;
  city: string;
  sellerName: string;
  sellerEmail: string;
  imageUrl: string | null;
  submittedAt: string;
};

export type AdminCarImage = {
  id: string;
  url: string;
  isPrimary: boolean;
  position: number;
};

export type AdminCar = {
  id: string;
  title: string;
  brand: string;
  model: string;
  trim: string | null;
  price: number;
  currency: string;
  year: number;
  mileage: number;
  status: "DRAFT" | "PENDING" | "ACTIVE" | "SOLD" | "REJECTED" | "ARCHIVED";
  country: string;
  countryCode: string;
  city: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  views: number;
  imageUrl: string | null;
  images?: AdminCarImage[];
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSaleConfirmation = AdminCar;

export type AdminCarDetail = AdminCar & {
  description: string | null;
  fuelType: string;
  transmission: string;
  bodyType: string | null;
  condition: string;
  engineCapacityCc: number | null;
  powerHp: number | null;
  doors: number | null;
  seats: number | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  postalCode: string | null;
  moderationReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  saleConfirmationStatus: "NOT_REQUESTED" | "PENDING" | "CONFIRMED" | "REJECTED";
  images: AdminCarImage[];
  features: string[];
};

export type AdminUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  accountStatus: "ACTIVE" | "SUSPENDED";
  countryCode: string | null;
  city: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  listingCount: number;
};

export type AdminDealer = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  phone: string | null;
  logoUrl: string | null;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  address: string | null;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  ownerName: string;
  ownerEmail: string;
  listingCount: number;
};

export type AdminAuditLog = {
  id: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AdminPageResult<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AdminDashboardData = {
  stats: AdminStats;
  listingTrend: AdminListingTrend[];
  pendingListings: AdminPendingListing[];
};

export type AdminAnalytics = {
  trend: { date: string; listings: number; users: number }[];
  brands: { name: string; count: number }[];
  countries: { code: string; name: string; count: number }[];
  statuses: { status: string; count: number }[];
  recentUsers: { id: string; firstName: string | null; lastName: string | null; email: string; role: string; accountStatus: string; createdAt: string }[];
  activity: { id: string; kind: string; description: string; createdAt: string }[];
  pendingSales: number;
  viewsAvailable: boolean;
};

export type AdminHealth = {
  database: { status: "Healthy" | "Unavailable"; durationMs: number | null };
  uptimeSeconds: number;
  checkedAt: string;
};
