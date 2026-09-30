/**
 * Entegrasyonik Otopilot — operasyon ajanları: "yolda" (upcoming) anlatısı (S18 → S22 yeniden adlandırma ve ajan-önce
 * kurgu; ADR-0019 yetenek kaydı + Chat-as-UI eşitliği, ADR-0018 entegrasyon uyum izleme + ajan-hazır altyapı,
 * ADR-0009 MCP topolojisi, ADR-0007 yerel uygulama).
 *
 * AD: ürün adı ve rota TEK sabitten gelir (`./agent-brand.ts`); bu dosyada ad metin olarak YAZILMAZ, `AGENT_BRAND` /
 * `AGENT_NAME` şablonla kullanılır. Ad bir sözcüğe ek almayacak biçimde cümle kurulur ("Otopilot ajanları",
 * "Otopilot çalışma alanı") → ad değişince Türkçe ek uyumu bozulmaz.
 *
 * DÜRÜSTLÜK SINIRI: Ajanlar, sohbetle yönetim ve yerel uygulama platformun bugünkü sürümünde YOK. Bu dosya iki tür
 * içerik taşır ve ikisini veri düzeyinde ayırır:
 *   - `planned`  : geliştirme aşamasındaki / planlanan yetenekler. Her kart bir `stage` etiketi taşır ve metni
 *                  gelecek/niyet kipindedir ("-acak/-ecek", "geliştiriyoruz"); kesin kip ("yapar/yapıyor") YOK.
 *   - `proven`   : altyapısı bugün kodda olan güvence maddeleri. Her madde repo içi `evidence` taşır
 *                  (claims.test.ts ile aynı PATHS/`evidence` deseni: dosya mevcut + atıf metni dosyada geçer).
 * `scenario` ve `agentConsole` ÖRNEK görünümlerdir (canlı ürün değildir); rakamlar YALNIZCA `scenario`'da (örnek veri).
 *
 * İSTİSNA KAPSAMI (dar ve gerekçeli): "yakında/planlanan" dili ve "MCP" adı yalnızca `UPCOMING_SURFACES`
 * içinde (bu sayfa + ana sayfa bandı) görünebilir. Diğer tüm sayfalar claims.test.ts'in katı kurallarında kalır;
 * Özellikler köprüsü (`featuresBridge`) ve ana sayfa hero girişi (`heroAgentEntry`) istisna DEĞİLDİR ve katı taramadan
 * geçer. Koruma: tests/upcoming.test.ts.
 */
import { evidence, PATHS, type EvidenceRef } from './evidence'
import { AGENT_BRAND, AGENT_DESCRIPTOR, AGENT_NAME, AGENT_PATH } from './agent-brand'

export { AGENT_BRAND, AGENT_DESCRIPTOR, AGENT_NAME, AGENT_PATH }
/** S18 adları (içe aktaranlar kırılmasın): artık ad sabitinden türer. */
export const ASSISTANT_NAME = AGENT_NAME
export const ASSISTANT_PATH = AGENT_PATH

/**
 * "Yolda" dilinin kullanılabildiği yüzeyler — başka hiçbir sayfa/bileşen eklenemez (upcoming.test.ts sabitler).
 * `pages`: rota; `components`: `src/` altına göreli kaynak (ana sayfa bandı).
 */
export const UPCOMING_SURFACES = {
  pages: [ASSISTANT_PATH],
  components: ['components/home/AssistantTeaser.astro'],
} as const

export type AssistantStage = 'development' | 'early-access' | 'planned'
export const STAGE_LABELS: Record<AssistantStage, string> = {
  development: 'Geliştirme aşamasında',
  'early-access': 'Erken erişim',
  planned: 'Planlanan',
}

export type AssistantIcon = 'chat' | 'layers' | 'eye' | 'check' | 'bolt' | 'key' | 'book' | 'link' | 'plug' | 'orders' | 'stock' | 'refresh' | 'search' | 'sparkle' | 'lock' | 'shield'

export interface PlannedCard {
  id: string
  icon: AssistantIcon
  stage: AssistantStage
  title: string
  text: string
}

