/** Sahte BE-05 `BackofficePrefsService/listViews|saveView|deleteView` (API_BACKOFFICE_ATTENTION.md). Yönetici başına ≤ 20. */
import { SAVED_VIEW_LIMIT, type SavedView } from '../../contracts/ops'
import { UNHANDLED, conflict, hex24, iso, strict, validation, type MockDomain } from './context'

const SCREEN_RE = /^[a-z][a-z0-9-]{0,39}$/
/** Sözleşme deseni `.` içerse de metin "$/. içeren anahtar reddedilir" der → nokta ayrıca elenir (Mongo anahtar güvenliği). */
const KEY_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/
const MAX_KEYS = 20
const MAX_VALUE = 200
const MAX_ITEMS = 20

/** Sorgu şeması: `Record<string, string | string[]>` (BE-05). `$`/`.` içeren anahtar reddedilir (anahtar deseni zaten dışlar). */
function parseQuery(raw: unknown): Record<string, string | string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw validation('query', 'nesne olmalı')
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > MAX_KEYS) throw validation('query', `en çok ${MAX_KEYS} anahtar`)
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of entries) {
    if (!KEY_RE.test(k) || k.includes('.') || k.includes('$')) throw validation(`query.${k}`, 'geçersiz anahtar')
    if (typeof v === 'string') {
      if (v.length > MAX_VALUE) throw validation(`query.${k}`, `değer en çok ${MAX_VALUE} karakter`)
      out[k] = v
    } else if (Array.isArray(v)) {
      if (v.length > MAX_ITEMS || v.some((x) => typeof x !== 'string' || x.length > MAX_VALUE)) throw validation(`query.${k}`, 'geçersiz dizi')
      out[k] = [...(v as string[])]
    } else throw validation(`query.${k}`, 'metin ya da metin dizisi olmalı')
  }
  return out
}

export function createPrefsMock(t0: number): MockDomain {
  /** Yönetici e-postası → kayıtlar (bellekte; sayfa yenilemesinde sıfırlanır). */
  const store = new Map<string, SavedView[]>()
  let seq = 0
  const mine = (email: string) => {
    let list = store.get(email)
    if (!list) store.set(email, (list = []))
    return list
  }
  return {
    handle(op, body, ctx) {
      switch (op) {
        case 'BackofficePrefsService/listViews': {
          strict(body, ['screen'])
          if (body.screen !== undefined && (typeof body.screen !== 'string' || !SCREEN_RE.test(body.screen))) throw validation('screen', 'geçersiz ekran anahtarı')
          const items = mine(ctx.actorEmail)
            .filter((v) => body.screen === undefined || v.screen === body.screen)
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id))
            .map((v) => ({ ...v, query: { ...v.query } }))
          return { items }
        }
        case 'BackofficePrefsService/saveView': {
          strict(body, ['screen', 'name', 'query'])
          if (typeof body.screen !== 'string' || !SCREEN_RE.test(body.screen)) throw validation('screen', 'geçersiz ekran anahtarı')
          const name = typeof body.name === 'string' ? body.name.trim() : ''
          if (name.length < 1 || name.length > 60) throw validation('name', '1..60 karakter olmalı')
          const query = parseQuery(body.query)
          const list = mine(ctx.actorEmail)
          const now = iso(Math.max(ctx.now, t0))
          const existing = list.find((v) => v.screen === body.screen && v.name === name)
          if (existing) {
            existing.query = query
            existing.updatedAt = now
            return { id: existing.id, created: false, count: list.length }
          }
          if (list.length >= SAVED_VIEW_LIMIT) throw conflict('VIEW_LIMIT', `En çok ${SAVED_VIEW_LIMIT} görünüm kaydedilebilir.`)
          const view: SavedView = { id: hex24(++seq + 5000), screen: body.screen, name, query, createdAt: now, updatedAt: now }
          list.push(view)
          return { id: view.id, created: true, count: list.length }
        }
        case 'BackofficePrefsService/deleteView': {
          strict(body, ['id'])
          if (typeof body.id !== 'string' || !/^[0-9a-f]{24}$/.test(body.id)) throw validation('id', 'geçersiz kimlik')
          const list = mine(ctx.actorEmail)
          const i = list.findIndex((v) => v.id === body.id)
          if (i >= 0) list.splice(i, 1)
          return { id: body.id, deleted: i >= 0 }
        }
        default:
          return UNHANDLED
      }
    },
  }
}
