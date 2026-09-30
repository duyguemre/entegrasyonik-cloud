/** Duyuru özet metinleri (liste, detay, onay diyalogları aynı metni kullanır). */
import type { Announcement, AnnouncementChannels, AnnouncementInput, AnnouncementTarget } from '@bo/api/contract'
import { planLabel } from '@bo/utils/labels'
import { formatDateTime } from '@bo/utils/format'

export function targetText(t: AnnouncementTarget): string {
  if (t.mode === 'all') return 'Tüm aktif müşteriler'
  if (t.mode === 'plans') return `Plan: ${t.planCodes.map((c) => planLabel(c)).join(', ')}`
  return t.tids.length <= 4 ? `Müşteri: ${t.tids.map((n) => `#${n}`).join(', ')}` : `${t.tids.length} seçili müşteri`
}

export function channelsText(c: AnnouncementChannels): string {
  const parts = [c.banner && 'bant', c.inApp && 'uygulama içi', c.email && 'e-posta'].filter(Boolean) as string[]
  return parts.length ? parts.join(' + ') : '—'
}

export function windowText(a: Pick<Announcement, 'startsAt' | 'endsAt'>): string {
  return `${formatDateTime(a.startsAt)} → ${a.endsAt ? formatDateTime(a.endsAt) : 'süresiz'}`
}

/** Mevcut duyurudan düzenleyici girdisi (yanıttaki sunucu alanları atılır: strict gövde). */
export function toInput(a: Announcement): AnnouncementInput {
  return {
    kind: a.kind,
    severity: a.severity,
    title: { ...a.title },
    body: { ...a.body },
    target: a.target.mode === 'all' ? { mode: 'all' } : a.target.mode === 'plans' ? { mode: 'plans', planCodes: [...a.target.planCodes] } : { mode: 'tenants', tids: [...a.target.tids] },
    audience: a.audience,
    channels: { ...a.channels },
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    dismissible: a.dismissible,
  }
}

/** "101, 102 #107" → [101, 102, 107]; geçersiz parçalar ayrı döner (kullanıcıya gösterilir). */
export function parseTids(text: string): { tids: number[]; invalid: string[] } {
  const tids: number[] = []
  const invalid: string[] = []
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    const n = Number(raw.replace(/^#/, ''))
    if (Number.isInteger(n) && n > 0 && n <= 2_000_000_000) {
      if (!tids.includes(n)) tids.push(n)
    } else invalid.push(raw)
  }
  return { tids, invalid }
}

/** ISO ↔ `datetime-local` (yerel saat). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
