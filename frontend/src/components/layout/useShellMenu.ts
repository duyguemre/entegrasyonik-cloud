/**
 * frontend/src/components/layout/useShellMenu.ts
 *
 * DS-v2 Aşama 2 (kabuk) — `MenuService` menü ağacını (menuStore) kabuğun üç
 * yüzeyinin ortak modeline çevirir: tam sol menü (`NavigationMenu`), ray
 * (`NavigationMenu` ray sunumu) ve akıllı aramanın "Ekranlar" grubu (`ShellSearch`).
 * Erişilebilirliğin KAYNAĞI değişmez (ADR-0015 Karar 2.4): yalnızca menüde
 * zaten olan (status/inMenu) öğeler listelenir; bu dosya hiçbir ekranı
 * gizlemez/eklemez, yalnızca sunum modelini üretir. TEK istisna: statik içerikli
 * Yardım merkezi (veri erişimi yok) kabuğun "Yardım" bölümüne istemcide eklenir.
 * FR2 (fe-r2a): emekli "Eğitim Merkezi" düşer, "Uygulama Ayarları" üst seviyeye çıkar (`navigation/menuShape.ts`).
 */
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMenuStore } from '@/stores/site/menu'
import { useWorkspaceStore } from '@/stores/workspace'
import { resolveScreenByKey, screenKeyForLink } from '@/navigation/screens'
import { SECTIONS } from '@/navigation/sections'
import { firstMessage, humanizeKey, resolveMenuTitle } from '@/navigation/menuTitle'
import type { EkSideSection, EkSideItem } from '@entegrasyonik/ui/components'
import { HELP_SCREEN_KEY, helpCenterLink } from '@/help/helpLink'
import { inheritedIcon, regroupMenu, shapeGroupLinks } from '@/navigation/menuShape'

/** Sidebar'ın sağında favori yıldızı taşıyabilen öğe (menü `isConstant` değilse). */
export interface ShellMenuEntry {
  key: string
  link: any
  title: string
  icon?: string
  /** Üst grubun başlığı (alt öğeler için) — arama satırında "BÖLÜM" çipi. */
  parentTitle?: string
  sectionLabel?: string
}

const isVisible = (link: any) => !!link && link.status !== false && link.inMenu !== false

/** FR3 madde 2: boş favoriler ipucu kapatıldı mı (kişisel kolaylık; okunamazsa ipucu görünür). */
const FAV_HINT_KEY = 'ek.nav.v1.favHint'
function readHintDismissed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(FAV_HINT_KEY) === 'dismissed'
  } catch {
    return false
  }
}
const favHintDismissed = ref(readHintDismissed())
export function dismissFavoritesHint() {
  favHintDismissed.value = true
  try {
    localStorage.setItem(FAV_HINT_KEY, 'dismissed')
  } catch {
    /* depolama kapalı — yalnız bu oturumda gizli */
  }
}

/** Favoriler bölümünün kimliği (EkSidebarNav `reorder` / `dismiss-empty` olayları). */
export const FAVORITES_SECTION_ID = 'favorites'

