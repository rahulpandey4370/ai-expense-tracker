// Who may see a split group. The DB is reached with the service-role key (RLS bypassed),
// so these two functions are the only thing scoping group data — every op goes through them.
import type { SessionUser } from '@/lib/auth/roles';

export interface Access {
  user?: SessionUser;
  /** Group unlocked by a share-link token sent in the x-split-token header. */
  tokenGroupId?: string;
}

export interface MemberRow {
  id: string;
  group_id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  upi_id?: string | null;
  is_owner?: boolean;
  removed_at: string | null;
}

const isMine = (m: MemberRow, user: SessionUser) =>
  !m.removed_at && (m.user_id === user.id || (!!m.email && m.email.toLowerCase() === user.email.toLowerCase()));

export function canSeeGroup(access: Access, groupId: string, members: MemberRow[]): boolean {
  if (access.tokenGroupId === groupId) return true;
  const user = access.user;
  return !!user && members.some(m => m.group_id === groupId && isMine(m, user));
}

/** The member acting: the signed-in user's seat, else the seat a link guest picked. */
export function pickMe(access: Access, members: MemberRow[], asMember?: string | null): MemberRow | null {
  const user = access.user;
  const own = user ? members.find(m => isMine(m, user)) : undefined;
  if (own) return own;
  if (!asMember) return null;
  return members.find(m => m.id === asMember && !m.removed_at) ?? null;
}
