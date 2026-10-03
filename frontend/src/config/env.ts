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
const FALLBACK_API_BASE_URL = 'http://127.0.0.1:5001/api/'

/**
 * Yerel geliştirmede API ana makinesi sayfanınkiyle AYNI olmalı: oturum çerezi (SameSite=lax, host-only) yalnız aynı siteye
 * gider. Sayfa `localhost:3020`, API `127.0.0.1:5001` olunca tarayıcı ikisini farklı site sayar, çerez gönderilmez ve
 * giriş başarılı olduğu halde ekran "Bilgiler hatalı" der. Google ile giriş yerelde yalnız `localhost` kaynağına izin
 * verdiği için uygulama artık `localhost`'tan açılıyor → varsayılan API adresi sayfanın ana makinesini izler.
 * (`VITE_API_BASE_URL` verilmişse o kullanılır; Electron `file://` vb. durumlarda eski varsayılan.)
 */
function defaultApiBaseUrl(): string {
  try {
    const { protocol, hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:5001/api/`
  } catch {
    /* window yok (test/SSR) */
  }
  return FALLBACK_API_BASE_URL
}

const DEFAULT_API_BASE_URL = defaultApiBaseUrl()

export const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL

export const imageBaseUrl: string =
  import.meta.env.VITE_IMAGE_BASE_URL || import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