/** Ajan kartı: ne gözleyeceği ve ne getireceği ayrı, kısa satırlar (isim öbeği; kip kuralı `text`'te). */
export interface AgentCard extends PlannedCard {
  watches: string
  brings: string
}

export interface ProvenItem {
  id: string
  icon: 'layers' | 'lock' | 'eye' | 'database' | 'shield' | 'search'
  title: string
  text: string
  /** Kodda nerede? (görünür kısa etiket; ör. "Yetenek kaydı"). */
  where: string
  evidence: EvidenceRef[]
}

export interface PlannedTrustItem {
  id: string
  icon: 'check' | 'users' | 'eye'
  stage: AssistantStage
  title: string
  text: string
  /** Tasarım kararı (ADR) — "kanıt" değil, gerekçe. Sayfada gösterilmez. */
  basis: EvidenceRef[]
}

// ------------------------------------------------------------------------------------------ hero

export const assistantHero = {
  eyebrow: AGENT_NAME,
  descriptor: AGENT_DESCRIPTOR,
  badge: STAGE_LABELS['early-access'],
  title: 'Operasyonunuzu izleyecek, onayınızla çalışacak ajanlar.',
  accent: 'onayınızla',
  lead: 'Stok, sipariş, fiyat ve katalog takibini sizin yerinize üstlenecek operasyon ajanları geliştiriyoruz. Ajanlar sinyali gözleyecek ve hazır bir öneriyle gelecek; hiçbir değişikliği sizin onayınız olmadan uygulamayacak, attıkları her adımı raporlayacak.',
  note: 'Geliştirme aşamasında: ajanlar, sohbetle yönetim ve yerel uygulama platformun bugünkü sürümünde yoktur.',
  primary: 'Erken erişim listesine katılın',
  secondary: 'Ajan döngüsünü görün',
}

/**
 * Hero görseli — "ajan konsolu" ÖRNEK görünümü (dekoratif; aria-hidden; rakam YOK). Dört ajan satırı döngünün dört
 * durumunu gösterir; altta onay kapısı. Etiket ve not ZORUNLU (upcoming.test.ts): canlı ürün ekranı değildir.
 */
export type ConsoleState = 'watch' | 'propose' | 'wait' | 'report'
export const agentConsole = {
  label: 'Örnek görünüm',
  caption: 'Temsilî tasarım; canlı ürün ekranı değildir.',
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
  lead: 'Her ajan aynı beş adımlı döngüyle çalışacak. Dört adımı ajan üstlenecek; ortadaki karar adımı ise yalnızca sizin olacak.',
  actorLabels: { agent: 'Ajan', you: 'Siz' } satisfies Record<LoopActor, string>,
  gateLabel: 'İnsan onayı kapısı',
  steps: [
    {
      id: 'gozle',
      icon: 'eye',
      actor: 'agent',
      title: 'Gözle',
      text: 'Ajan, tanımlı sinyalleri izleyecek: kanallar arası stok farkı, geciken sipariş, reddedilen ürün.',
    },
    {
      id: 'oner',
      icon: 'sparkle',
      actor: 'agent',
      title: 'Öner',
      text: 'Bulduğunu sade bir özetle ve değişikliğin önizlemesiyle önünüze getirecek.',
    },
    {
      id: 'onayla',
      icon: 'check',
      actor: 'you',
      title: 'Onayla',
      text: 'Öneriyi inceleyip onaylayacak ya da reddedeceksiniz; onay adımına yapay zekâ erişemeyecek.',
    },
    {
      id: 'uygula',
      icon: 'bolt',
      actor: 'agent',
      title: 'Uygula',
      text: 'Onaylanan işlem sizin kimliğinizle ve ekranlardaki yetki denetimlerinin aynısıyla çalışacak.',
    },
    {
      id: 'raporla',
      icon: 'book',
      actor: 'agent',
      title: 'Raporla',
      text: 'Sonuç size özetlenecek; her adım kaynağıyla birlikte denetim kaydına yazılacak.',
    },
  ] satisfies Array<{ id: string; icon: AssistantIcon; actor: LoopActor; title: string; text: string }>,
  principle: 'Önce kural, sonra yapay zekâ: tespit ve eşikler kodda tanımlı olacak; yapay zekâ yalnızca özetleme ve öneri metni katmanında devreye girecek.',
}

