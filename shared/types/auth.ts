export type AuthUser = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: "USER" | "ADMIN";
  phone: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  city: string | null;
  createdAt: string;
};

export type ProfileUpdate = {
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string;
  city: string;
  avatarUrl: string;
};
