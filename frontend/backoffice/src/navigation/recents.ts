/**
 * Son açılanlar (BO-ELEV E2) — komut paletinin boş sorgudaki ilk grubu. Yalnız GEZİNME izi tutulur:
 * ekran anahtarı ya da müşteri numarası. Mağaza adı, kimlik bilgisi, oturum, sorgu metni, kişisel veri YOK (KVKK: ad
 * şahıs işletmesinde kişisel veri olabilir — depoya yazılmaz).
 * Depo: tarayıcıya özel kolaylık (localStorage, `bo:recent:<yönetici>`); okunamazsa (gizli pencere, engelli depo) boş liste.
 * static.test.ts bu dosyayı depoya yazan izinli dosyalardan biri olarak tanır; recents.test.ts biçimi korur.
 */
import { ref } from 'vue'

export type Recent = { kind: 'screen'; key: string } | { kind: 'tenant'; tid: number }

const MAX = 6
const PREFIX = 'bo:recent:'

let storageKey = `${PREFIX}anon`
export const recents = ref<Recent[]>([])

const same = (a: Recent, b: Recent) => (a.kind === 'screen' && b.kind === 'screen' ? a.key === b.key : a.kind === 'tenant' && b.kind === 'tenant' && a.tid === b.tid)

/** Yalnız bilinen biçimdeki girdiler kabul edilir (elle değiştirilmiş depo ekrana sızmaz). */
export function sanitize(raw: unknown): Recent[] {
  if (!Array.isArray(raw)) return []
  const out: Recent[] = []
  for (const r of raw) {
    if (r?.kind === 'screen' && typeof r.key === 'string' && /^[a-z-]{1,40}$/.test(r.key)) out.push({ kind: 'screen', key: r.key })
    else if (r?.kind === 'tenant' && Number.isInteger(r.tid) && r.tid > 0) out.push({ kind: 'tenant', tid: r.tid })
    if (out.length >= MAX) break
  }
  return out
}

/** Oturum açan yöneticiye göre depo anahtarı (paylaşılan bilgisayarda yöneticiler birbirinin izini görmez). */
export function loadRecents(sub: string | undefined) {
  // Profil gelmeden (açılışta) kaydedilen gezinme kaybolmaz: yönetici belli olunca onun listesinin başına eklenir.
  const carried = storageKey === `${PREFIX}anon` ? recents.value : []
  storageKey = `${PREFIX}${sub ?? 'anon'}`
  let stored: Recent[] = []
  try {
    stored = sanitize(JSON.parse(localStorage.getItem(storageKey) ?? '[]'))
  } catch {
    stored = []
  }
  recents.value = []
  for (const r of [...stored].reverse()) pushRecent(r, false)
  for (const r of [...carried].reverse()) pushRecent(r, !!sub)
}

export function pushRecent(entry: Recent, persist = true) {
  recents.value = [entry, ...recents.value.filter((r) => !same(r, entry))].slice(0, MAX)
  // Yönetici belli değilken depoya yazılmaz (paylaşılan "anon" anahtarı oluşmaz).
  if (!persist || storageKey === `${PREFIX}anon`) return
  try {
    localStorage.setItem(storageKey, JSON.stringify(recents.value))
  } catch {
    // Depo kapalı: liste yalnız bu sekmede yaşar.
  }
}