// ------------------------------------------------------------------------------------------ ajanlar

export const agentsSection = {
  eyebrow: 'Ajanlar',
  title: 'Arka planda göz kulak olacak ajanlar',
  lead: 'İlk ajanları, tekrar eden takip işlerini sizin yerinize izleyecek ve hazır bir öneri getirecek yardımcılar olarak planlıyoruz. Ajanlar yalnızca öneri hazırlayacak; uygulama kararı sizde kalacak.',
  watchLabel: 'Gözleyecek',
  bringLabel: 'Getirecek',
  highlight: { id: 'uyum-izleme', label: 'İlk hedefimiz' },
  cards: [
    {
      id: 'uyum-izleme',
      icon: 'search',
      stage: 'development',
      title: 'Entegrasyon izleme ajanı',
      text: 'Pazaryeri API’lerindeki değişiklikleri takip edecek, etkisini özetleyecek ve ekibimize düzeltme önerisi hazırlayacak. Böylece kanal tarafındaki bir değişiklik size ulaşmadan ele alınabilecek.',
      watches: 'Kanal API yanıtlarındaki biçim değişiklikleri',
      brings: 'Etki özeti ve düzeltme önerisi',
    },
    {
      id: 'siparis-takip',
      icon: 'orders',
      stage: 'planned',
      title: 'Sipariş takip yardımcısı',
      text: 'Geciken ya da bir adımda takılı kalan siparişleri fark edecek ve size öncelik sırasına dizilmiş bir eylem listesi önerecek.',
      watches: 'Geciken ve takılı kalan siparişler',
      brings: 'Önceliklendirilmiş eylem listesi',
    },
    {
      id: 'katalog-sagligi',
      icon: 'layers',
      stage: 'planned',
      title: 'Katalog sağlığı yardımcısı',
      text: 'Kanal tarafından reddedilen ya da eksik bilgili ürünleri bulacak ve düzeltme için hazır bir taslak getirecek.',
      watches: 'Reddedilen ve eksik bilgili ürünler',
      brings: 'Düzeltme taslağı',
    },
    {
      id: 'stok-farki',
      icon: 'stock',
      stage: 'planned',
      title: 'Stok farkı açıklayıcı',
      text: 'Kanallar arasındaki stok farklarının nedenini sade bir dille açıklayacak ve düzeltici adımı onayınıza sunacak.',
      watches: 'Kanallar arası stok farkları',
      brings: 'Neden açıklaması ve düzeltici adım',
    },
  ] satisfies AgentCard[],
}

// ------------------------------------------------------------------------------------------ sınırlar (korkuluklar)

/**
 * Ajanın sınırları — her madde PLANLANAN (aşama rozetli) bir kuraldır; `foundation`, bugün kodda olan ilgili kanıtlı
 * güven maddesine (trustSection.proven kimliği) işaret eder ve "Temeli bugün kodda" olarak gösterilir (test: kimlik var).
 */
