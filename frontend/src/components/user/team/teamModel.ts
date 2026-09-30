/**
 * frontend/src/components/user/team/teamModel.ts
 *
 * Faz 3 / C2a — ekip yönetimi kuralları (saf; `tests/c2a-team.test.ts`). Sözleşme:
 * docs/cloud-contracts/API_ACCOUNT_LIFECYCLE.md §6 (davet), §7 (askı), §9 (sahiplik devri).
 *
 * UI kuralları YALNIZ görünürlük/önleme ipucudur; asıl sınır sunucudadır (403 / 409 LAST_OWNER vb.) ve sunucu
 * hatası da okunur iletiye çevrilir (`errorCodes.ts`). Kullanıcı listesi satırı bugünkü `UserService/getUsers`
 * projeksiyonudur (`owner`, `isGlobalAdmin`, `roleCode`, `isActive`); üyelik modeli (`role`, `status`) gelirse o öncelikli.
 */

export type MemberRole = 'owner' | 'admin' | 'operator'
export type InvitableRole = Exclude<MemberRole, 'owner'>
export type MemberStatus = 'active' | 'suspended'

/** Tenant admin kademesi sayılan eski rol kodları (`useUser.isTenantAdmin` ile aynı küme). */
const ADMIN_ROLE_CODES = ['ROLE_ADMIN', 'ROLE_OWNER']

export interface MemberRow {
  _id?: string
  email?: string
  name?: string
  surname?: string
  owner?: boolean
  isGlobalAdmin?: boolean
  roleCode?: string
  role?: string
  status?: string
  isActive?: boolean
  emailVerified?: boolean
  [key: string]: unknown
}

export interface CurrentUser {
  _id?: string
  email?: string
  username?: string
  owner?: boolean
  isGlobalAdmin?: boolean
  roleCode?: string
  role?: string
}

export function memberRole(row: MemberRow | CurrentUser | null | undefined): MemberRole {
  if (!row) return 'operator'
  if (row.role === 'owner' || row.owner === true) return 'owner'
  if (row.role === 'admin' || row.isGlobalAdmin === true || ADMIN_ROLE_CODES.includes(String(row.roleCode ?? ''))) return 'admin'
  return 'operator'
}

export function memberStatus(row: MemberRow): MemberStatus {
  if (row.status === 'suspended') return 'suspended'
  if (row.status === 'active') return 'active'
  return row.isActive === false ? 'suspended' : 'active'
}

/** Rol tavanı (§6): `owner` davetle verilemez; kimse kendi kademesinden yüksek rol veremez; operatör davet edemez. */
export function invitableRoles(me: CurrentUser | null | undefined): InvitableRole[] {
  const role = memberRole(me)
  if (role === 'owner' || role === 'admin') return ['admin', 'operator']
  return []
}

const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')

/** Liste satırı oturumdaki kullanıcı mı? (Liste `_id`'si tenant kopyası olabilir → e-posta da karşılaştırılır.) */
export function isSelf(row: MemberRow, me: CurrentUser | null | undefined): boolean {
  if (!me) return false
  if (row._id && me._id && String(row._id) === String(me._id)) return true
  const mine = norm(me.email) || norm(me.username)
  return !!mine && norm(row.email) === mine
}

export function activeOwnerCount(rows: MemberRow[]): number {
  return rows.filter((r) => memberRole(r) === 'owner' && memberStatus(r) === 'active').length
}

export interface Gate {
  allowed: boolean
  /** Neden kapalı — i18n anahtarı (menüde öğe etiketi / ipucu). */
  reasonKey?: string
}

const OPEN: Gate = { allowed: true }

/**
 * Askıya alma (§7): kendine kapalı; sahibe yalnız sahip dokunur; son aktif sahip askıya alınamaz. `ownersInList`
 * yalnız GÖRÜNEN sayfadaki sahip sayısıdır → emin olunamayan durumda açık bırakılır, sunucu 409 LAST_OWNER ile korur.
 */