export function useShellMenu() {
  const menuStore: any = useMenuStore()
  const workspace = useWorkspaceStore()
  const eventBus: any = inject('eventBus', undefined)
  const { t, te } = useI18n({ useScope: 'global' })

  const titleOf = (link: any) => resolveMenuTitle(link, t, te)

  const groups = computed<any[]>(() => {
    const menu = menuStore?.getMenu?.()
    // P11 (K49): Mağaza ayarları + Çıktılar + Yetkilendirme tek "Ayarlar" bölümünde (yalnız sunum; erişim aynı).
    return Array.isArray(menu) ? regroupMenu(menu.filter((g: any) => g && g.group !== 'favorites')) : []
  })

  const sectionLabel = (group: any) => {
    if (group.group === 'dashboard') return t('shell.section.general')
    if (group.group === 'userManagement' || group.edit === false) return ''
    // Menü grubu i18n'de bir alt ağaçsa (ör. `menu.integrations`), kabuğun bölüm etiketi kullanılır;
    // hiçbiri yoksa grup adı okunur metne çevrilir (ham anahtar ASLA gösterilmez).
    const section = SECTIONS.find((s) => s.id === group.group)
    return firstMessage([`menu.${group.group}`, section?.labelKey, `shell.section.${group.group}`], t, te) ?? humanizeKey(group.group)
  }

  /** Sidebar bölümleri (EkSidebarNav modeli) + anahtar → menü düğümü eşlemesi. */
  const model = computed(() => {
    const byKey = new Map<string, any>()
    /** Alt öğenin kendi ikonu yoksa modülün (üst öğenin) ikonu — favoriler bölümünde ikonsuz satır olmasın. */
    const iconByKey = new Map<string, string | undefined>()
    const entries: ShellMenuEntry[] = []
    const sections: EkSideSection[] = []
    for (const group of groups.value) {
      const label = sectionLabel(group)
      const items: EkSideItem[] = []
      // FR2-SHELL madde 7/8: Eğitim Merkezi gösterilmez; Uygulama Ayarları "Ayarlar" grubundan üst seviyeye çıkar.
      for (const link of shapeGroupLinks<any>(group.links)) {
        if (!isVisible(link)) continue
        const key = screenKeyForLink(link)
        byKey.set(key, link)
        const title = titleOf(link)
        const visibleChildren = (link.children || []).filter(isVisible)
        if (link.children && link.children.length > 0) {
          items.push({
            key,
            label: title,
            icon: link.icon,
            children: visibleChildren.map((child: any) => {
              const childKey = screenKeyForLink(child)
              byKey.set(childKey, child)
              iconByKey.set(childKey, child.icon ?? link.icon)
              entries.push({ key: childKey, link: child, title: titleOf(child), icon: child.icon ?? link.icon, parentTitle: title, sectionLabel: label })
              return { key: childKey, label: titleOf(child) }
            }),
          })
        } else {
          const icon = link.icon ?? inheritedIcon(link) ?? resolveScreenByKey(key)?.icon
          iconByKey.set(key, icon)
          items.push({ key, label: title, icon })
          if (link.code !== 'ExitView') entries.push({ key, link, title, icon, sectionLabel: label })
        }
      }
      if (items.length) sections.push({ label, items })
    }
    // Yardım merkezi (faz3-fe-help): statik içerik, veri erişimi yok → her kullanıcıya açık; `MenuService` ağacında
    // DEĞİL, istemci bağlantısıyla (`help/helpLink.ts`) kabuğun kendi "Yardım" bölümüne eklenir (sol menü, ray, Ctrl+K).
    const helpLink = helpCenterLink(menuStore)
    // Menü yüklenmeden (boş/hatalı menü — T1b karakterizasyonu) kabuk boş kalır; yardım yalnız menüyle birlikte eklenir.
    if (groups.value.length > 0 && !byKey.has(HELP_SCREEN_KEY)) {
      const helpTitle = t('help.center.title')
      const helpSection = t('shell.section.help')
      byKey.set(HELP_SCREEN_KEY, helpLink)
      const item: EkSideItem = { key: HELP_SCREEN_KEY, label: helpTitle, icon: 'mdi-lifebuoy' }
      const existing = sections.find((sec) => sec.label === helpSection)
      if (existing) existing.items.push(item)
      else sections.push({ label: helpSection, items: [item] })
      entries.push({ key: HELP_SCREEN_KEY, link: helpLink, title: helpTitle, icon: 'mdi-lifebuoy', sectionLabel: helpSection })
    }
    // FR3 madde 2: Favoriler — menünün EN ÜSTÜNDE kendi bölümü (kayıtlı sırayla); boşken kapatılabilir tek satır ipucu.
    if (groups.value.length > 0) {
      const favLinks: any[] = typeof menuStore?.getFavorites === 'function' ? menuStore.getFavorites() : []
      const favItems: EkSideItem[] = []
      for (const link of favLinks) {
        const key = screenKeyForLink(link)
        if (!byKey.has(key) || favItems.some((i) => i.key === key)) continue
        favItems.push({ key, label: titleOf(link), icon: iconByKey.get(key) ?? link.icon })
      }
      if (favItems.length || !favHintDismissed.value) {
        sections.unshift({
          id: FAVORITES_SECTION_ID,
          label: t('shell.section.favorites'),
          icon: 'mdi-star-outline',
          reorderable: true,
          emptyText: t('shell.favorites.empty'),
          items: favItems,
        })
      }
    }
    return { sections, byKey, entries }
  })

  /** Etkin sekmenin menü anahtarı (çok örnekli bir kayıt sekmesinde menüde karşılığı yoksa boş). */
  const activeKey = computed(() => {
    const link = workspace.mySelectedTab?.link
    if (!link) return undefined
    const key = screenKeyForLink(link)
    return model.value.byKey.has(key) ? key : undefined
  })

  function linkFor(key: string) {
    return model.value.byKey.get(key)
  }

  /** Menü öğesini açar (mevcut `eventBus 'openTab'` mekanizması — sekme/URL mantığı AYNEN). */
  function openKey(key: string) {
    const link = linkFor(key)
    if (!link) return false
    eventBus?.emit('openTab', link)
    return true
  }

  return { model, activeKey, linkFor, openKey, titleOf, menuStore }
}
