/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Gerçek /admin-api kökü (ör. https://api.entegrasyonik.com/admin-api). Boşsa dev'de sahte API. */
  readonly VITE_ADMIN_API_BASE?: string
  /** Üst bardaki ortam rozeti: local | staging | production (boşsa mock/yerel). */
  readonly VITE_ADMIN_ENV?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
