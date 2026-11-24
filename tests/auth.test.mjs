import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { hashPassword, verifyPassword } from "../server/utils/password.ts";
import { loginSchema, registrationSchema } from "../server/validators/auth.ts";
import { changePasswordSchema, profileSchema } from "../server/validators/profile.ts";

test("Argon2 hashes verify the correct password only", async () => {
  const hash = await hashPassword("test-password-123");
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword("test-password-123", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("existing scrypt hashes remain verifiable", async () => {
  const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const key = scryptSync("test-password-123", salt, 64);
  const hash = `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
  assert.equal(await verifyPassword("test-password-123", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("authentication input is validated and email is normalized", () => {
  const result = registrationSchema.safeParse({
    firstName: " Alex ",
    lastName: "",
    email: " USER@example.test ",
    password: "test-password-123",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.email, "user@example.test");
  assert.equal(registrationSchema.safeParse({ ...result.data, password: "short" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "not-an-email", password: "test-password-123" }).success, false);
});

test("profile details are normalized and invalid country codes or avatar URLs are rejected", () => {
  const profile = {
    firstName: " Alice ",
    lastName: "",
    phone: " +49 123 ",
    countryCode: "de",
    city: " Berlin ",
    avatarUrl: "https://example.test/avatar.png",
  };
  const result = profileSchema.safeParse(profile);
  assert.equal(result.success, true);
  assert.equal(result.data.firstName, "Alice");
  assert.equal(result.data.lastName, null);
  assert.equal(result.data.countryCode, "DE");
  assert.equal(profileSchema.safeParse({ ...profile, countryCode: "DEU" }).success, false);
  assert.equal(profileSchema.safeParse({ ...profile, avatarUrl: "javascript:alert(1)" }).success, false);
});

test("password changes require both the current password and a valid new password", () => {
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "", newPassword: "long-enough" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "current", newPassword: "short" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "current", newPassword: "long-enough" }).success, true);
});
