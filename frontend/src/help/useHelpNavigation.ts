/**
 * frontend/src/help/useHelpNavigation.ts — yardımdan uygulamaya, uygulamadan yardıma gezinme.
 *
 *  - `openHelp(articleId?)`: `/help?article=<id>` adresine gider; çalışma alanının rota izleyicisi yardım sekmesini
 *    açar/etkinleştirir (tarayıcı geri/ileri makaleler arasında çalışır). Yönlendirici yoksa (izole test) sekme olayıyla.
 *  - `openScreen(key)`: "Buraya git" — menüdeki ekran düğümünü bulur ve MEVCUT `eventBus 'openTab'` yoluyla açar.
 *    Menüde yoksa (kullanıcının yetkisi yok / ekran bu hesapta kapalı) `canOpenScreen` false döner; bağlantı
 *    açıklamayla pasif gösterilir (yetki aşımı YOK — erişimin kaynağı menüdür, ADR-0015 Karar 2.4).
 */
import { inject } from 'vue'
import { useRouter } from 'vue-router'
import { useMenuStore } from '@/stores/site/menu'
import { screenKeyForLink } from '@/navigation/screens'
import { HELP_SCREEN_KEY, HELP_SCREEN_SLUG, helpCenterLink } from './helpLink'

export function findMenuLinkByKey(menu: unknown, key: string): any {
  if (!Array.isArray(menu)) return undefined
  const search = (links: any[]): any => {
    for (const l of links || []) {
      if (!l) continue
      if (!l.children?.length && screenKeyForLink(l) === key && l.status !== false) return l
      if (l.children) {
        const found = search(l.children)
        if (found) return found
      }
    }
    return undefined
  }
  for (const group of menu) {
    const found = search(group?.links)
    if (found) return found
  }
  return undefined
}

export function useHelpNavigation() {
  const eventBus: any = inject('eventBus', null)
  let router: ReturnType<typeof useRouter> | undefined
  try {
    router = useRouter()
  } catch {
    router = undefined
  }
  const menuStore: any = useMenuStore()

  function openHelp(articleId?: string | null) {
    if (router) {
      const query = articleId ? { article: articleId } : {}
      router.push({ path: `/${HELP_SCREEN_SLUG}`, query }).catch(() => undefined)
      return
    }
    eventBus?.emit('openTab', helpCenterLink(menuStore))
  }

  function linkFor(key: string) {
    if (key === HELP_SCREEN_KEY) return helpCenterLink(menuStore)
    return findMenuLinkByKey(menuStore?.getMenu?.(), key)
  }

  const canOpenScreen = (key: string) => !!eventBus && !!linkFor(key)

  function openScreen(key: string): boolean {
    const link = linkFor(key)
    if (!link || !eventBus) return false
    eventBus.emit('openTab', link)
    return true
  }

  return { openHelp, openScreen, canOpenScreen }
}
