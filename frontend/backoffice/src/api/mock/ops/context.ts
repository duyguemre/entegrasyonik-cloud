/**
 * Aşama 4 sahte uçlarının ortak bağlamı. Her alan modülü (`engine`, `billing`, `infra`, `platform`) kendi durumunu tutar
 * ve `handle(op, body, ctx)` ile yanıt verir; bilmediği operasyonda `UNHANDLED` döner.
 * Veri YALNIZ örnektir: tenant adları "Örnek ·", e-postalar `.test`, IP'ler belge aralığı; gerçek kişi/mağaza yok.
 */
import type { ClientDto } from '../../contract'
import { MockHttpError } from '../errors'

export const UNHANDLED = Symbol('unhandled')
export type Handled = unknown | typeof UNHANDLED

export interface MockCtx {
  /** İstek anı (ms). */
  now: number
  /** Sahnenin kurulduğu an; üretim deterministik olsun diye veri buna göredir. */
  t0: number
  /** Redis hazır değil (`__boMock.setDegraded(true)`). */
  degraded: boolean
  /** LIVE_READONLY=1 (`__boMock.setLiveReadonly(true)`): dış yazan yetenekler 423. */
  liveReadonly: boolean
  clients: ClientDto[]
  /** Oturumdaki yöneticinin e-postası (kendine işlem kuralları). */
  actorEmail: string
}

export interface MockDomain {
  handle(op: string, body: Record<string, unknown>, ctx: MockCtx): Handled
}

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR
export const iso = (ms: number) => new Date(ms).toISOString()

export function hex24(seed: number) {
  let out = ''
  let a = seed >>> 0 || 1
  while (out.length < 24) {
    a = (Math.imul(a ^ (a >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    out += a.toString(16).padStart(8, '0')
  }
  return out.slice(0, 24)
}

/** `limit` 1..200 (varsayılan 50) — şema dışı değer 400 VALIDATION. */
export function readLimit(body: Record<string, unknown>, fallback = 50) {
  if (body.limit === undefined) return fallback
  const n = Number(body.limit)
  if (!Number.isInteger(n) || n < 1 || n > 200) throw validation('limit', '1..200 arası tam sayı olmalı')
  return n
}

/** Opak imleç: base64("o:<ofset>"). Bozuk imleç → 400 VALIDATION (sözleşme). */
export function encodeCursor(offset: number) {
  return btoa(`o:${offset}`)
}
export function decodeCursor(cursor: unknown): number {
  if (cursor === undefined || cursor === null) return 0
  try {
    const m = /^o:(\d+)$/.exec(atob(String(cursor)))
    if (m) return Number(m[1])
  } catch {
    /* aşağıda */
  }
  throw validation('cursor', 'geçersiz imleç')
}
export function page<T>(all: T[], body: Record<string, unknown>, fallback = 50) {
  const limit = readLimit(body, fallback)
  const offset = decodeCursor(body.cursor)
  const items = all.slice(offset, offset + limit)
  return { items, nextCursor: offset + limit < all.length ? encodeCursor(offset + limit) : null }
}

export function validation(path: string, message: string) {
  return new MockHttpError(400, 'VALIDATION', 'Geçersiz istek.', [{ path, message }])
}
export const notFound = (message = 'Kayıt bulunamadı.', code = 'NOT_FOUND') => new MockHttpError(404, code, message)
export const conflict = (code: string, message: string) => new MockHttpError(409, code, message)
export const liveReadonly = () => new MockHttpError(423, 'LIVE_READONLY', 'Canlı salt-okuma kipinde bu işlem kapalı.')

/** Gövde `strict`: izinli olmayan alan → 400 VALIDATION (backend strictBody). */
export function strict(body: Record<string, unknown>, allowed: string[]) {
  for (const k of Object.keys(body)) if (!allowed.includes(k)) throw validation(k, 'bilinmeyen alan')
}

export function tenantName(ctx: MockCtx, tid: number) {
  return ctx.clients.find((c) => c.clientId === tid)?.title ?? null
}