export const guardrailsSection = {
  eyebrow: 'Sınırlar',
  title: 'Ajanın sınırlarını siz çizeceksiniz',
  lead: 'Ajanlar hızlı olacak ama başıboş olmayacak. Her öneri aynı kapıdan geçecek, varsayılan yetki okumayla sınırlı kalacak ve her adım kayda geçecek.',
  flowLabel: 'Bir önerinin izleyeceği yol',
  flow: [
    { id: 'oneri', icon: 'sparkle', label: 'Ajan önerisi', actor: 'agent' },
    { id: 'kapi', icon: 'lock', label: 'Onay kapısı', actor: 'you' },
    { id: 'uygulama', icon: 'bolt', label: 'Uygulama', actor: 'agent' },
    { id: 'kayit', icon: 'book', label: 'Denetim kaydı', actor: 'agent' },
  ] satisfies Array<{ id: string; icon: AssistantIcon; label: string; actor: LoopActor }>,
  foundationLabel: 'Temeli bugün kodda',
  items: [
    {
      id: 'onay-kapisi',
      icon: 'check',
      stage: 'development',
      title: 'Onay kapısı',
      text: 'Fiyat, stok ya da sipariş durumunu değiştirecek her öneri, yapay zekânın erişemeyeceği ayrı bir onay adımından geçecek.',
      foundation: 'yetkiniz',
    },
    {
      id: 'salt-okuma',
      icon: 'eye',
      stage: 'development',
      title: 'Varsayılan: salt okuma',
      text: 'Ajanlar veriyi okuyup öneri hazırlayacak; yazma işlemi yalnızca sizin onayladığınız adımda ve sizin yetkinizle çalışacak.',
      foundation: 'ajan-kapali',
    },
    {
      id: 'denetim-kaydi',
      icon: 'book',
      stage: 'planned',
      title: 'Denetim kaydı',
      text: 'Ajan adımları kaynağı belirtilerek kayda yazılacak; kim neyi, hangi kanaldan onayladı sorusunun yanıtı hazır olacak.',
      foundation: 'denetim-izi',
    },
  ] satisfies Array<PlannedCard & { foundation: string }>,
}

// ------------------------------------------------------------------------------------------ sohbet (planlanan)

export const chatSection = {
  eyebrow: 'Sohbetle de yönetin',
  title: 'Ajanlarla aynı yetenekler, sohbetin rahatlığıyla',
  lead: 'Ajanların yanında, sorunuzu günlük dille yazabileceğiniz bir sohbet arayüzü de geliştiriyoruz. Sohbet, uygulamadaki ekranların kullandığı işlemlerin aynısını çağıracak; sohbete açılan her işlem, ekrandaki kurallarla birebir aynı şekilde çalışacak.',
  examplesLabel: 'Şöyle sorabileceksiniz',
  examples: [
    'Bugün kargoya vermem gereken siparişler hangileri?',
    'Geçen haftaya göre iadesi artan ürünleri listele',
    'Stokta olmayıp satışta görünen ürün var mı?',
  ],
  cards: [
    {
      id: 'dogal-dil',
      icon: 'chat',
      stage: 'development',
      title: 'Günlük dille sorun',
      text: 'Stok, sipariş ve ürün sorularınızı menü aramadan, konuşur gibi yazabileceksiniz. Sohbet hangi ekrana ve filtreye ihtiyacınız olduğunu sizin yerinize bulacak.',
    },
    {
      id: 'ayni-yetenek',
      icon: 'layers',
      stage: 'development',
      title: 'Ekranlarla aynı yetenekler',
      text: 'Sohbet, ekranların kullandığı yetenek kaydının aynısından beslenecek. Platforma eklenen her yeni yetenek için sohbette yer alıp almayacağı açıkça kararlaştırılacak; sohbete açılanlar aynı izin kurallarıyla çalışacak.',
    },
    {
      id: 'kart-sonuc',
      icon: 'eye',
      stage: 'planned',
      title: 'Yanıtlar kart ve tablo olarak',
      text: 'Sonuçlar düz metin yerine uygulamanın kendi tablo ve kartlarıyla gelecek; tek dokunuşla ilgili ekrana geçip kaldığınız yerden devam edebileceksiniz.',
    },
    {
      id: 'onizleme-onay',
      icon: 'check',
      stage: 'development',
      title: 'Önce önizleme, sonra onay',
      text: 'Fiyat, stok ya da sipariş durumunu değiştirecek her istek önce bir önizleme kartına dönüşecek. Değişiklik ancak siz onayladığınızda uygulanacak.',
    },
  ] satisfies PlannedCard[],
}

// ------------------------------------------------------------------------------------------ örnek senaryo (sohbet sahnesi)

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

