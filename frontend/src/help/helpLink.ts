/**
 * frontend/src/help/helpLink.ts — Yardım merkezinin çalışma alanı bağlantısı.
 *
 * Yardım merkezi YALNIZ statik içerik gösterir (veri erişimi yok, backend çağrısı yok) → her oturumdaki her kullanıcıya
 * açıktır ve `MenuService` menü ağacına (ApplicationDB `menus`) bağlı DEĞİLDİR. Bu yüzden bağlantı istemcide kurulur
 * (`useOpenIntegrationConfigTab` / `ProductUpdateView` klon deseni: `singleton:false` + düz `title` — `$t(fullPath)`
 * çözümüne düşmez; sekme tekilleştirmesi `code` ile). Tek örnek (modül düzeyi) → aynı sekmeye dönülür.
 */
/** Yardım merkezi ekranının anahtarı (`screens.ts`, `stores/site/menu.ts` views) ve URL parçası. */
export const HELP_SCREEN_KEY = 'HelpCenterView'
export const HELP_SCREEN_SLUG = 'help'
export const HELP_LINK_CODE = HELP_SCREEN_KEY

let link: any

export function helpCenterLink(menuStore: { getViewComponent?: (key: string) => unknown } | null | undefined): any {
  if (!link) {
    link = {
      code: HELP_LINK_CODE,
      parent: '',
      title: 'Yardım merkezi',
      icon: 'mdi-lifebuoy',
      singleton: false,
      status: true,
      inMenu: true,
      // Menü ağacında olmadığı için favorilere eklenemez (`MenuService/addFavorite` bu kodu tanımaz) → yıldız gösterilmez.
      isConstant: true,
    }
  }
  if (!link.component) link.component = menuStore?.getViewComponent?.(HELP_LINK_CODE)
  return link
}

/** Dil değişiminde sekme başlığı. */
export function setHelpLinkTitle(title: string) {
  if (link) link.title = title
}
