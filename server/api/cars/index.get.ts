import { z } from "zod";
import { getPublicCars } from "../../repositories/public-cars";
import { getDatabase } from "../../utils/db";

const querySchema = z.object({
  brand: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  minPrice: z.coerce.number().finite().min(0).optional(),
  maxPrice: z.coerce.number().finite().min(0).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(["recommended", "price-asc", "price-desc", "year-desc", "mileage-asc"]).default("recommended"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
}).refine((value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, {
  message: "Minimum price cannot exceed maximum price.",
});

export default defineEventHandler(async (event) => {
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Check the catalog filters and try again." });
  setResponseHeader(event, "Cache-Control", "public, max-age=30");
  return await getPublicCars(getDatabase(event), parsed.data);
});
