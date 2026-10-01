/**
 * Entegrasyonik Otopilot — operasyon ajanları: sayfa, ana sayfa bandı, hero girişi, Özellikler köprüsü ve llms
 * metinleri (S18 → S22 ad sabiti → S24 pazarlama dili, kullanıcı kararları K43–K46).
 *
 * AD: ürün adı ve rota TEK sabitten gelir (`./agent-brand.ts`); bu dosyada ad metin olarak YAZILMAZ, `AGENT_BRAND` /
 * `AGENT_NAME` şablonla kullanılır. Ad bir sözcüğe ek almayacak biçimde cümle kurulur.
 *
 * S24: Otopilot hazır bir özellik gibi, şimdiki zamanla anlatılır; aşama rozeti, "erken erişim", "örnek görünüm/
 * senaryo" etiketi ve teknik anlatım (protokol, mimari, veritabanı yapısı) YOKTUR. Her VAAT cümlesi (açıklama,
 * kart metni, SSS yanıtı, llms satırı) yalnızca `./agent-claims.ts` kaydından `claim(id)` ile gelir; kayıttaki
 * `readiness` iç notu (yayın öncesi ürün kontrolü) bu dosyaya ve sayfaya girmez. Burada yalnızca başlık/etiket gibi
 * kısa yönlendirme metinleri yazılır. Koruma: tests/agent-claims.test.ts (+ claims.test.ts katı taraması).
 */
import { AGENT_BRAND, AGENT_DESCRIPTOR, AGENT_NAME, AGENT_PATH } from './agent-brand'
import { claim } from './agent-claims'

export { AGENT_BRAND, AGENT_DESCRIPTOR, AGENT_NAME, AGENT_PATH }
/** S18 adları (içe aktaranlar kırılmasın): ad sabitinden türer. */
export const ASSISTANT_NAME = AGENT_NAME
export const ASSISTANT_PATH = AGENT_PATH

/** Otopilot anlatısının göründüğü yüzeyler (vaat kaydı testi bu listeyi tarar). */
export const AGENT_SURFACES = {
  pages: [ASSISTANT_PATH],
  components: ['components/home/AssistantTeaser.astro', 'components/home/Hero.astro'],
} as const

export type AssistantIcon = 'chat' | 'layers' | 'eye' | 'check' | 'bolt' | 'key' | 'book' | 'link' | 'plug' | 'orders' | 'stock' | 'refresh' | 'search' | 'sparkle' | 'lock' | 'shield' | 'database' | 'users'

/** Ajan kartı: ne gözlediği ve ne getirdiği ayrı, kısa satırlar. */
export interface AgentCard {
  id: string
  icon: AssistantIcon
  title: string
  text: string
  watches: string
  brings: string
}

export interface FeatureCard {
  id: string
  icon: AssistantIcon
  title: string
  text: string
}

// ------------------------------------------------------------------------------------------ hero

/** S24 madde 7: sade hero — tek güçlü başlık + tek cümle + tek CTA; ayrıntı aşağıda. Fiyat/paket vaadi yok. */
export const assistantHero = {
  eyebrow: AGENT_NAME,
  descriptor: AGENT_DESCRIPTOR,
  title: claim('core-title'),
  accent: 'onayınızla',
  lead: claim('core-lead'),
  primary: 'Demo talep edin',
}

/**
 * Hero görseli — ajan konsolu (dekoratif; aria-hidden; rakam YOK). Dört ajan satırı döngünün dört durumunu gösterir;
 * altta onay kapısı. S24 madde 2: "Örnek görünüm" etiketi ve "canlı ürün ekranı değildir" notu kaldırıldı.
 */
