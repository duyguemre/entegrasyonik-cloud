/**
 * Marka kimliği — TEK KAYNAK (ELEV, 2026-10-01; kılavuz: `docs/elev/BRAND.md`).
 *
 * - `BRAND_SLOGAN` / `BRAND_PROMISE`: footer ve kapanış gibi marka temas noktaları buradan okur.
 * - `MESSAGE_PILLARS`: her bölüm başlığı bu dört sütundan yalnız birine hizmet eder (Kontrol · Doğruluk · Zaman · Güven).
 * - `VOICE_BANNED`: ziyaretçiye görünen pazarlama metninde kullanılmayan teknik/yabancı terimler ve Türkçe karşılıkları
 *   (K44, K45, K43). `tests/brand-voice.test.ts` derlenmiş sayfaları bu sözlükle tarar. Rehber (bilgi merkezi) ve yasal
 *   metinler kapsam dışıdır: orada terim, arama terimi ya da hukuki gereklilik olarak geçebilir.
 */
import { AGENT_BRAND } from './agent-brand'

export const BRAND_SLOGAN = 'Çok kanal. Tek kontrol.'
export const BRAND_PROMISE = 'Satışınız çok kanallı, kontrolünüz tek merkezde.'

export type PillarId = 'control' | 'accuracy' | 'time' | 'trust'

export interface MessagePillar {
  id: PillarId
  label: string
  /** Ziyaretçinin cümlesiyle dert. */
  pain: string
  /** Bizim cevabımız (fayda dili). */
  answer: string
}

export const MESSAGE_PILLARS: MessagePillar[] = [
  {
    id: 'control',
    label: 'Kontrol',
    pain: 'Her kanalın paneli ayrı; neyin nerede olduğunu takip etmek gün boyu sürüyor.',
    answer: 'Tüm kanallarınız tek ekranda: ürün, stok, sipariş, iade ve mesajlar.',
  },
  {
    id: 'accuracy',
    label: 'Doğruluk',
    pain: 'Aynı ürün iki kanalda satılıyor, iptal puanınızı düşürüyor.',
    answer: 'Satış hangi kanalda olursa olsun stok tek merkezden düşer ve tüm kanallara iletilir; eşzamanlı siparişte rezervasyon aşırı satışı önler.',
  },
  {
    id: 'time',
    label: 'Zaman',
    pain: 'Ekibiniz satış yerine panel panel dolaşıyor.',
    answer: `Tekrarlayan takip işlerini ${AGENT_BRAND} üstlenir; ekibiniz satışa odaklanır.`,
  },
  {
    id: 'trust',
    label: 'Güven',
    pain: 'Verileriniz, anahtarlarınız ve ekibinizin yetkileri güvende mi?',
    answer: 'Verileriniz yalnızca size ait; izole ve şifreli ortamda korunur, kritik adımlar onayınızla ilerler.',
  },
]

export interface BannedTerm {
  /** Küçük harf (tr-TR) desen. */
  pattern: RegExp
  /** Kullanılacak Türkçe/fayda dili karşılığı. */
  use: string
  /** Yalnız bu yollarda görünmesine izin verilir (ör. güvenlik sayfasının katlanır ayrıntısı). */
  allowIn?: string[]
}

export const VOICE_BANNED: BannedTerm[] = [
  { pattern: /overselling/u, use: 'aşırı satış', allowIn: ['ozellikler/stok-rezervasyonu/'] }, // arama terimi: yalnız o sayfanın başlığında, parantez içinde
  { pattern: /omnichannel/u, use: 'çok kanallı' },
  { pattern: /(?<![\p{L}\d])sku(?![\p{L}\d])/u, use: 'ürün çeşidi / ürün varyantı' },
  { pattern: /aes-256/u, use: 'güçlü şifreleme', allowIn: ['guvenlik/'] },
  { pattern: /enc:v1/u, use: '(görselde teknik önek gösterilmez)' },
  { pattern: /sandbox/u, use: 'test aşaması' },
  { pattern: /(?<![\p{L}])mimari\p{L}*/u, use: 'altyapı / yapı (ya da hiç anlatma)' },
  { pattern: /varsayılan (olarak )?red/u, use: 'yetkisiz işlem yapılamaz', allowIn: ['guvenlik/'] },
  { pattern: /http-only|jwt/u, use: 'korumalı oturum', allowIn: ['guvenlik/'] },
  { pattern: /veritaban\p{L}*/u, use: 'izole ve şifreli ortam' },
  { pattern: /model context protocol/u, use: '(anlatılmaz, K44)' },
  { pattern: /erken erişim|geliştirme aşamasında|örnek görünüm|temsil[iî] tasarım/u, use: 'şimdiki zaman, hazır ürün dili (K43)' },
]
