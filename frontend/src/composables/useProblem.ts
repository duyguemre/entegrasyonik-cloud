// DS-v2 Aşama 6b — Standart 1: iç servis (liste/detay) hatasını TEK hata desenine (EkProblemState) çevirir.
// Sınıflandırma + teknik ayrıntı `useIntegrationError` ile AYNI kaynaktan (HTTP durumu, servis, istek kimliği …);
// metinler iç servis diliyle (pazaryeri API anahtarı önerisi burada YOK). Neden yalnız ayırt edilebilen sinyalden gelir.
import { classifyIntegrationError, isTransportError, technicalDetails } from './useIntegrationError'

export interface ProblemCopy {
  cause?: string
  action: string
  details: Array<{ label: string; value: string }>
  tone: 'error' | 'warning'
}

const COPY: Record<string, { cause?: string; action: string; tone: 'error' | 'warning' }> = {
  network: { cause: 'İnternet bağlantınız kesilmiş ya da Entegrasyonik sunucusuna şu an ulaşılamıyor.', action: 'Bağlantınızı kontrol edip tekrar deneyin.', tone: 'warning' },
  timeout: { cause: 'Sunucu isteğe zamanında yanıt vermedi.', action: 'Birkaç saniye bekleyip tekrar deneyin.', tone: 'warning' },
  auth: { cause: 'Oturumunuzun süresi dolmuş olabilir ya da bu kaydı görme yetkiniz yok.', action: 'Sayfayı yenileyin; sürerse hesap yöneticinizden yetki isteyin.', tone: 'error' },
  notFound: { cause: 'İstenen kayıt artık mevcut değil.', action: 'Listeyi yenileyin.', tone: 'error' },
  server: { cause: 'Sunucu geçici bir hata verdi.', action: 'Tekrar deneyin. Sürerse teknik ayrıntıyı destek ekibiyle paylaşın.', tone: 'error' },
  unknown: { action: 'Tekrar deneyin. Sürerse teknik ayrıntıyı destek ekibiyle paylaşın.', tone: 'error' },
}

/** `restApi` hata dönüşünü (ya da yakalanan istisnayı) hata desenine çevirir; hata değilse `null`. */
export function problemFromError(resp: unknown, service: string): ProblemCopy | null {
  if (!isTransportError(resp)) return null
  // Uygulama içi istisna (axios dışı) ağ hatası sayılmaz — nedeni bilinmiyor.
  const axiosLike = (resp as { isAxiosError?: boolean }).isAxiosError === true
  const info = axiosLike ? classifyIntegrationError(resp, { service, subject: 'generic' }, { expectArray: false }) : null
  const kind = info?.kind ?? 'unknown'
  const copy = COPY[kind] ?? COPY.unknown
  return { cause: copy.cause, action: copy.action, tone: copy.tone, details: info ? technicalDetails(info) : [{ label: 'Servis', value: service }] }
}
