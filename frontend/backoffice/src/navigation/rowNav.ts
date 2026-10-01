/**
 * NT-10 (BO-ELEV KB-5): tablo satırlarında klavye — j/k sonraki/önceki satır, Enter birincil bağlantı, Esc odaktan çık.
 * Tek mekanizma tüm listeler için: `#bo-main` içindeki görünür `tbody tr` satırları (`.bo-table` ve `EkDataTable`) ve
 * mobil kart satırları (`.bo-rowcard`). Sayfa kodu bir şey yapmaz; satırın birincil bağlantısı (BO_UI_PATTERNS §3:
 * tek sekme durağı) odaklanır, yoksa satırın kendisi (`tabindex=-1`) odaklanır ve Enter satırı tıklar.
 * Bağlama: navigation/hotkeys.ts (`row` eylemi) → ShellLayout. Metin alanında / açık diyalogda çalışmaz.
 */
export const ROW_SELECTOR = 'tbody tr, .bo-rowcard'
const PRIMARY = 'a[href], button:not([disabled]), [tabindex="0"]'
export const ROW_MARK = 'data-kb-row'

const isShown = (el: HTMLElement) => el.offsetParent !== null

function visibleRows(root: ParentNode, shown: (el: HTMLElement) => boolean): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ROW_SELECTOR)].filter(
    (r) => shown(r) && !r.closest('.v-overlay') && !r.querySelector('td[colspan]:only-child'),
  )
}

function clearMark(root: ParentNode) {
  root.querySelectorAll(`[${ROW_MARK}]`).forEach((el) => el.removeAttribute(ROW_MARK))
}

export function createRowNav(getRoot: () => ParentNode | null = () => document.querySelector('#bo-main'), shown: (el: HTMLElement) => boolean = isShown) {
  function move(dir: 1 | -1): boolean {
    const root = getRoot()
    if (!root) return false
    const rows = visibleRows(root, shown)
    if (!rows.length) return false
    const active = document.activeElement as HTMLElement | null
    const current = active ? rows.findIndex((r) => r === active || r.contains(active)) : -1
    const next = current === -1 ? (dir === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, current + dir))
    const row = rows[next]
    clearMark(root)
    row.setAttribute(ROW_MARK, '')
    const target = row.querySelector<HTMLElement>(PRIMARY)
    if (target) target.focus({ preventScroll: true })
    else {
      if (!row.hasAttribute('tabindex')) row.setAttribute('tabindex', '-1')
      row.focus({ preventScroll: true })
    }
    row.scrollIntoView?.({ block: 'nearest' })
    return true
  }

  /** Enter: odak satırın kendisindeyse (birincil bağlantısız satır) satırı aç. Bağlantı/düğme Enter'ı kendisi işler. */
  function enter(): boolean {
    const active = document.activeElement as HTMLElement | null
    if (!active || !active.matches(ROW_SELECTOR) || !active.hasAttribute(ROW_MARK)) return false
    active.click()
    return true
  }

  function exit(): boolean {
    const root = getRoot()
    const marked = root?.querySelector<HTMLElement>(`[${ROW_MARK}]`)
    if (!marked) return false
    clearMark(root!)
    ;(document.activeElement as HTMLElement | null)?.blur()
    return true
  }

  return { move, enter, exit }
}
