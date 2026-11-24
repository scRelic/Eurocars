import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);

export const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: optionalText(100),
  phone: optionalText(30),
  countryCode: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).transform((value) => value || null),
  city: optionalText(150),
  avatarUrl: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    if (/^\/api\/users\/[1-9]\d{0,18}\/avatar\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) return true;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }).transform((value) => value || null),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
