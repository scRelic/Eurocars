import { z } from "zod";

export const idSchema = z.string().regex(/^[1-9]\d{0,18}$/)
  .refine((value) => value.length < 19 || value <= "9223372036854775807");
const optionalText = (max: number) => z.string().trim().max(max);
const optionalNumber = z.number().int().min(1).max(2147483647).nullable();

export const listingSchema = z.object({
  brandId: idSchema,
  modelId: idSchema,
  dealerId: idSchema.nullable(),
  title: z.string().trim().min(1).max(255),
  trim: optionalText(255),
  description: optionalText(20000),
  price: z.number().finite().min(0).max(999999999999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001),
  currency: z.enum(["EUR", "GBP", "CHF"]),
  year: z.number().int().min(1886).max(2100),
  mileage: z.number().int().min(0).max(2147483647),
  fuelType: z.enum(["PETROL", "DIESEL", "ELECTRIC", "HYBRID", "PLUGIN_HYBRID", "LPG", "CNG", "HYDROGEN", "OTHER"]),
  transmission: z.enum(["MANUAL", "AUTOMATIC"]),
  bodyType: z.enum(["SEDAN", "SUV", "HATCHBACK", "WAGON", "COUPE", "CONVERTIBLE", "VAN", "PICKUP", "OTHER"]).nullable(),
  condition: z.enum(["NEW", "USED", "DAMAGED"]),
  engineCapacityCc: optionalNumber,
  powerHp: optionalNumber,
  doors: z.number().int().min(1).max(8).nullable().optional(),
  seats: z.number().int().min(1).max(20).nullable().optional(),
  firstRegistration: z.iso.date().refine((value) => !value.startsWith("0000-")).nullable().optional(),
  exteriorColor: optionalText(50),
  interiorColor: optionalText(50),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  city: z.string().trim().min(1).max(150),
  postalCode: optionalText(20),
  featureIds: z.array(idSchema).max(100).refine((ids) => new Set(ids).size === ids.length),
}).strict();

export const createListingSchema = z.object({
  listing: listingSchema,
  status: z.enum(["DRAFT", "PENDING"]),
}).strict();

export const updateListingSchema = z.object({
  listing: listingSchema.optional(),
  status: z.enum(["DRAFT", "PENDING", "SOLD", "ARCHIVED"]).optional(),
}).strict().refine((value) => value.listing !== undefined || value.status !== undefined);
