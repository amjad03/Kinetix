/** Staff chat (API: chat.controller.ts). */
export interface ChatThread {
  id: string;
  kind: 'direct' | 'group' | 'external';
  title: string;
  description: string;
  channel: 'email' | 'whatsapp' | null;
  contactName: string | null;
  contactAddress: string | null;
  contactKind: 'parent' | 'vendor' | 'university' | 'other' | null;
  pinned: boolean;
  createdAt: string;
  lastMessageAt: string | null;
  peer: { id: string; fullName: string } | null;
  memberCount: number;
  lastMessage: { body: string; senderName: string | null; direction: string; attachment: boolean } | null;
  unread: number;
  replyTo?: string | null;
  /** Class and club groups (v1/chat/groups/linked): who may post, quiet hours and the caller's role. */
  linkedKind?: 'section' | 'club' | null;
  postPolicy?: 'all' | 'admins';
  quietStart?: string | null;
  quietEnd?: string | null;
  myRole?: string;
}
export interface ChatMember {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  lastReadAt: string | null;
  roles: string[] | null;
}
export interface ChatMessage {
  id: string;
  senderId: string | null;
  senderName: string | null;
  direction: 'internal' | 'outbound' | 'inbound';
  body: string;
  externalFrom: string | null;
  delivery: 'sent' | 'queued' | 'failed' | null;
  attachment: { name: string; type: string; size: number } | null;
  createdAt: string;
}
export interface ChatPerson {
  id: string;
  fullName: string;
  email: string | null;
  roles: string[];
}
export const threadName = (t: ChatThread) => (t.kind === 'direct' ? (t.peer?.fullName ?? '') : t.kind === 'external' ? t.title || t.contactName || '' : t.title);
