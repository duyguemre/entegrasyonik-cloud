/** Denetim `meta` → önce/sonra satırları: `b_<alan>` önceki, `a_<alan>` sonraki değer (2-BE AuditLogger sözleşmesi). */
export interface AuditChange {
  field: string
  before?: string | number | boolean
  after?: string | number | boolean
}

export function auditChanges(meta: Record<string, string | number | boolean> | undefined): AuditChange[] {
  if (!meta) return []
  const map = new Map<string, AuditChange>()
  for (const [key, value] of Object.entries(meta)) {
    const m = /^([ab])_(.+)$/.exec(key)
    if (!m) continue
    const change = map.get(m[2]) ?? { field: m[2] }
    if (m[1] === 'b') change.before = value
    else change.after = value
    map.set(m[2], change)
  }
  return [...map.values()]
}