export type ConsoleState = 'watch' | 'propose' | 'wait' | 'report'
export const agentConsole = {
  windowTitle: AGENT_BRAND,
  status: 'Ajanlar · onay modunda',
  rows: [
    { id: 'stok-farki', icon: 'stock', state: 'watch', stateLabel: 'Gözlüyor', name: 'Stok farkı açıklayıcı', detail: 'Kanallar arası stok eşleşmesi' },
    { id: 'siparis-takip', icon: 'orders', state: 'propose', stateLabel: 'Öneri hazır', name: 'Sipariş takip yardımcısı', detail: 'Geciken siparişler için eylem listesi' },
    { id: 'katalog-sagligi', icon: 'layers', state: 'wait', stateLabel: 'Onayınızı bekliyor', name: 'Katalog sağlığı yardımcısı', detail: 'Reddedilen ürünler için düzeltme taslağı' },
    { id: 'uyum-izleme', icon: 'search', state: 'report', stateLabel: 'Raporlandı', name: 'Entegrasyon izleme ajanı', detail: 'Kanal değişikliği özeti' },
  ] satisfies Array<{ id: string; icon: AssistantIcon; state: ConsoleState; stateLabel: string; name: string; detail: string }>,
  gateTitle: 'Onay kapısı',
  gateText: 'Katalog düzeltme taslağı · siz onaylamadan uygulanmaz',
  gateApprove: 'Onayla',
  gateReview: 'İncele',
}

// ------------------------------------------------------------------------------------------ ajan döngüsü

export type LoopActor = 'agent' | 'you'
export const loopSection = {
  eyebrow: 'Ajan döngüsü',
  title: 'Gözle, öner, onayla, uygula, raporla',
  lead: claim('loop-lead'),
  actorLabels: { agent: 'Ajan', you: 'Siz' } satisfies Record<LoopActor, string>,
  gateLabel: 'Onay kapısı',
  steps: [
    { id: 'gozle', icon: 'eye', actor: 'agent', title: 'Gözle', text: claim('loop-watch') },
    { id: 'oner', icon: 'sparkle', actor: 'agent', title: 'Öner', text: claim('loop-propose') },
    { id: 'onayla', icon: 'check', actor: 'you', title: 'Onayla', text: claim('loop-approve') },
    { id: 'uygula', icon: 'bolt', actor: 'agent', title: 'Uygula', text: claim('loop-apply') },
    { id: 'raporla', icon: 'book', actor: 'agent', title: 'Raporla', text: claim('loop-report') },
  ] satisfies Array<{ id: string; icon: AssistantIcon; actor: LoopActor; title: string; text: string }>,
  principle: claim('loop-principle'),
}

// ------------------------------------------------------------------------------------------ ajanlar

export const agentsSection = {
  eyebrow: 'Ajanlar',
  title: 'Arka planda göz kulak olan ajanlar',
  lead: claim('agents-lead'),
  watchLabel: 'İzler',
  bringLabel: 'Getirir',
  cards: [
    {
      id: 'uyum-izleme',
      icon: 'search',
      title: 'Entegrasyon izleme ajanı',
      text: claim('agent-monitor'),
      watches: claim('agent-monitor-watches'),
      brings: claim('agent-monitor-brings'),
    },
    {
      id: 'siparis-takip',
      icon: 'orders',
      title: 'Sipariş takip yardımcısı',
      text: claim('agent-orders'),
      watches: claim('agent-orders-watches'),
      brings: claim('agent-orders-brings'),
    },
    {
      id: 'katalog-sagligi',
      icon: 'layers',
      title: 'Katalog sağlığı yardımcısı',
      text: claim('agent-catalog'),
      watches: claim('agent-catalog-watches'),
      brings: claim('agent-catalog-brings'),
    },
    {
      id: 'stok-farki',
      icon: 'stock',
      title: 'Stok farkı açıklayıcı',
      text: claim('agent-stock'),
      watches: claim('agent-stock-watches'),
      brings: claim('agent-stock-brings'),
    },
  ] satisfies AgentCard[],
}

// ------------------------------------------------------------------------------------------ kontrol + güven

