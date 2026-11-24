import { z } from "zod";

export const adminIdSchema = z.string().regex(/^[1-9]\d{0,18}$/);
export const adminPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const adminCarsQuerySchema = adminPageSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["DRAFT", "PENDING", "ACTIVE", "SOLD", "REJECTED", "ARCHIVED"]).optional(),
  country: z.string().trim().length(2).optional(),
  sort: z.enum(["newest", "oldest", "price-asc", "price-desc", "year-desc"]).default("newest"),
}).strict();

export const adminUsersQuerySchema = adminPageSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
}).strict();

export const adminDealersQuerySchema = adminPageSchema.extend({
  search: z.string().trim().max(120).optional(),
  verified: z.enum(["VERIFIED", "UNVERIFIED"]).optional(),
  sort: z.enum(["newest", "oldest", "name-asc"]).default("newest"),
}).strict();

export const adminListingStatusSchema = z.object({
  status: z.enum(["DRAFT", "PENDING", "ACTIVE", "SOLD", "REJECTED", "ARCHIVED"]),
  reason: z.string().trim().max(2000).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "REJECTED" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A rejection reason is required." });
  }
});

export const adminUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
}).strict();

export const adminDealerVerificationSchema = z.object({
  verified: z.boolean(),
}).strict();

export const adminSaleDecisionSchema = z.object({
  decision: z.enum(["CONFIRM", "REJECT"]),
  reason: z.string().trim().max(2000).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "REJECT" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A reason is required to reject a sale confirmation." });
  }
});
