// DS-v2 A6a — varyant ızgarası ve toplu düzenleyicinin ETKİLEŞİM katmanı (seçim, hücre içi düzenleme,
// klavye, pano, toplu uygula, aşağı doldur, geri al/yinele). Saf kurallar `variantSheet.ts`'te; bu dosya
// yalnızca durum + olayları bağlar. DOM'a bağımlı değildir (tests/use-variant-sheet.test.ts).
import { computed, ref, shallowRef, type Ref } from 'vue'
import {
  SheetHistory, applyBulk, coerce, fillDownTargets, getCell, normRange, parseClipboard, pasteTargets, rowId, sameValue, setCell,
  toClipboard, type BulkOp, type CellChange, type CellRef, type CellValue, type ColumnKey, type SheetColumn,
} from './variantSheet'

export interface SheetOptions {
  rows: Ref<any[]>
  columns: Ref<SheetColumn[]>
  /** Değişiklik uygulandıktan sonra (düzenleme, toplu işlem, yapıştır, geri al). */
  onChange?: (changes: CellChange[]) => void
  /** Aktif hücre değişince (ör. görünüme kaydır). */
  onActivate?: (cell: CellRef) => void
  /** Ekran okuyucu duyurusu (aria-live). */
  announce?: (message: string) => void
  /** Salt okunur hücre (ör. kanal bazında fiyatlı satırda genel fiyat). Düzenleme/toplu yazma atlar. */
  readonly?: (row: any, column: SheetColumn) => boolean
}