/** S24: sınırlar ve güven tek bölümde, fayda diliyle (kanıt/aşama ayrımı ve teknik etiketler kaldırıldı). */
export const controlSection = {
  eyebrow: 'Kontrol sizde',
  title: 'Hız ajanlardan, karar sizden',
  lead: claim('control-lead'),
  flowLabel: 'Bir önerinin izlediği yol',
  flow: [
    { id: 'oneri', icon: 'sparkle', label: 'Ajan önerisi', actor: 'agent' },
    { id: 'kapi', icon: 'lock', label: 'Onay kapısı', actor: 'you' },
    { id: 'uygulama', icon: 'bolt', label: 'Uygulama', actor: 'agent' },
    { id: 'kayit', icon: 'book', label: 'Kayıt', actor: 'agent' },
  ] satisfies Array<{ id: string; icon: AssistantIcon; label: string; actor: LoopActor }>,
  items: [
    { id: 'onay-kapisi', icon: 'check', title: 'Onayınız olmadan değişiklik yok', text: claim('control-gate') },
    { id: 'salt-okuma', icon: 'eye', title: 'Varsayılan: yalnızca okuma', text: claim('control-readonly') },
    { id: 'denetim-kaydi', icon: 'book', title: 'Her adım kayıt altında', text: claim('control-audit') },
    { id: 'veri', icon: 'lock', title: 'Verileriniz yalnızca size ait', text: claim('trust-data') },
    { id: 'yetki', icon: 'users', title: 'Sizin yetkinizle', text: claim('trust-role') },
    { id: 'fiyat', icon: 'shield', title: 'Fiyatınız, sizin kuralınız', text: claim('trust-price') },
  ] satisfies FeatureCard[],
}

// ------------------------------------------------------------------------------------------ sohbet

export const chatSection = {
  eyebrow: 'Sohbetle yönetin',
  title: 'Ajanlarla aynı yetenekler, sohbetin rahatlığıyla',
  lead: claim('chat-lead'),
  examplesLabel: 'Şöyle sorabilirsiniz',
  examples: [
    'Bugün kargoya vermem gereken siparişler hangileri?',
    'Geçen haftaya göre iadesi artan ürünleri listele',
    'Stokta olmayıp satışta görünen ürün var mı?',
  ],
  cards: [
    { id: 'dogal-dil', icon: 'chat', title: 'Günlük dille sorun', text: claim('chat-natural') },
    { id: 'ayni-kural', icon: 'layers', title: 'Panelle aynı kurallar', text: claim('chat-same-rules') },
    { id: 'kart-sonuc', icon: 'eye', title: 'Yanıtlar kart ve tablo olarak', text: claim('chat-cards') },
    { id: 'onizleme-onay', icon: 'check', title: 'Önce önizleme, sonra onay', text: claim('chat-preview') },
  ] satisfies FeatureCard[],
}

// ------------------------------------------------------------------------------------------ sohbet sahnesi

export interface ScenarioRow {
  name: string
  sku: string
  stock: string
}
export interface ScenarioChange {
  name: string
  from: string
  to: string
}

/**
 * Sohbet sahnesi (dekoratif görsel; ürün adları ve rakamlar kurgusaldır). S24 madde 2: görünür "Örnek senaryo"
 * etiketi kaldırıldı; rakamlar yalnızca bu sahnede serbesttir (tests/agent-claims.test.ts + pages.test.ts).
 */
export const assistantScenario = {
  windowTitle: AGENT_BRAND,
  sceneLabel: 'Sohbet ekranı',
  status: 'Hesabınıza bağlı · Yetkiniz: Yönetici',
  ask1: 'Çiçek kategorisinde stoku 5’in altına düşen ürünleri göster',
  resultTitle: 'Stok 5’in altında · Çiçek',
  resultMeta: '3 ürün',
  rows: [
    { name: 'Beyaz orkide, seramik saksı', sku: 'CK-104', stock: '3' },
    { name: 'Sukulent teraryum', sku: 'CK-221', stock: '2' },
    { name: 'Lavanta demeti', sku: 'CK-087', stock: '4' },
  ] satisfies ScenarioRow[],
  resultLink: 'Ürünler ekranında aç',
  ask2: 'Bu ürünlerin Trendyol fiyatını %5 artır',
  approvalTitle: 'Onayınız gerekiyor',
  approvalMeta: '3 ürün · Trendyol · Fiyat +%5',
  changes: [
    { name: 'Beyaz orkide, seramik saksı', from: '₺649,00', to: '₺681,45' },
    { name: 'Sukulent teraryum', from: '₺389,90', to: '₺409,40' },
    { name: 'Lavanta demeti', from: '₺219,00', to: '₺229,95' },
  ] satisfies ScenarioChange[],
  approve: 'Onayla ve uygula',
  cancel: 'Vazgeç',
  approvalNote: 'Siz onaylamadan hiçbir fiyat değişmez.',
  typing: 'Yanıt hazırlanıyor',
  inputPlaceholder: 'Bir şey sorun…',
}

