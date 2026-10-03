/**
 * Backend API / görsel sunucusu taban adresleri (R4 — docs/FRONTEND_CODE_AUDIT.md H-02).
 *
 * NEDEN: `composables/restapi.ts` eskiden `baseImageUrl`'i `baseUrl` ile AYNI env değişkenine
 * (`VITE_API_BASE_URL`) bağlıyordu — görsel sunucusu API'den farklı bir adreste çalışıyorsa
 * (ör. ayrı bir CDN/imageServer) ayrı yapılandırılamıyordu. Artık ayrı bir env değişkeni
 * (`VITE_IMAGE_BASE_URL`) var; TANIMLANMAZSA `VITE_API_BASE_URL`'e (ya da onun da yoksa aynı
 * yerel varsayılana) düşer — **davranış hiçbir mevcut ortamda değişmez**, yalnızca isteğe bağlı
 * olarak ayrıştırılabilir hale gelir.
 */
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:5001/api/'

export const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL

export const imageBaseUrl: string =
  import.meta.env.VITE_IMAGE_BASE_URL || import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
