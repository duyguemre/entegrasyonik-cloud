/**
 * frontend/src/composables/usePageContext.ts
 *
 * DS-v2 A7 — sekmenin SAYFA BAĞLAMI: breadcrumb kökünün modül ikonu. `WorkspaceTabHost` sekme kodundan menü
 * kaydını çözüp sağlar; `EkPageBar` okur (ds bileşeni mağazaya bağlanmaz). Sekme dışında (vitrin) bağlam yoktur.
 */
import { computed, inject, provide, type ComputedRef, type InjectionKey } from 'vue'

export interface PageContext {
  /** Kök öğenin modül ikonu (menüde üst öğenin ikonu; kök öğe ise kendi ikonu). */
  moduleIcon: ComputedRef<string | undefined>
}

export const PAGE_CONTEXT: InjectionKey<PageContext> = Symbol('ek-page-context')

export function providePageContext(moduleIcon: () => string | undefined): PageContext {
  const ctx: PageContext = { moduleIcon: computed(moduleIcon) }
  provide(PAGE_CONTEXT, ctx)
  return ctx
}

export function usePageContext(): PageContext | null {
  return inject(PAGE_CONTEXT, null)
}

/**
 * Menü ağacında sekme kodunun MODÜL ikonu. Klon sekmeler `Kod_<kimlik>` biçimindedir (ürün düzenleme,
 * entegrasyon ayarları) — önce tam kod, sonra `_` öncesi taban kod aranır. Alt öğede üst öğenin (modülün) ikonu.
 */
export function resolveModuleIcon(menu: unknown, code: string | undefined): string | undefined {
  if (!code || !Array.isArray(menu)) return undefined
  const base = code.includes('_') ? code.slice(0, code.indexOf('_')) : code
  for (const want of base === code ? [code] : [code, base]) {
    for (const group of menu as any[]) {
      for (const link of group?.links ?? []) {
        if (link?.code === want) return link.icon || undefined
        for (const child of link?.children ?? []) {
          if (child?.code === want) return link.icon || child.icon || undefined
        }
      }
    }
  }
  return undefined
}
