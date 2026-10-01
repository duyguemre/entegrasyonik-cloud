/**
 * frontend/src/components/printouts/templateStore.ts
 *
 * FR3 madde 15 — kullanıcı şablonlarının saklanması. Backend'de şablon sözleşmesi YOK
 * (bkz. frontend/docs/PROPOSALS_PENDING.md "Backend istekleri — çıktı şablonları"); bu yüzden
 * kayıtlı görünümlerle (useSavedViews, C2.4) AYNI desen: localStorage `ek.printTemplates.v1.<userId>.<tenantId>`.
 * Ekran bunu dürüstçe söyler ("Bu tarayıcıda saklanır"). Depolama erişilemezse (gizli mod, kota) bellek içi
 * çalışır ve `persistent=false` döner; hata kullanıcıya/konsola taşmaz.
 */
import { DOC_KINDS, PAPER_PRESETS, type DocKind, type TemplateDoc } from './templateModel'

export const TEMPLATE_STORE_VERSION = 1
export const TEMPLATE_LIMIT = 50

export interface TemplateFile {
  v: number
  templates: TemplateDoc[]
  /** Belge türü başına varsayılan şablon kimliği (sistem veya kullanıcı). */
  defaults: Partial<Record<DocKind, string>>
}

export function templateStorageKey(userId: unknown, tenantId: unknown): string | undefined {
  const user = typeof userId === 'string' || typeof userId === 'number' ? String(userId) : ''
  if (!user) return undefined
  const tenant = tenantId === undefined || tenantId === null || tenantId === '' || tenantId === 0 ? 'default' : String(tenantId)
  return `ek.printTemplates.v${TEMPLATE_STORE_VERSION}.${user}.${tenant}`
}

const KINDS = new Set(DOC_KINDS.map((k) => k.id))
const PRESETS = new Set(PAPER_PRESETS.map((p) => p.id))

/** Bozuk/eski kayıtları ayıklar (şema dışı şablon yüklenmez). */
export function sanitizeFile(raw: unknown): TemplateFile {
  const empty: TemplateFile = { v: TEMPLATE_STORE_VERSION, templates: [], defaults: {} }
  if (!raw || typeof raw !== 'object') return empty
  const f = raw as Partial<TemplateFile>
  if (f.v !== TEMPLATE_STORE_VERSION || !Array.isArray(f.templates)) return empty
  const templates = f.templates
    .filter((t): t is TemplateDoc => !!t && typeof t === 'object' && typeof t.id === 'string' && typeof t.name === 'string'
      && KINDS.has(t.kind) && !!t.paper && PRESETS.has(t.paper.preset) && Array.isArray(t.elements))
    .map((t) => ({ ...t, system: false }))
    .slice(0, TEMPLATE_LIMIT)
  const defaults: TemplateFile['defaults'] = {}
  for (const [k, id] of Object.entries(f.defaults ?? {})) if (KINDS.has(k as DocKind) && typeof id === 'string') defaults[k as DocKind] = id
  return { v: TEMPLATE_STORE_VERSION, templates, defaults }
}

export function readTemplates(key: string | undefined): { file: TemplateFile; persistent: boolean } {
  const empty: TemplateFile = { v: TEMPLATE_STORE_VERSION, templates: [], defaults: {} }
  if (!key) return { file: empty, persistent: false }
  try {
    const raw = window.localStorage.getItem(key)
    return { file: raw ? sanitizeFile(JSON.parse(raw)) : empty, persistent: true }
  } catch {
    return { file: empty, persistent: false }
  }
}

export function writeTemplates(key: string | undefined, file: TemplateFile): boolean {
  if (!key) return false
  try {
    window.localStorage.setItem(key, JSON.stringify(file))
    return true
  } catch {
    return false
  }
}
