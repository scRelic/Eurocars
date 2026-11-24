export type Conversation = {
  id: string;
  carId: string;
  carTitle: string;
  carStatus: string;
  otherId: string;
  otherName: string;
  otherAvatarUrl: string | null;
  lastMessage: string | null;
  updatedAt: string;
  unread: number;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
};