export function useVariantSheet(opts: SheetOptions) {
  const { rows, columns } = opts
  const active = ref<CellRef>({ row: 0, col: 0 })
  const anchor = ref<CellRef>({ row: 0, col: 0 })
  const editing = ref<{ row: number; col: number; draft: string; error?: string } | null>(null)
  /** Satır/kolon başlığı ile yapılan seçimde türü (görsel vurgu için). */
  const selectionMode = ref<'cells' | 'rows' | 'cols' | 'all'>('cells')
  const history = shallowRef(new SheetHistory())
  const historyTick = ref(0) // shallowRef içindeki sınıf değişince hesaplananları tetikler

  const range = computed(() => normRange(anchor.value, active.value))
  const selectedCount = computed(() => (range.value.r2 - range.value.r1 + 1) * (range.value.c2 - range.value.c1 + 1))
  const canUndo = computed(() => (historyTick.value, history.value.canUndo))
  const canRedo = computed(() => (historyTick.value, history.value.canRedo))

  const rowCount = () => rows.value.length
  const colCount = () => columns.value.length
  const clampRow = (r: number) => Math.max(0, Math.min(rowCount() - 1, r))
  const clampCol = (c: number) => Math.max(0, Math.min(colCount() - 1, c))

  const isSelected = (r: number, c: number) => {
    const g = range.value
    return r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2
  }
  const isActive = (r: number, c: number) => active.value.row === r && active.value.col === c
  const isEditing = (r: number, c: number) => !!editing.value && editing.value.row === r && editing.value.col === c

  function activate(r: number, c: number, extend = false) {
    if (!rowCount() || !colCount()) return
    active.value = { row: clampRow(r), col: clampCol(c) }
    if (!extend) { anchor.value = { ...active.value }; selectionMode.value = 'cells' }
    opts.onActivate?.(active.value)
  }

  function selectRow(r: number, extend = false) {
    const from = extend ? anchor.value.row : r
    anchor.value = { row: from, col: 0 }
    active.value = { row: clampRow(r), col: colCount() - 1 }
    selectionMode.value = 'rows'
  }
  function selectCol(c: number, extend = false) {
    const from = extend ? anchor.value.col : c
    anchor.value = { row: 0, col: from }
    active.value = { row: rowCount() - 1, col: clampCol(c) }
    selectionMode.value = 'cols'
  }
  function selectAll() {
    anchor.value = { row: 0, col: 0 }
    active.value = { row: rowCount() - 1, col: colCount() - 1 }
    selectionMode.value = 'all'
  }

  // ── Yazma (tek yol: tüm değişiklikler buradan geçer, geçmişe tek adım yazılır) ──
  /** `column` verilirse görünen kolon yerine o kolona yazılır (ör. görünmeyen diğer kanalların aynı alanı). */
  function write(targets: Array<{ row: number; col: number; value: CellValue; column?: SheetColumn }>, label?: string): CellChange[] {
    const step: CellChange[] = []
    for (const t of targets) {
      const v = rows.value[t.row]
      const column = t.column ?? columns.value[t.col]
      if (!v || !column || opts.readonly?.(v, column)) continue
      const before = getCell(v, column.key)
      setCell(v, column.key, t.value)
      step.push({ id: rowId(v), key: column.key, before, after: t.value })
    }
    history.value.push(step)
    historyTick.value++
    const real = step.filter((c) => !sameValue(c.before, c.after))
    if (real.length) {
      opts.onChange?.(real)
      if (label) opts.announce?.(`${label}: ${real.length} hücre değişti`)
    }
    return real
  }

  function replay(step: CellChange[] | null, dir: 'undo' | 'redo') {
    if (!step) return
    const byId = new Map(rows.value.map((v) => [rowId(v), v]))
    for (const ch of step) {
      const v = byId.get(ch.id)
      if (v) setCell(v, ch.key, dir === 'undo' ? ch.before : ch.after)
    }
    historyTick.value++
    opts.onChange?.(step.map((c) => (dir === 'undo' ? { ...c, before: c.after, after: c.before } : c)))
    opts.announce?.(`${dir === 'undo' ? 'Geri alındı' : 'Yinelendi'}: ${step.length} hücre`)
  }
  const undo = () => replay(history.value.undo(), 'undo')
  const redo = () => replay(history.value.redo(), 'redo')

  // ── Hücre içi düzenleme ────────────────────────────────────────────────────
  function startEdit(initial?: string) {
    const { row, col } = active.value
    const v = rows.value[row]
    const column = columns.value[col]
    if (!v || !column) return
    if (opts.readonly?.(v, column)) { opts.announce?.(`${column.label} bu satırda kanal bazında düzenlenir`); return }
    const cur = getCell(v, column.key)
    const text = initial ?? (cur === null || cur === undefined ? '' : column.kind === 'text' ? String(cur) : String(cur).replace('.', ','))
    editing.value = { row, col, draft: text }
  }

  /** Düzenlemeyi kaydeder; geçersizse hücrede hata gösterir ve düzenlemede kalır (false döner). */
  function commitEdit(): boolean {
    const e = editing.value
    if (!e) return true
    const column = columns.value[e.col]
    const res = coerce(column.kind, e.draft)
    if ('error' in res) {
      editing.value = { ...e, error: res.error }
      opts.announce?.(`${column.label}: ${res.error}`)
      return false
    }
    editing.value = null
    write([{ row: e.row, col: e.col, value: res.value }])
    return true
  }
  const cancelEdit = () => { editing.value = null }

  // ── Toplu işlemler ─────────────────────────────────────────────────────────
  /**
   * Seçili hücrelere işlem uygular. Uygulanamayan hücreler (ör. metne yüzde) atlanır ve sayısı döner.
   * `expand`: görünen kolonu birden çok kolona yayar (ör. bir kanalın satış fiyatı → tüm kanalların satış fiyatı).
   */
  function applyToSelection(op: BulkOp, onlyKinds?: SheetColumn['kind'][], expand?: (column: SheetColumn) => SheetColumn[]) {
    const g = range.value
    const targets: Array<{ row: number; col: number; value: CellValue; column: SheetColumn }> = []
    let skipped = 0
    for (let r = g.r1; r <= g.r2; r++) {
      for (let c = g.c1; c <= g.c2; c++) {
        for (const column of expand ? expand(columns.value[c]) : [columns.value[c]]) {
          if ((onlyKinds && !onlyKinds.includes(column.kind)) || opts.readonly?.(rows.value[r], column)) { skipped++; continue }
          const res = applyBulk(column.kind, getCell(rows.value[r], column.key), op)
          if ('error' in res) { skipped++; continue }
          targets.push({ row: r, col: c, value: res.value, column })
        }
      }
    }
    const changed = write(targets, 'Toplu uygula')
    return { changed: changed.length, skipped }
  }

  function fillDown() {
    const g = range.value
    if (g.r2 === g.r1) return 0
    const targets = fillDownTargets(g).map(({ from, to }) => ({
      row: to.row, col: to.col, value: getCell(rows.value[from.row], columns.value[from.col].key),
    }))
    return write(targets, 'Aşağı dolduruldu').length
  }

  function clearSelection() {
    return applyToSelection({ mode: 'clear', value: null }).changed
  }

  function copyText(): string {
    const g = range.value
    const m: CellValue[][] = []
    for (let r = g.r1; r <= g.r2; r++) {
      const line: CellValue[] = []
      for (let c = g.c1; c <= g.c2; c++) line.push(getCell(rows.value[r], columns.value[c].key))
      m.push(line)
    }
    opts.announce?.(`${m.length * (m[0]?.length || 0)} hücre kopyalandı`)
    return toClipboard(m)
  }

  /** Excel/Sheets'ten TSV yapıştırır. Geçersiz hücreler yazılmaz; sayısı döner. */
  function pasteText(text: string) {
    const matrix = parseClipboard(text)
    const targets: Array<{ row: number; col: number; value: CellValue }> = []
    let invalid = 0
    let maxRow = active.value.row
    let maxCol = active.value.col
    for (const t of pasteTargets(matrix, range.value, rowCount(), colCount())) {
      const res = coerce(columns.value[t.col].kind, t.raw)
      if ('error' in res) { invalid++; continue }
      targets.push({ row: t.row, col: t.col, value: res.value })
      maxRow = Math.max(maxRow, t.row)
      maxCol = Math.max(maxCol, t.col)
    }
    const changed = write(targets, 'Yapıştırıldı')
    // Yapıştırılan bölge seçili kalsın.
    if (targets.length) { anchor.value = { row: range.value.r1, col: range.value.c1 }; active.value = { row: maxRow, col: maxCol } }
    if (invalid) opts.announce?.(`${invalid} hücre geçersiz olduğu için yapıştırılmadı`)
    return { changed: changed.length, invalid }
  }

  // ── Klavye ─────────────────────────────────────────────────────────────────
  /**
   * Izgara kabı üzerinde keydown. true dönerse olay işlendi (çağıran preventDefault eder).
   * Düzenleme sırasında: Enter kaydet+aşağı, Shift+Enter yukarı, Tab sağ, Esc vazgeç.
   * Gezinmede: oklar, Shift+ok seçimi genişletir, Home/End, Ctrl+Home/End, Enter/F2 düzenle,
   * yazmaya başla → düzenle, Delete/Backspace temizle, Ctrl+Z/Y geri al/yinele, Ctrl+A tümü, Ctrl+D aşağı doldur.
   * Kopyala/yapıştır tarayıcı `copy`/`paste` olaylarıyla (bkz. copyText/pasteText).
   */
  function onKeydown(e: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
    const mod = !!(e.ctrlKey || e.metaKey)
    const { row, col } = active.value
    if (editing.value) {
      if (e.key === 'Escape') { cancelEdit(); return true }
      if (e.key === 'Enter') { if (commitEdit()) activate(row + (e.shiftKey ? -1 : 1), col); return true }
      if (e.key === 'Tab') { if (commitEdit()) activate(row, col + (e.shiftKey ? -1 : 1)); return true }
      return false
    }
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.shiftKey ? redo() : undo(); return true }
    if (mod && (e.key === 'y' || e.key === 'Y')) { redo(); return true }
    if (mod && (e.key === 'a' || e.key === 'A')) { selectAll(); return true }
    if (mod && (e.key === 'd' || e.key === 'D')) { fillDown(); return true }
    const ext = !!e.shiftKey
    switch (e.key) {
      case 'ArrowDown': activate(mod ? rowCount() - 1 : row + 1, col, ext); return true
      case 'ArrowUp': activate(mod ? 0 : row - 1, col, ext); return true
      case 'ArrowRight': activate(row, mod ? colCount() - 1 : col + 1, ext); return true
      case 'ArrowLeft': activate(row, mod ? 0 : col - 1, ext); return true
      case 'Home': activate(mod ? 0 : row, 0, ext); return true
      case 'End': activate(mod ? rowCount() - 1 : row, colCount() - 1, ext); return true
      case 'PageDown': activate(row + 10, col, ext); return true
      case 'PageUp': activate(row - 10, col, ext); return true
      case 'Tab': {
        const next = col + (e.shiftKey ? -1 : 1)
        if (next < 0 || next >= colCount()) return false // ızgaradan çık (odak tuzağı yok)
        activate(row, next); return true
      }
      case 'Enter': case 'F2': startEdit(); return true
      case 'Delete': case 'Backspace': clearSelection(); return true
      case 'Escape': if (selectedCount.value > 1) { anchor.value = { ...active.value }; selectionMode.value = 'cells'; return true } return false
    }
    if (!mod && !e.altKey && e.key.length === 1) { startEdit(e.key); return true }
    return false
  }

  function resetHistory() { history.value.clear(); historyTick.value++ }

  return {
    active, anchor, range, editing, selectionMode, selectedCount, canUndo, canRedo,
    isSelected, isActive, isEditing, activate, selectRow, selectCol, selectAll,
    startEdit, commitEdit, cancelEdit, applyToSelection, fillDown, clearSelection, copyText, pasteText,
    undo, redo, onKeydown, resetHistory, write,
  }
}

export type VariantSheet = ReturnType<typeof useVariantSheet>
export type { ColumnKey }
