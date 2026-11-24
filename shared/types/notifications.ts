export type Notification = {
  id: string;
  type: "LISTING_APPROVED" | "LISTING_REJECTED" | "SALE_CONFIRMED" | "SALE_REJECTED" | "NEW_MESSAGE";
  carTitle: string;
  conversationId: string | null;
  reason: string | null;
  readAt: string | null;
  createdAt: string;
};
