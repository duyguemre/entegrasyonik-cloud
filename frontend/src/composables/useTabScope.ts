// DS-v2 Aşama 6b — Standart 7: SEKME SINIRINDA KALAN OVERLAY'LER (çalışma alanı çoklu görev).
//
// Her çalışma alanı sekmesi bir "sekme kabı" (`WorkspaceTabHost` → `#ek-tab-host-<kod>`) içinde çizilir ve bu
// kabı `provide` eder. Sekme içinden açılan diyalog / yan sayfa / çekmece / yükleme örtüsü:
//   • kaba teleport edilir (`attach` + `contained`) → yalnız o sekmenin içerik alanını örter; sekme şeridi, üst bar,
//     sol menü ve DİĞER sekmeler kullanılabilir kalır;
//   • sekme gizlenince kapla birlikte gizlenir (durumu korunur), geri dönünce aynı durumda görünür;
//   • odak tuzağı sekme İÇİdir: odak kabın içinde örtünün dışına kaçarsa örtüye döner; şerit/üst bar/menüye gidebilir;
//   • Esc ve perde tıklaması yalnız ODAKTAKİ sekmenin en üstteki örtüsünü kapatır (Vuetify'ın genel yığını başka
//     sekmedeki örtüyü "en üst" sayabildiği için bu iki kapanış burada yürütülür; Vuetify'a `persistent` geçer).
// Yalnız gerçekten uygulama geneli olanlar (kısayol listesi, bildirim çekmecesi, toast, oturum) kabın DIŞINDA
// bağlanır ve tam ekran kalır — liste DESIGN_SYSTEM.md §17.
import { computed, inject, onBeforeUnmount, provide, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'

export interface TabScope {
  /** Kap öğesinin kimliği (`ek-tab-host-<kod>`). */
  hostId: string
  /** Vuetify `attach` için seçici (`#ek-tab-host-<kod>`). */
  hostSelector: string
  /** Sekme şu an görünür mü? */
  active: Readonly<Ref<boolean>>
}

export const TAB_SCOPE: InjectionKey<TabScope> = Symbol('ek-tab-scope')

/** Menü/sekme kodundan güvenli DOM kimliği (klon sekmeler `Kod_<id>` biçimindedir). */
export function tabHostId(code: string): string {
  return `ek-tab-host-${String(code).replace(/[^A-Za-z0-9_-]/g, '-')}`
}

export function provideTabScope(code: string, active: Readonly<Ref<boolean>>): TabScope {
  const hostId = tabHostId(code)
  const scope: TabScope = { hostId, hostSelector: `#${hostId}`, active }
  provide(TAB_SCOPE, scope)
  return scope
}

export function useTabScope(): TabScope | null {
  return inject(TAB_SCOPE, null)
}

/**
 * Örtünün bağlanacağı hedef. Açık `attach` verilmişse o (eski çağıranlar sekme kökünü noktasız verebilir:
 * "orderListView" → ".orderListView"); verilmemişse sekme kabı; sekme dışındaysa `false` (gövde — uygulama geneli).
 */
export function resolveOverlayAttach(explicit: string | boolean | Element | undefined | null, scope: TabScope | null): string | Element | false {
  if (explicit && explicit !== true) {
    if (typeof explicit === 'string' && /^[A-Za-z][\w-]*$/.test(explicit)) return `.${explicit}`
    return explicit
  }
  return scope ? scope.hostSelector : false
}

/** Kaptaki etkin örtülerden en üstteki (DOM sırası = açılış sırası; teleport sona ekler). */
export function topOverlayIn(host: Element | null): Element | null {
  if (!host) return null
  const list = host.querySelectorAll(':scope > .v-overlay--active, :scope .v-overlay--active.v-overlay--contained')
  return list.length ? list[list.length - 1] : null
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusInto(content: HTMLElement) {
  const first = content.querySelector<HTMLElement>(FOCUSABLE)
  ;(first ?? content).focus({ preventScroll: true })
}

/** Gövdeye teleport edilmiş açık bir menü/liste var mı (Esc önce onu kapatır)? */
function bodyMenuOpen(): boolean {
  return !!document.querySelector('.v-overlay--active.v-menu')
}

export interface TabOverlayOptions {
  open: Readonly<Ref<boolean>>
  attach: Readonly<Ref<string | boolean | Element | undefined>>
  /** Kullanıcının istediği kalıcılık (Esc/perde kapatmaz). */
  persistent: Readonly<Ref<boolean>>
  /** Örtüyü kapatır (ör. `emit('update:modelValue', false)`). */
  close: () => void
  /** Örtünün içerik öğesi (`.v-overlay__content`) — `contentProps.id` ile bulunur. */
  contentId: string
}

export interface TabOverlay {
  scoped: boolean
  attach: ComputedRef<string | Element | false>
  /** Vuetify `v-dialog`/`v-overlay`'e geçirilecek ek özellikler. */
  overlayProps: ComputedRef<Record<string, unknown>>
}

/**
 * EkDialog / EkDialogHost / EkDetailSheet / EkCascadeDialog ortak davranışı. Sekme kabı yoksa (uygulama geneli
 * veya geliştirme vitrini) Vuetify varsayılanları aynen kalır.
 */
export function useTabOverlay(opts: TabOverlayOptions): TabOverlay {
  const scope = useTabScope()
  const attach = computed(() => resolveOverlayAttach(opts.attach.value, scope))
  const scoped = !!scope
  const overlayProps = computed<Record<string, unknown>>(() =>
    scoped
      ? { attach: attach.value, contained: true, persistent: true, retainFocus: false, scrollStrategy: 'none' }
      : { attach: attach.value, contained: !!attach.value, persistent: opts.persistent.value },
  )
  if (!scoped || typeof document === 'undefined') return { scoped, attach, overlayProps }

  const content = () => document.getElementById(opts.contentId)
  const root = () => content()?.closest('.v-overlay') ?? null
  const host = () => document.getElementById(scope!.hostId)
  const isTop = () => {
    const r = root()
    return !!r && topOverlayIn(host()) === r
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || !scope!.active.value) return
    const c = content()
    const target = e.target as Node | null
    // Yalnız odak bu örtünün içindeyse ya da odak sekmenin içerik alanındaysa (örtü en üstteyken).
    const inside = !!c && !!target && c.contains(target)
    const inArea = !!target && !!(target as Element).closest?.('.workplace-area')
    if (!inside && !(inArea && isTop())) return
    if (!isTop() || bodyMenuOpen()) return
    e.stopPropagation()
    if (!opts.persistent.value) opts.close()
  }

  function onClick(e: MouseEvent) {
    const target = e.target as Element | null
    if (!target?.classList?.contains('v-overlay__scrim')) return
    if (target.parentElement !== root()) return
    if (!opts.persistent.value) opts.close()
  }

  function onFocusin(e: FocusEvent) {
    if (!scope!.active.value || !isTop()) return
    const target = e.target as Element | null
    const c = content()
    if (!c || !target || c.contains(target)) return
    // Sekme şeridi, üst bar, sol menü, gövdedeki menü/toast'lar serbest; yalnız bu sekmenin içerik alanı tuzakta.
    const area = target.closest('.workplace-area')
    if (!area) return
    const h = host()
    if (target !== area && h && !h.contains(target)) return
    focusInto(c)
  }

  let bound = false
  function bind(on: boolean) {
    if (on === bound) return
    bound = on
    const m = on ? 'addEventListener' : 'removeEventListener'
    window[m]('keydown', onKeydown as EventListener, true)
    document[m]('click', onClick as EventListener, true)
    document[m]('focusin', onFocusin as EventListener)
  }
  watch(opts.open, (v) => bind(v), { immediate: true })
  // Sekmeye geri dönünce odak açık örtüye (şeritte klavyeyle geziniliyorsa orada kalır).
  watch(scope.active, (v) => {
    if (!v || !opts.open.value) return
    requestAnimationFrame(() => {
      // Şeritte KLAVYEYLE geziniliyorsa (odak görünür) odak orada kalır; fareyle seçildiyse diyaloğa geçer.
      const a = document.activeElement as HTMLElement | null
      if (a?.closest?.('[role="tablist"]') && a.matches?.(':focus-visible')) return
      const c = content()
      if (c && isTop() && !c.contains(document.activeElement)) focusInto(c)
    })
  })
  onBeforeUnmount(() => bind(false))
  return { scoped, attach, overlayProps }
}
