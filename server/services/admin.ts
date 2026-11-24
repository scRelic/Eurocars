import type { Pool } from "pg";
import type { AccountStatus, AdminListingStatus } from "../repositories/admin";
import { appendAuditLog, getAdminCar, getAdminDealer, getAdminUser } from "../repositories/admin";
import { lockListingImages, updateListingImageVisibility } from "./images/listing-image-state.service";

const listingTransitions: Record<AdminListingStatus, AdminListingStatus[]> = {
  DRAFT: ["PENDING", "ARCHIVED"],
  PENDING: ["ACTIVE", "REJECTED", "ARCHIVED"],
  ACTIVE: ["SOLD", "ARCHIVED"],
  SOLD: ["ACTIVE", "ARCHIVED"],
  REJECTED: ["PENDING", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export const changeAdminListingStatus = async (
  database: Pool,
  adminId: string,
  carId: string,
  nextStatus: AdminListingStatus,
  reason?: string,
) => {
  if (nextStatus === "REJECTED" && !reason?.trim()) {
    throw createError({ statusCode: 400, statusMessage: "A rejection reason is required." });
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await lockListingImages(client, carId);
    const result = await client.query<{ status: AdminListingStatus; saleConfirmationStatus: string; sellerId: string }>(
      `SELECT status, sale_confirmation_status AS "saleConfirmationStatus", seller_id::text AS "sellerId"
       FROM cars WHERE id = $1 FOR UPDATE`,
      [carId],
    );
    const current = result.rows[0];
    if (!current) throw createError({ statusCode: 404, statusMessage: "Listing not found." });
    if (current.status === "SOLD" && current.saleConfirmationStatus === "PENDING" && nextStatus === "ACTIVE") {
      throw createError({ statusCode: 409, statusMessage: "Review this sale from the moderation confirmation queue." });
    }
    if (!listingTransitions[current.status].includes(nextStatus)) {
      throw createError({ statusCode: 409, statusMessage: `A listing cannot move from ${current.status} to ${nextStatus}.` });
    }

    await client.query(
      `UPDATE cars
       SET status = $1::VARCHAR(20),
           published_at = CASE WHEN $1::VARCHAR(20) = 'ACTIVE' THEN COALESCE(published_at, NOW()) ELSE published_at END,
           moderation_reason = CASE
             WHEN $1::VARCHAR(20) = 'REJECTED' THEN $2
             WHEN $1::VARCHAR(20) = 'PENDING' THEN NULL
             ELSE moderation_reason
           END,
           reviewed_by = CASE WHEN $1::VARCHAR(20) IN ('ACTIVE', 'REJECTED') THEN $3
             WHEN $1::VARCHAR(20) = 'PENDING' THEN NULL ELSE reviewed_by END,
           reviewed_at = CASE WHEN $1::VARCHAR(20) IN ('ACTIVE', 'REJECTED') THEN NOW()
             WHEN $1::VARCHAR(20) = 'PENDING' THEN NULL ELSE reviewed_at END,
           sale_confirmation_status = CASE
             WHEN $1::VARCHAR(20) = 'SOLD' THEN 'CONFIRMED'
             WHEN $5::VARCHAR(20) = 'SOLD' AND $1::VARCHAR(20) <> 'SOLD' THEN 'NOT_REQUESTED'
             ELSE sale_confirmation_status
           END,
           sale_confirmation_reason = CASE
             WHEN $1::VARCHAR(20) = 'SOLD' OR ($5::VARCHAR(20) = 'SOLD' AND $1::VARCHAR(20) <> 'SOLD') THEN NULL
             ELSE sale_confirmation_reason
           END,
           sale_reviewed_by = CASE
             WHEN $1::VARCHAR(20) = 'SOLD' THEN $3
             WHEN $5::VARCHAR(20) = 'SOLD' AND $1::VARCHAR(20) <> 'SOLD' THEN NULL
             ELSE sale_reviewed_by
           END,
           sale_reviewed_at = CASE
             WHEN $1::VARCHAR(20) = 'SOLD' THEN NOW()
             WHEN $5::VARCHAR(20) = 'SOLD' AND $1::VARCHAR(20) <> 'SOLD' THEN NULL
             ELSE sale_reviewed_at
           END,
           updated_at = NOW()
       WHERE id = $4`,
      [nextStatus, reason?.trim() || null, adminId, carId, current.status],
    );
    await updateListingImageVisibility(client, carId, nextStatus);

    const action = nextStatus === "SOLD"
      ? "SALE_CONFIRMED"
      : nextStatus === "ACTIVE" && current.status === "PENDING"
        ? "LISTING_APPROVED"
        : nextStatus === "REJECTED"
          ? "LISTING_REJECTED"
          : nextStatus === "ARCHIVED"
            ? "LISTING_ARCHIVED"
            : "LISTING_STATUS_CHANGED";
    await appendAuditLog(client, adminId, action, "CAR", carId, {
      previousStatus: current.status,
      newStatus: nextStatus,
      ...(nextStatus === "REJECTED" ? { reason: reason!.trim() } : {}),
    });
    if (current.status === "PENDING" && (nextStatus === "ACTIVE" || nextStatus === "REJECTED")) {
      await client.query(
        `INSERT INTO notifications (user_id, type, car_id, reason) VALUES ($1, $2, $3, $4)`,
        [current.sellerId, nextStatus === "ACTIVE" ? "LISTING_APPROVED" : "LISTING_REJECTED", carId,
          nextStatus === "REJECTED" ? reason!.trim() : null],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const listing = await getAdminCar(database, carId);
  if (!listing) throw createError({ statusCode: 500, statusMessage: "Unable to load the updated listing." });
  return listing;
};

export const reviewSaleConfirmation = async (
  database: Pool,
  adminId: string,
  carId: string,
  decision: "CONFIRM" | "REJECT",
  reason?: string,
) => {
  const rejectionReason = reason?.trim();
  if (decision === "REJECT" && !rejectionReason) {
    throw createError({ statusCode: 400, statusMessage: "A reason is required to reject a sale confirmation." });
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await lockListingImages(client, carId);
    const result = await client.query<{ status: AdminListingStatus; saleConfirmationStatus: string; sellerId: string }>(
      `SELECT status, sale_confirmation_status AS "saleConfirmationStatus", seller_id::text AS "sellerId"
       FROM cars WHERE id = $1 FOR UPDATE`,
      [carId],
    );
    const current = result.rows[0];
    if (!current) throw createError({ statusCode: 404, statusMessage: "Listing not found." });
    if (current.status !== "SOLD" || current.saleConfirmationStatus !== "PENDING") {
      throw createError({ statusCode: 409, statusMessage: "This sale is no longer waiting for confirmation." });
    }

    const confirmed = decision === "CONFIRM";
    await client.query(
      `UPDATE cars
       SET status = CASE WHEN $1 THEN 'SOLD' ELSE 'ACTIVE' END,
           sale_confirmation_status = CASE WHEN $1 THEN 'CONFIRMED' ELSE 'REJECTED' END,
           sale_confirmation_reason = CASE WHEN $1 THEN NULL ELSE $2 END,
           sale_reviewed_by = $3,
           sale_reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [confirmed, rejectionReason ?? null, adminId, carId],
    );
    await updateListingImageVisibility(client, carId, confirmed ? "SOLD" : "ACTIVE");
    await appendAuditLog(
      client,
      adminId,
      confirmed ? "SALE_CONFIRMED" : "SALE_REJECTED",
      "CAR",
      carId,
      { decision, ...(confirmed ? {} : { reason: rejectionReason }) },
    );
    await client.query(
      `INSERT INTO notifications (user_id, type, car_id, reason) VALUES ($1, $2, $3, $4)`,
      [current.sellerId, confirmed ? "SALE_CONFIRMED" : "SALE_REJECTED", carId, confirmed ? null : rejectionReason],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const listing = await getAdminCar(database, carId);
  if (!listing) throw createError({ statusCode: 500, statusMessage: "Unable to load the reviewed listing." });
  return listing;
};

export const changeAdminUserStatus = async (
  database: Pool,
  adminId: string,
  userId: string,
  nextStatus: AccountStatus,
) => {
  if (adminId === userId) {
    throw createError({ statusCode: 409, statusMessage: "You cannot suspend your own administrator account." });
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ accountStatus: AccountStatus }>(
      `SELECT account_status AS "accountStatus"
       FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [userId],
    );
    const current = result.rows[0]?.accountStatus;
    if (!current) throw createError({ statusCode: 404, statusMessage: "User not found." });
    if (current === nextStatus) {
      throw createError({ statusCode: 409, statusMessage: `This account is already ${nextStatus.toLowerCase()}.` });
    }

    await client.query(
      "UPDATE users SET account_status = $1, updated_at = NOW() WHERE id = $2",
      [nextStatus, userId],
    );
    if (nextStatus === "SUSPENDED") {
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
        [userId],
      );
    }
    await appendAuditLog(client, adminId, nextStatus === "SUSPENDED" ? "USER_SUSPENDED" : "USER_REACTIVATED",
      "USER", userId, { previousStatus: current, newStatus: nextStatus });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const user = await getAdminUser(database, userId);
  if (!user) throw createError({ statusCode: 500, statusMessage: "Unable to load the updated user." });
  return user;
};

export const changeAdminDealerVerification = async (
  database: Pool,
  adminId: string,
  dealerId: string,
  verified: boolean,
) => {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ isVerified: boolean }>(
      "SELECT is_verified AS \"isVerified\" FROM dealers WHERE id = $1 FOR UPDATE",
      [dealerId],
    );
    const current = result.rows[0]?.isVerified;
    if (current === undefined) throw createError({ statusCode: 404, statusMessage: "Dealership not found." });
    if (current === verified) {
      throw createError({ statusCode: 409, statusMessage: `This dealership is already ${verified ? "verified" : "unverified"}.` });
    }

    await client.query("UPDATE dealers SET is_verified = $1, updated_at = NOW() WHERE id = $2", [verified, dealerId]);
    await appendAuditLog(client, adminId, verified ? "DEALER_VERIFIED" : "DEALER_UNVERIFIED",
      "DEALER", dealerId, { previousIsVerified: current, isVerified: verified });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const dealer = await getAdminDealer(database, dealerId);
  if (!dealer) throw createError({ statusCode: 500, statusMessage: "Unable to load the updated dealership." });
  return dealer;
};
