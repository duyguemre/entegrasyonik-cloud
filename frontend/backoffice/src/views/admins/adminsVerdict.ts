/** Yöneticiler — sayfa hükmü (K51). Saf: girdi okunan liste, çıktı `PageVerdict`. */
import type { RouteLocationRaw } from 'vue-router'
import type { PlatformAdmin } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount } from '@bo/utils/units'

/** Davet bağlantısı 48 saat geçerlidir (davet diyaloğundaki söz ile aynı). */
export const INVITE_TTL_MS = 48 * 3_600_000
/** Davetin bitmesine bu kadar kala "süresi dolmak üzere" sayılır (yarım iş günü). */
export const INVITE_EXPIRING_MS = 6 * 3_600_000
/** Etkin hesap bu kadar gündür giriş yapmadıysa bilgi maddesi (çeyrek yıl). */
export const IDLE_DAYS = 90

export type AdminFilter = 'all' | 'nomfa' | 'locked' | 'invites' | 'idle'

export interface AdminsVerdictInput {
  items: PlatformAdmin[] | null
  failed: boolean
  stale?: boolean
  /** Karşılaştırma anı (test için dışarıdan verilir). */
  now: number
  retry: () => void
  /** Aynı sayfada tabloyu süzen göreli konum (`?filtre=`); sayfa mevcut sorguyu korur. */
  filterTo: (f: AdminFilter) => RouteLocationRaw
  /** Aynı sayfada davet diyaloğunu açan konum (`?davet=1`). */
  inviteTo: RouteLocationRaw
  /** Davet diyaloğunu aç (yerinde, guarded). */
  invite: () => void
}

const DAY_MS = 86_400_000
export const inviteExpiresAt = (a: PlatformAdmin) => Date.parse(a.createdAt) + INVITE_TTL_MS

/** Tablo süzgeci — hüküm maddeleri ve sayfa aynı tanımı kullanır. */
export function matchesFilter(a: PlatformAdmin, f: AdminFilter, now: number): boolean {
  if (f === 'all') return true
  if (f === 'nomfa') return a.status === 'active' && !a.mfaEnabled
  if (f === 'locked') return a.status === 'active' && a.locked
  if (f === 'invites') return a.status === 'invited'
  return isIdle(a, now)
}

export function isIdle(a: PlatformAdmin, now: number): boolean {
  if (a.status !== 'active') return false
  // Hiç giriş yapmadıysa sayaç hesabın açılışından başlar.
  const last = Date.parse(a.lastLoginAt ?? a.createdAt)
  return now - last > IDLE_DAYS * DAY_MS
}