export function suspendGate(row: MemberRow, me: CurrentUser | null | undefined, ownersInList: number): Gate {
  if (isSelf(row, me)) return { allowed: false, reasonKey: 'team.gates.self' }
  const myRole = memberRole(me)
  if (myRole === 'operator') return { allowed: false, reasonKey: 'team.gates.noPermission' }
  if (memberRole(row) === 'owner') {
    if (myRole !== 'owner') return { allowed: false, reasonKey: 'team.gates.ownerOnly' }
    if (memberStatus(row) === 'active' && ownersInList <= 1) return { allowed: false, reasonKey: 'team.gates.lastOwner' }
  }
  return OPEN
}

/** Yeniden etkinleştirme: kendine ve (sahip değilse) sahibe kapalı. */
export function reactivateGate(row: MemberRow, me: CurrentUser | null | undefined): Gate {
  if (isSelf(row, me)) return { allowed: false, reasonKey: 'team.gates.self' }
  const myRole = memberRole(me)
  if (myRole === 'operator') return { allowed: false, reasonKey: 'team.gates.noPermission' }
  if (memberRole(row) === 'owner' && myRole !== 'owner') return { allowed: false, reasonKey: 'team.gates.ownerOnly' }
  return OPEN
}

/**
 * Sahiplik devri hedefi (§9): yalnız sahip başlatır; hedef aktif üye, sahip değil, kendisi değil. E-posta doğrulaması
 * listede YOKSA bilinmiyor sayılır (sunucu 409 TARGET_EMAIL_UNVERIFIED döner); `false` ise önceden kapatılır.
 */
export function transferTargetGate(row: MemberRow, me: CurrentUser | null | undefined): Gate {
  if (memberRole(me) !== 'owner') return { allowed: false, reasonKey: 'team.gates.ownerOnly' }
  if (isSelf(row, me)) return { allowed: false, reasonKey: 'team.gates.self' }
  if (memberRole(row) === 'owner') return { allowed: false, reasonKey: 'apiErrors.ALREADY_OWNER' }
  if (row.isGlobalAdmin === true) return { allowed: false, reasonKey: 'team.gates.platformAdmin' }
  if (memberStatus(row) !== 'active') return { allowed: false, reasonKey: 'apiErrors.TARGET_NOT_ACTIVE' }
  if (row.emailVerified === false) return { allowed: false, reasonKey: 'apiErrors.TARGET_EMAIL_UNVERIFIED' }
  return OPEN
}

export function displayName(row: MemberRow): string {
  const full = [row.name, row.surname].filter((p) => typeof p === 'string' && p.trim()).join(' ').trim()
  return full || String(row.email ?? '')
}

// ── Davetler (§6) ────────────────────────────────────────────────────────────────────────────────────────────────

export type InvitationStatus = 'pending' | 'accepted' | 'revoked'

export interface Invitation {
  id: string
  email: string
  role: InvitableRole | string
  status: InvitationStatus | string
  expiresAt?: string
  expired?: boolean
  invitedBy?: unknown
  createdAt?: string
}

export function normalizeInvitations(resp: unknown): Invitation[] {
  const list = (resp as any)?.invitations
  if (!Array.isArray(list)) return []
  return list
    .filter((i: any) => i && typeof i === 'object' && (i.id || i._id))
    .map((i: any) => ({ ...i, id: String(i.id ?? i._id) }))
}

/** Süresi dolmuş sayılır mı? (`expired` bayrağı öncelikli; yoksa `expiresAt` ile.) */
export function invitationExpired(inv: Invitation, now: number = Date.now()): boolean {
  if (typeof inv.expired === 'boolean') return inv.expired
  const t = inv.expiresAt ? Date.parse(inv.expiresAt) : NaN
  return Number.isFinite(t) && t <= now
}

/** Kalan gün (yukarı yuvarlanır; ≤0 → 0). */
export function daysLeft(expiresAt: string | undefined, now: number = Date.now()): number | null {
  const t = expiresAt ? Date.parse(expiresAt) : NaN
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.ceil((t - now) / 86_400_000))
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase()
}