/** Sohbet sahnesi: kurgusal örnek veri. Rakamlar yalnızca burada serbesttir (upcoming.test.ts). */
export const assistantScenario = {
  label: 'Örnek senaryo',
  caption: 'Temsilî tasarım; canlı ürün ekranı değildir. Ürün adları ve rakamlar örnektir.',
  windowTitle: AGENT_BRAND,
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

// ------------------------------------------------------------------------------------------ yerel uygulama (planlanan)

export const localSection = {
  eyebrow: 'Yerel uygulama',
  title: 'Bilgisayarınızda, iş akışınızın tam ortasında',
  lead: `${AGENT_BRAND} çalışma alanını bilgisayarınıza kurulan hafif bir uygulama olarak tasarlıyoruz. Panel sekmeleri arasında dolaşmak yerine ajan önerilerini, sohbeti ve onay kartlarını aynı pencerede göreceksiniz.`,
  protocol: {
    name: 'Model Context Protocol (MCP)',
    short: 'MCP',
    nodes: [AGENT_NAME, 'Yetenek kaydı ve yetki'],
    title: 'Açık standart: Model Context Protocol',
    text: `MCP, yapay zekâ uygulamalarının iş uygulamalarına standart ve denetimli bir yoldan bağlanması için geliştirilmiş açık bir protokoldür. Onu ortak bir priz gibi düşünebilirsiniz: ${AGENT_BRAND} ajanları Entegrasyonik platformuna kapalı ve özel bir kabloyla değil, tanımlı araçlar ve izinler üzerinden bağlanacak.`,
    points: [
      'Ajanların ve sohbetin neyi yapabileceği, sunucudaki yetenek listesiyle sınırlı olacak.',
      'Her çağrı sizin hesabınızla ve rolünüzün izinleriyle yapılacak.',
      'Açık standart olduğu için bağlantı, tek bir yapay zekâ sağlayıcısına kilitlenmeyecek.',
    ],
  },
  cards: [
    {
      id: 'masaustu',
      icon: 'bolt',
      stage: 'planned',
      title: 'Hızlı ve odaklı',
      text: 'Tarayıcı sekmelerinden bağımsız, tek pencerelik bir çalışma alanı olacak. Bekleyen onaylar ve son raporlar bir tık uzağınızda duracak.',
    },
    {
      id: 'kendi-modeliniz',
      icon: 'key',
      stage: 'planned',
      title: 'Kendi modelinizi seçin',
      text: 'Kullanacağınız yapay zekâ modelini siz seçeceksiniz. Model anahtarınız sunucumuzda değil, cihazınızda saklanacak.',
    },
    {
      id: 'secilen-dosya',
      icon: 'book',
      stage: 'planned',
      title: 'Yalnızca seçtiğiniz dosya',
      text: 'Ajanlar yalnızca sizin seçtiğiniz dosyayı okuyabilecek. Örneğin tedarikçi fiyat listesini bırakıp güncel fiyatlarınızla karşılaştırma isteyebileceksiniz.',
    },
    {
      id: 'is-akisi',
      icon: 'link',
      stage: 'planned',
      title: 'Açık uçlu bağlantı',
      text: 'Açık standart sayesinde, zamanla kullandığınız diğer uyumlu yapay zekâ araçlarından da Entegrasyonik platformuna aynı izinlerle bağlanabilmeyi hedefliyoruz.',
    },
  ] satisfies PlannedCard[],
}

// ------------------------------------------------------------------------------------------ güven (kanıtlı vs planlanan)

const CAP = 'backend/src/capabilities'

export const trustSection = {
  eyebrow: 'Güven',
  title: 'Güven, ajanlardan önce kuruldu',
  lead: 'Ajanların dayanacağı güvenlik temelleri bugün platformda çalışıyor. Aşağıda kodda olanları ve ajanlarla birlikte geleceklerini ayrı ayrı gösteriyoruz.',
  provenLabel: 'Bugün kodda',
  provenTag: 'Kodda',
  provenLead: 'Bu maddelerin her biri platformun bugünkü sürümünde uygulanmıştır.',
  plannedLabel: 'Ajanlarla birlikte gelecek',
  plannedLead: 'Bu maddeler tasarım kararı olarak yazıldı; ajanlarla birlikte uygulanacak.',
  proven: [
    {
      id: 'yetenek-kaydi',
      icon: 'layers',
      title: 'Tek yetenek kaydı',
      text: 'Uygulamadaki işlemler tek bir yetenek kaydında tanımlıdır ve rol tabanlı yetki tablosu bu kayıttan üretilir. Ajanlar ve sohbet de aynı kayıttan beslenecek.',
      where: 'Yetenek kaydı',
      evidence: [
        evidence(`${CAP}/index.ts`, 'Yetenek kaydı: tek gerçek kaynak (ADR-0019 §1)', 'Yetenek Kaydı — TEK gerçek kaynak'),
        evidence(`${CAP}/derive/policy.ts`, 'Yetki tablosu kayıttan türetilir', 'export function derivePolicy'),
      ],
    },
    {
      id: 'yetkiniz',
      icon: 'lock',
      title: 'Sizin yetkinizle',
      text: 'Her istek sunucuda rolünüze göre denetlenir; kayıtta tanımlı olmayan bir işlem varsayılan olarak reddedilir.',
      where: 'Yetki denetimi',
      evidence: [
        evidence('backend/src/api/operationPolicy.ts', 'operationPolicy varsayılan red', 'varsayılan olarak REDDEDİLİR'),
        evidence('backend/src/api/RunOperation.ts', 'RunOperation kademe denetimi', 'isAllowed(required'),
      ],
    },
    {
      id: 'denetim-izi',
      icon: 'eye',
      title: 'Denetim izi',
      text: 'Oturum açma ve hassas hesap işlemleri, yalnızca gerekli asgari bilgiyle denetim kaydına yazılır.',
      where: 'Denetim kaydı',
      evidence: [
        evidence('backend/src/services/audit/AuditLogger.ts', 'AuditLogger asgari denetim kaydı', 'asgari denetim kaydı'),
        evidence('backend/src/database/application/models/AuditLog.ts', 'AuditLog asgari alanlar', 'PII olarak YALNIZCA sub / tid / ip'),
      ],
    },
    {
      id: 'kiraci-izolasyonu',
      icon: 'database',
      title: 'Kiracı izolasyonu',
      text: 'Her müşteri hesabı için ayrı bir operasyon veritabanı kullanılır; ajanlar da yalnızca oturum açtığınız hesabın verisiyle çalışacak.',
      where: 'Hesap başına veritabanı',
      evidence: [
        evidence(PATHS.adr0003, 'ADR-0003 kiracı DB adlandırma', 'entegrasyonikClient_1'),
        evidence('CLAUDE.md', 'CLAUDE.md kiracı DB sözleşmesi', 'entegrasyonikClient_<n>'),
      ],
    },
    {
      id: 'ajan-kapali',
      icon: 'shield',
      title: 'Ajan izinleri varsayılan kapalı',
      text: 'Kayıttaki her yetenek, ajanlara açık olup olmadığını açıkça belirtmek zorundadır. Bugün hiçbir yetenek ajanlara açık değildir.',
      where: 'Ajan kararı',
      evidence: [
        evidence(`${CAP}/define.ts`, 'Varsayılan ajan kararı: kapalı', 'export const NO_AGENT: AgentDecision = { allowed: false }'),
        evidence(`${CAP}/types.ts`, 'Ajan kararı zorunlu alan', 'export type AgentDecision'),
      ],
    },
    {
      id: 'sozlesme-bekcisi',
      icon: 'search',
      title: 'Sözleşme bekçisi',
      text: 'Pazaryeri yanıtlarındaki beklenmeyen biçim değişiklikleri, akışı yavaşlatmadan bir sözleşme bekçisiyle kayda alınır. İzleme ajanı bu altyapının üzerine kurulacak.',
      where: 'Entegrasyon uyum izleme',
      evidence: [
        evidence('backend/src/integration/compliance/ContractGuard.ts', 'ADR-0018 Karar 2a pasif sözleşme bekçisi', 'Pasif sözleşme bekçisi'),
        evidence('backend/src/integration/compliance/FindingService.ts', 'Bulgu kaydı', 'FindingService'),
      ],
    },
  ] satisfies ProvenItem[],
  planned: [
    {
      id: 'insan-onayi',
      icon: 'check',
      stage: 'development',
      title: 'Kritik işlemde insan onayı',
      text: 'Bir ajandan ya da sohbetten gelecek her değişiklik, yapay zekânın erişemeyeceği ayrı bir onay adımından geçecek.',
      basis: [evidence('docs/adr/0018-entegrasyon-uyum-izleme-ve-ajan-hazir-altyapi.md', 'ADR-0018 Karar 3c', 'Model veya ajan onay kanalına erişemez')],
    },
    {
      id: 'onaylayan-kimligi',
      icon: 'users',
      stage: 'development',
      title: 'Onaylayanın kimliğiyle',
      text: 'Onaylanan işlem sizin kimliğinizle ve ekranlardaki yetki denetimlerinin aynısıyla çalışacak; ajanlara ayrı bir yetki tanınmayacak.',
      basis: [evidence('docs/adr/0018-entegrasyon-uyum-izleme-ve-ajan-hazir-altyapi.md', 'ADR-0018 Karar 3c', 'onaylayan kullanıcının kimliğiyle')],
    },
    {
      id: 'kaynakli-kayit',
      icon: 'eye',
      stage: 'planned',
      title: 'Her adım kaynağıyla kayıtta',
      text: 'Ajan ve sohbet çağrıları, nereden geldikleri belirtilerek denetim kaydına yazılacak; kim neyi, hangi kanaldan istedi sorusunun yanıtı hazır olacak.',
      basis: [evidence('docs/adr/0018-entegrasyon-uyum-izleme-ve-ajan-hazir-altyapi.md', 'ADR-0018 Karar 3c guardrail (iii)', "source:'agent'")],
    },
  ] satisfies PlannedTrustItem[],
}

// ------------------------------------------------------------------------------------------ SSS

export const assistantFaq = {
  eyebrow: 'Merak edilenler',
  title: `${AGENT_BRAND} hakkında kısa yanıtlar`,
  items: [
    {
      id: 'ajan-ne-zaman',
      question: 'Ajanlar ne zaman kullanıma açılacak?',
      answer: 'Bugün bir tarih vermiyoruz. Ajanlar geliştirme aşamasında; hazır olduklarında önce erken erişim listesindeki işletmelerle paylaşacağız.',
    },
    {
      id: 'ajan-onay',
      question: 'Ajanlar benim onayım olmadan bir şey değiştirebilecek mi?',
      answer: 'Hayır. Ajanlar yalnızca öneri hazırlayacak; fiyat, stok ya da sipariş durumunu değiştirecek her adım sizin onayınızı bekleyecek. Onay adımı, yapay zekânın erişemeyeceği ayrı bir kanal olacak.',
    },
    {
      id: 'ajan-yetki',
      question: 'Ajanlar verilerime nasıl erişecek?',
      answer: 'Ajanlar ve sohbet, sizin hesabınız ve rolünüzün izinleriyle, ekranların kullandığı yetki denetimlerinin aynısıyla çalışacak. Rolünüzün yetmediği bir işlemi ajanlar da yapamayacak.',
    },
    {
      id: 'ajan-model-veri',
      question: 'Verilerim yapay zekâ modeline gönderilecek mi?',
      answer: 'Kullanılacak modeli siz seçeceksiniz; model yalnızca öneriyi hazırlamak için gereken veriyi görecek. Son müşterilerinizin ad, adres ve iletişim bilgileri gibi kişisel verileri varsayılan olarak maskelenecek.',
    },
    {
      id: 'ajan-ucret',
      question: `${AGENT_BRAND} ücretli olacak mı?`,
      answer: 'Kapsam ve fiyatlandırma henüz belirlenmedi; erken erişim sürecindeki geri bildirimlerle birlikte netleşecek.',
    },
  ],
}

// ------------------------------------------------------------------------------------------ CTA

export const assistantCta = {
  eyebrow: STAGE_LABELS['early-access'],
  title: 'Erken erişim listesine katılın',
  text: `${AGENT_BRAND} ajanlarını ilk deneyenlerden olmak ve geliştirme sürecine fikirlerinizle katkı vermek isterseniz bize yazın. Uygun aşamaya geldiğimizde sizinle iletişime geçeceğiz.`,
  subject: `${AGENT_BRAND} erken erişim`,
  subjectNote: 'E-postanın konu satırı hazır gelir:',
  sendLabel: 'Listeye katılmak için yazın',
  points: [
    'Form yok, hesap açmanız gerekmez: tek bir e-posta yeterli.',
    'Hangi takip işlerini ajanlara bırakmak istediğinizi yazarsanız önceliklendirmemize yön vermiş olursunuz.',
  ],
}

// ------------------------------------------------------------------------------------------ diğer yüzeyler

/** Ana sayfa bandı (UPCOMING yüzeyi). */
export const assistantTeaser = {
  eyebrow: 'Yakında',
  badge: STAGE_LABELS['early-access'],
  title: AGENT_NAME,
  lead: 'Operasyonunuzu izleyecek, hazır öneriler getirecek ve yalnızca sizin onayınızla uygulayacak ajanlar geliştiriyoruz. Sohbetle yönetim ve yerel uygulama da aynı yolda.',
  points: ['Gözle, öner, onayla, uygula, raporla', 'Kritik işlemde insan onayı', 'Her adım denetim kaydında'],
  cta: 'Ajanları keşfedin',
  bubbleAsk: 'Stok farkı bulundu',
  bubbleAnswer: 'Onayınız gerekiyor',
}

/**
 * Ana sayfa HERO girişi (S22, SR2-HOME) — istisna DEĞİL: claims.test.ts'in katı taramasından geçer ("yakında"/MCP/
 * yol haritası dili yok, rakam yok). Ad + tek cümle değer + sayfaya giriş; aşama etiketi görünür (dürüstlük).
 */
export const heroAgentEntry = {
  badge: STAGE_LABELS['early-access'],
  name: AGENT_NAME,
  value: 'Operasyonunuzu izleyecek, onayınızla çalışacak ajanlar geliştiriyoruz.',
  cta: 'Keşfedin',
}

/** Özellikler sayfası köprüsü — istisna DEĞİL: claims.test.ts'in katı taramasından geçer ("yakında"/MCP yok). */
export const featuresBridge = {
  eyebrow: 'Yolda',
  title: `Sırada: ${AGENT_NAME}`,
  text: 'Operasyon ajanları ve sohbetle yönetim üzerinde çalışıyoruz. Geliştirme aşamasındaki bu yetenekleri, bugün platformun sunduklarından ayrı tutmak için kendi sayfasında anlatıyoruz.',
  cta: `${AGENT_BRAND} sayfasına gidin`,
}

/** llms.txt / llms-full.txt satırı: "upcoming" notu; MCP adı ve "yakında" dili burada da KULLANILMAZ. */
export const assistantLlms = {
  short: 'upcoming — geliştirme aşamasında, platformun bugünkü sürümünde yok. Stok, sipariş ve katalog takibini izleyecek, öneri hazırlayacak ve yalnızca kullanıcı onayıyla uygulayacak operasyon ajanları; ayrıca sohbetle yönetim ve yerel uygulama için vizyon ve erken erişim.',
  full: [
    'Durum: upcoming (geliştirme aşamasında). Aşağıdakiler platformun bugünkü sürümünde YOKTUR.',
    'Ajan döngüsü: gözle, öner, onayla, uygula, raporla. Ajanlar yalnızca öneri hazırlayacak; değişiklikler kullanıcı onayıyla, kullanıcının kimliği ve yetkisiyle uygulanacak ve denetim kaydına yazılacak.',
    'Sohbetle yönetim: ekranlarla aynı yetenek kaydından beslenecek; değişiklikler önizleme ve kullanıcı onayıyla uygulanacak.',
    'Yerel uygulama: bilgisayara kurulan bir çalışma alanı olarak tasarlıyoruz; kullanıcı kendi yapay zekâ modelini seçecek.',
    'Bugün kodda olan temel: tek yetenek kaydı, sunucu tarafı yetki denetimi (varsayılan red), denetim kaydı, hesap başına ayrı veritabanı, ajan izinlerinin varsayılan kapalı olması.',
  ],
}
