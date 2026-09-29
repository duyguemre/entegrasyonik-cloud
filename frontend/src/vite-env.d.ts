/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Faz 3 T3: API tabanı; yoksa restapi.ts sabit varsayılana düşer. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