export function adminsVerdict(i: AdminsVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const list = i.items ?? []
  const active = list.filter((a) => a.status === 'active')
  const invites = list.filter((a) => a.status === 'invited')
  const noMfa = list.filter((a) => matchesFilter(a, 'nomfa', i.now))
  const locked = list.filter((a) => matchesFilter(a, 'locked', i.now))
  const expired = invites.filter((a) => inviteExpiresAt(a) <= i.now)
  const expiring = invites.filter((a) => inviteExpiresAt(a) > i.now && inviteExpiresAt(a) - i.now <= INVITE_EXPIRING_MS)
  const idle = list.filter((a) => isIdle(a, i.now))

  if (i.items) {
    if (noMfa.length)
      attention.push({
        id: 'no-mfa',
        tone: 'error',
        title: noMfa.length === 1 ? 'Bir etkin yöneticide iki adımlı doğrulama kurulmamış' : `${formatCount(noMfa.length)} etkin yöneticide iki adımlı doğrulama kurulmamış`,
        impact: 'Parolası ele geçirilen hesap tüm platformu yönetebilir.',
        advice: 'Hesap sahibinden kurulumu tamamlamasını isteyin ya da hesabı devre dışı bırakın.',
        cta: 'Hesapları aç',
        to: i.filterTo('nomfa'),
      })
    if (!active.length)
      attention.push({ id: 'no-active', tone: 'error', title: 'Etkin yönetici yok', impact: 'Platform şu an yönetilemiyor.', advice: 'Yeni bir yönetici davet edin.', cta: 'Davet et', to: i.inviteTo })
    else if (active.length === 1)
      attention.push({
        id: 'single-admin',
        tone: 'warning',
        title: 'Platformda tek etkin yönetici var',
        impact: 'Bu hesap kilitlenir ya da kapanırsa platforma erişim kalmaz.',
        advice: 'Yedek bir yönetici davet edin.',
        cta: 'Davet et',
        to: i.inviteTo,
      })
    if (locked.length)
      attention.push({
        id: 'locked',
        tone: 'warning',
        title: locked.length === 1 ? 'Bir hesap parola kilidi nedeniyle giriş yapamıyor' : `${formatCount(locked.length)} hesap parola kilidi nedeniyle giriş yapamıyor`,
        impact: 'Hatalı parola denemeleri hesabı kilitledi; kişi çalışamıyor.',
        advice: 'Kişiyi doğruladıysanız hesabı yeniden etkinleştirin.',
        cta: 'Hesapları aç',
        to: i.filterTo('locked'),
      })
    if (expired.length)
      attention.push({
        id: 'invite-expired',
        tone: 'warning',
        title: expired.length === 1 ? 'Bir davetin süresi doldu' : `${formatCount(expired.length)} davetin süresi doldu`,
        impact: 'Bağlantı artık çalışmıyor; kişi hesabını açamaz.',
        advice: 'Daveti iptal edin ya da aynı adrese yeniden davet gönderin.',
        cta: 'Davetleri aç',
        to: i.filterTo('invites'),
      })
    if (expiring.length)
      attention.push({
        id: 'invite-expiring',
        tone: 'warning',
        title: expiring.length === 1 ? 'Bir davetin süresi dolmak üzere' : `${formatCount(expiring.length)} davetin süresi dolmak üzere`,
        impact: 'Kabul edilmezse 6 saat içinde geçersiz olur.',
        advice: 'Kişiyi hatırlatın.',
        cta: 'Davetleri aç',
        to: i.filterTo('invites'),
      })
    if (idle.length)
      attention.push({
        id: 'idle',
        tone: 'info',
        title: idle.length === 1 ? `Bir etkin hesap ${IDLE_DAYS} günden uzun süredir giriş yapmadı` : `${formatCount(idle.length)} etkin hesap ${IDLE_DAYS} günden uzun süredir giriş yapmadı`,
        impact: 'Kullanılmayan yetki gereksiz risk taşır.',
        advice: 'Artık gerekmiyorsa hesabı devre dışı bırakın.',
        cta: 'Hesapları aç',
        to: i.filterTo('idle'),
      })
  }
  if (i.failed) attention.push(unreadable('admins', 'Yönetici listesi', i.retry))
  else if (i.stale) attention.push(unreadable('admins', 'Yönetici listesi', i.retry, true))

  // En önemli eylem ilk: erişim riski varsa önce o hesaplara git; yoksa davet.
  if (noMfa.length) actions.push({ id: 'review-mfa', label: '2FA kurulmamış hesapları aç', detail: 'Kurulumu isteyin ya da hesabı devre dışı bırakın.', icon: 'mdi-shield-alert-outline', to: i.filterTo('nomfa') })
  actions.push({ id: 'invite', label: 'Yönetici davet et', detail: 'Bağlantı e-postayla gider, 48 saat geçerlidir; step-up ve gerekçe ister.', icon: 'mdi-account-plus-outline', guarded: true, onSelect: i.invite })
  // Yıkıcı: kartla önerilmez, yalnız ilgili süzgece götürür (iptal satırdan, gerekçeyle yapılır).
  if (expired.length) actions.push({ id: 'revoke-expired', label: expired.length === 1 ? 'Süresi dolan daveti kaldır' : 'Süresi dolan davetleri kaldır', icon: 'mdi-email-remove-outline', danger: true, to: i.filterTo('invites') })

  return buildVerdict({
    attention,
    actions,
    checks: ['İki adımlı doğrulama', 'Davet süreleri', 'Parola kilitleri', 'Son girişler'],
    calm: { summary: `${formatCount(active.length)} etkin yönetici; hepsinde iki adımlı doğrulama açık, bekleyen davet yok.` },
    busy: ({ errors, total, top }) =>
      !i.items
        ? 'Yönetici listesi okunamadı — hüküm verilemiyor; tekrar deneyin.'
        : errors
          ? `Yönetici erişiminde şimdi müdahale gereken ${errors === 1 ? 'bir konu' : `${errors} konu`} var: ${lc(top.title)}.`
          : `Yönetici erişimi çalışıyor ama ${total === 1 ? 'bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${lc(top.title)}.`,
  })
}

/** Özet cümlesinde başlığın ilk harfi küçülür ("var: bir etkin yönetici…"). */
const lc = (s: string) => s.charAt(0).toLocaleLowerCase('tr-TR') + s.slice(1)