// ------------------------------------------------------------------------------------------ SSS

export const assistantFaq = {
  eyebrow: 'Merak edilenler',
  title: `${AGENT_BRAND} hakkında kısa yanıtlar`,
  items: [
    { id: 'ajan-onay', question: 'Ajanlar benim onayım olmadan bir şey değiştirir mi?', answer: claim('faq-approval') },
    { id: 'ajan-yetki', question: 'Ajanlar verilerime nasıl erişir?', answer: claim('faq-access') },
    { id: 'ajan-veri', question: 'Verilerim güvende mi?', answer: claim('faq-privacy') },
    { id: 'ajan-baslangic', question: 'Nasıl başlarım?', answer: claim('faq-start') },
  ],
}

// ------------------------------------------------------------------------------------------ CTA

/** S24 madde 1: erken erişim listesi → "Demo talep edin" (mailto; form yok) + "Hemen başlayın" (kayıt). */
export const assistantCta = {
  eyebrow: AGENT_NAME,
  title: `${AGENT_BRAND} ajanlarını iş başında görün`,
  text: claim('cta-text'),
  subject: `${AGENT_BRAND} demo talebi`,
  subjectNote: 'E-postanın konu satırı hazır gelir:',
  sendLabel: 'Demo talep edin',
  start: 'Hemen başlayın',
  points: ['Form doldurmanız gerekmez; tek bir e-posta yeterli.', 'Hangi takip işlerini ajanlara bırakmak istediğinizi yazın, demoyu ona göre hazırlayalım.'],
}

// ------------------------------------------------------------------------------------------ diğer yüzeyler

/** Ana sayfa bölümü (S24 madde 6: premium bölüm). */
export const assistantTeaser = {
  eyebrow: 'Operasyon ajanları',
  title: AGENT_NAME,
  lead: claim('core-short'),
  points: [
    { icon: 'eye', title: 'Gözler', text: claim('loop-watch') },
    { icon: 'sparkle', title: 'Önerir', text: claim('loop-propose') },
    { icon: 'check', title: 'Onayınızla uygular', text: claim('control-gate') },
  ] satisfies Array<{ icon: AssistantIcon; title: string; text: string }>,
  cta: 'Ajanları keşfedin',
  demo: 'Demo talep edin',
}

/** Ana sayfa HERO girişi — ad + tek cümle + sayfaya giriş (claims.test.ts katı taramasından geçer). */
export const heroAgentEntry = {
  badge: 'Yeni',
  name: AGENT_NAME,
  value: claim('core-title'),
  cta: 'Keşfedin',
  /**
   * S27a (SR4-HOME madde 3): hero "Operasyon merkezi" vitrinindeki Otopilot anı — öneri → onay → uygulama. Sahne
   * dekoratiftir (aria-hidden); cümle vaat kaydından, kısa etiketler yönlendirme metnidir (rakam yok).
   */
  moment: {
    text: claim('hero-moment'),
    signal: 'Stok farkı bulundu',
    signalMeta: 'Kanallar arası',
    proposalLabel: 'Öneri',
    proposal: 'Stoğu tüm kanallarda eşitle',
    reject: 'Reddet',
    approve: 'Onayla',
    approved: 'Onaylandı',
    done: 'Uygulandı · tüm kanallar güncel',
  },
}

/**
 * S27a (SR4 madde 2/5): sorun–çözüm vitrin kartında güvenlik maddesinin yerine Otopilot maddesi (güvenlik anlatısı
 * yalnız Güvenlik bölümünde). Katı taramadan geçer; metin vaat kaydından.
 */
export const homeAgentGain = {
  title: `${AGENT_BRAND} takipte`,
  text: claim('agents-lead'),
}

/** Özellikler sayfası köprüsü (claims.test.ts katı taramasından geçer). */
export const featuresBridge = {
  eyebrow: 'Yeni',
  title: AGENT_NAME,
  text: claim('bridge-text'),
  cta: `${AGENT_BRAND} sayfasına gidin`,
}

/** llms.txt / llms-full.txt satırları (vaat kaydından). */
export const assistantLlms = {
  short: claim('llms-short'),
  full: [claim('llms-loop'), claim('llms-chat'), claim('llms-trust')],
}
