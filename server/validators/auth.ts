import { z } from "zod";

const email = z.string().trim().max(255).email().transform((value) => value.toLowerCase());
const password = z.string().min(8).max(128);

export const registrationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).default(""),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().default(false),
});
