/**
 * Entegrasyonik Asistan — "yolda" (upcoming) anlatısı (S18; ADR-0019 yetenek kaydı + Chat-as-UI eşitliği,
 * ADR-0018 entegrasyon uyum izleme + ajan-hazır altyapı, ADR-0009 MCP topolojisi, ADR-0007 yerel uygulama).
 *
 * DÜRÜSTLÜK SINIRI: Sohbetle yönetim, yerel uygulama ve ajanlar ürünün bugünkü sürümünde YOK. Bu dosya iki tür
 * içerik taşır ve ikisini veri düzeyinde ayırır:
 *   - `planned`  : geliştirme aşamasındaki / planlanan yetenekler. Her kart bir `stage` etiketi taşır ve metni
 *                  gelecek/niyet kipindedir ("-acak/-ecek", "geliştiriyoruz"); kesin kip ("yapar/yapıyor") YOK.
 *   - `proven`   : altyapısı bugün kodda olan güvence maddeleri. Her madde repo içi `evidence` taşır
 *                  (claims.test.ts ile aynı PATHS/`evidence` deseni: dosya mevcut + atıf metni dosyada geçer).
 * `scenario` bir ÖRNEK senaryodur (canlı ürün değildir); içindeki rakamlar ve ürün adları kurgusal örnek veridir.
 *
 * İSTİSNA KAPSAMI (dar ve gerekçeli): "yakında/planlanan" dili ve "MCP" adı yalnızca `UPCOMING_SURFACES`
 * içinde (bu sayfa + ana sayfa bandı) görünebilir. Diğer tüm sayfalar claims.test.ts'in katı kurallarında kalır;
 * Özellikler köprüsü (`featuresBridge`) istisna DEĞİLDİR ve katı taramadan geçer. Koruma: tests/upcoming.test.ts.
 */
import { evidence, PATHS, type EvidenceRef } from './evidence'

export const ASSISTANT_NAME = 'Entegrasyonik Asistan'
export const ASSISTANT_PATH = '/asistan'

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

export type AssistantIcon = 'chat' | 'layers' | 'eye' | 'check' | 'bolt' | 'key' | 'book' | 'link' | 'plug' | 'orders' | 'stock' | 'refresh' | 'search' | 'sparkle'

export interface PlannedCard {
  id: string
  icon: AssistantIcon
  stage: AssistantStage
  title: string
  text: string
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
  eyebrow: 'Entegrasyonik Asistan',
  badge: STAGE_LABELS['early-access'],
  title: 'Operasyonunuzu sohbetle yönetin.',
  accent: 'sohbetle',
  lead: 'Stoğunuzu, siparişlerinizi ve fiyatlarınızı günlük dille yöneteceğiniz bir asistan geliştiriyoruz. Siz sorunuzu yazacaksınız; asistan yanıtı panelinizdeki güncel veriden hazırlayacak, değişiklikleri ise yalnızca sizin onayınızla uygulayacak.',
  note: 'Geliştirme aşamasında: sohbetle yönetim, yerel uygulama ve ajanlar ürünün bugünkü sürümünde yoktur.',
  primary: 'Erken erişim listesine katılın',
  secondary: 'Nasıl çalışacak?',
}

// ------------------------------------------------------------------------------------------ örnek senaryo (hero sahnesi)

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

/** Hero sohbet sahnesi: kurgusal örnek veri. Rakamlar yalnızca burada serbesttir (upcoming.test.ts). */
export const assistantScenario = {
  label: 'Örnek senaryo',
  caption: 'Temsilî tasarım; canlı ürün ekranı değildir. Ürün adları ve rakamlar örnektir.',
  windowTitle: 'Asistan',
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
  typing: 'Asistan yazıyor',
  inputPlaceholder: 'Bir şey sorun…',
}

// ------------------------------------------------------------------------------------------ bölümler (planlanan)

export const chatSection = {
  eyebrow: 'Sohbetle yönet',
  title: 'Sorunuzu yazın, gerisini ekranlarla aynı yetenekler üstlensin',
  lead: 'Asistan, uygulamadaki ekranların kullandığı işlemlerin aynısını çağıracak. Ayrı, eksik ya da farklı davranan bir kopya olmayacak; sohbete açılan her işlem, ekrandaki kurallarla birebir aynı şekilde çalışacak.',
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
      text: 'Stok, sipariş ve ürün sorularınızı menü aramadan, konuşur gibi yazabileceksiniz. Asistan hangi ekrana ve filtreye ihtiyacınız olduğunu sizin yerinize bulacak.',
    },
    {
      id: 'ayni-yetenek',
      icon: 'layers',
      stage: 'development',
      title: 'Ekranlarla aynı yetenekler',
      text: 'Sohbet, ekranların kullandığı yetenek kaydının aynısından beslenecek. Uygulamaya eklenen her yeni yetenek için sohbette yer alıp almayacağı açıkça kararlaştırılacak; sohbete açılanlar aynı izin kurallarıyla çalışacak.',
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

export const localSection = {
  eyebrow: 'Yerel uygulama',
  title: 'Bilgisayarınızda, iş akışınızın tam ortasında',
  lead: 'Asistanı bilgisayarınıza kurulan hafif bir uygulama olarak tasarlıyoruz. Panel sekmeleri arasında dolaşmak yerine sorunuzu yazacak, yanıtı ve onay kartını aynı pencerede göreceksiniz.',
  protocol: {
    name: 'Model Context Protocol (MCP)',
    short: 'MCP',
    nodes: [ASSISTANT_NAME, 'Yetenek kaydı ve yetki'],
    title: 'Açık standart: Model Context Protocol',
    text: 'MCP, yapay zekâ uygulamalarının iş yazılımlarına standart ve denetimli bir yoldan bağlanması için geliştirilmiş açık bir protokoldür. Onu ortak bir priz gibi düşünebilirsiniz: asistan, Entegrasyonik’e kapalı ve özel bir kabloyla değil, tanımlı araçlar ve izinler üzerinden bağlanacak.',
    points: [
      'Asistanın neyi yapabileceği, sunucudaki yetenek listesiyle sınırlı olacak.',
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
      text: 'Tarayıcı sekmelerinden bağımsız, tek pencerelik bir çalışma alanı olacak. Sık sorduğunuz sorular ve son yanıtlar bir tık uzağınızda duracak.',
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
      text: 'Asistan yalnızca sizin seçtiğiniz dosyayı okuyabilecek. Örneğin tedarikçi fiyat listesini sohbete bırakıp güncel fiyatlarınızla karşılaştırma isteyebileceksiniz.',
    },
    {
      id: 'is-akisi',
      icon: 'link',
      stage: 'planned',
      title: 'Açık uçlu bağlantı',
      text: 'Açık standart sayesinde, zamanla kullandığınız diğer uyumlu yapay zekâ araçlarından da Entegrasyonik’e aynı izinlerle bağlanabilmeyi hedefliyoruz.',
    },
  ] satisfies PlannedCard[],
}

export const agentsSection = {
  eyebrow: 'Ajanlar',
  title: 'Arka planda göz kulak olan yardımcılar',
  lead: 'Ajanları, tekrar eden takip işlerini sizin yerinize izleyen ve size hazır bir öneri getiren yardımcılar olarak planlıyoruz. Ajanlar yalnızca öneri hazırlayacak; uygulama kararı sizde kalacak.',
  flowLabel: 'Bir ajanın çalışma biçimi',
  flow: ['Sinyal', 'Ajan önerisi', 'Sizin onayınız', 'Uygulama'],
  highlight: { id: 'uyum-izleme', label: 'İlk hedefimiz' },
  principle: 'Önce kural, sonra yapay zekâ: tespit ve eşikler kodda tanımlı olacak; yapay zekâ yalnızca özetleme ve öneri metni katmanında devreye girecek.',
  cards: [
    {
      id: 'uyum-izleme',
      icon: 'search',
      stage: 'development',
      title: 'Entegrasyon izleme ajanı',
      text: 'Pazaryeri API’lerindeki değişiklikleri takip edecek, etkisini özetleyecek ve ekibimize düzeltme önerisi hazırlayacak. Böylece kanal tarafındaki bir değişiklik size ulaşmadan ele alınabilecek.',
    },
    {
      id: 'siparis-takip',
      icon: 'orders',
      stage: 'planned',
      title: 'Sipariş takip yardımcısı',
      text: 'Geciken ya da bir adımda takılı kalan siparişleri fark edecek ve size öncelik sırasına dizilmiş bir eylem listesi önerecek.',
    },
    {
      id: 'katalog-sagligi',
      icon: 'layers',
      stage: 'planned',
      title: 'Katalog sağlığı yardımcısı',
      text: 'Kanal tarafından reddedilen ya da eksik bilgili ürünleri bulacak ve düzeltme için hazır bir taslak getirecek.',
    },
    {
      id: 'stok-farki',
      icon: 'stock',
      stage: 'planned',
      title: 'Stok farkı açıklayıcı',
      text: 'Kanallar arasındaki stok farklarının nedenini sade bir dille açıklayacak ve düzeltici adımı onayınıza sunacak.',
    },
  ] satisfies PlannedCard[],
}

// ------------------------------------------------------------------------------------------ güven (kanıtlı vs planlanan)

const CAP = 'backend/src/capabilities'

export const trustSection = {
  eyebrow: 'Güven',
  title: 'Güven, asistandan önce kuruldu',
  lead: 'Asistanın dayanacağı güvenlik temelleri bugün üründe çalışıyor. Aşağıda kodda olanları ve asistanla birlikte geleceklerini ayrı ayrı gösteriyoruz.',
  provenLabel: 'Bugün kodda',
  provenTag: 'Kodda',
  provenLead: 'Bu maddelerin her biri ürünün bugünkü yazılımında uygulanmıştır.',
  plannedLabel: 'Asistanla birlikte gelecek',
  plannedLead: 'Bu maddeler tasarım kararı olarak yazıldı; asistanla birlikte uygulanacak.',
  proven: [
    {
      id: 'yetenek-kaydi',
      icon: 'layers',
      title: 'Tek yetenek kaydı',
      text: 'Uygulamadaki işlemler tek bir yetenek kaydında tanımlıdır ve rol tabanlı yetki tablosu bu kayıttan üretilir. Asistan da aynı kayıttan beslenecek.',
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
      text: 'Her müşteri hesabı için ayrı bir operasyon veritabanı kullanılır; asistan da yalnızca oturum açtığınız hesabın verisiyle çalışacak.',
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
      text: 'Sohbetten ya da bir ajandan gelecek her değişiklik, yapay zekânın erişemeyeceği ayrı bir onay adımından geçecek.',
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
      text: 'Asistan ve ajan çağrıları, nereden geldikleri belirtilerek denetim kaydına yazılacak; kim neyi, hangi kanaldan istedi sorusunun yanıtı hazır olacak.',
      basis: [evidence('docs/adr/0018-entegrasyon-uyum-izleme-ve-ajan-hazir-altyapi.md', 'ADR-0018 Karar 3c guardrail (iii)', "source:'agent'")],
    },
  ] satisfies PlannedTrustItem[],
}

// ------------------------------------------------------------------------------------------ SSS

export const assistantFaq = {
  eyebrow: 'Merak edilenler',
  title: 'Asistan hakkında kısa yanıtlar',
  items: [
    {
      id: 'asistan-ne-zaman',
      question: 'Asistan ne zaman kullanıma açılacak?',
      answer: 'Bugün bir tarih vermiyoruz. Asistan geliştirme aşamasında; hazır olduğunda önce erken erişim listesindeki işletmelerle paylaşacağız.',
    },
    {
      id: 'asistan-yetki',
      question: 'Asistan verilerime nasıl erişecek?',
      answer: 'Asistan, sizin hesabınız ve rolünüzün izinleriyle, ekranların kullandığı yetki denetimlerinin aynısıyla çalışacak. Rolünüzün yetmediği bir işlemi sohbetten de yapamayacaksınız.',
    },
    {
      id: 'asistan-model-veri',
      question: 'Verilerim yapay zekâ modeline gönderilecek mi?',
      answer: 'Kullanılacak modeli siz seçeceksiniz; model yalnızca sorunuzu yanıtlamak için gereken veriyi görecek. Son müşterilerinizin ad, adres ve iletişim bilgileri gibi kişisel verileri varsayılan olarak maskelenecek.',
    },
    {
      id: 'asistan-ucret',
      question: 'Asistan ücretli olacak mı?',
      answer: 'Kapsam ve fiyatlandırma henüz belirlenmedi; erken erişim sürecindeki geri bildirimlerle birlikte netleşecek.',
    },
  ],
}

// ------------------------------------------------------------------------------------------ CTA

export const assistantCta = {
  eyebrow: STAGE_LABELS['early-access'],
  title: 'Erken erişim listesine katılın',
  text: 'Asistanı ilk deneyenlerden olmak ve geliştirme sürecine fikirlerinizle katkı vermek isterseniz bize yazın. Uygun aşamaya geldiğimizde sizinle iletişime geçeceğiz.',
  subject: 'Asistan erken erişim',
  subjectNote: 'E-postanın konu satırı hazır gelir:',
  sendLabel: 'Listeye katılmak için yazın',
  points: [
    'Form yok, hesap açmanız gerekmez: tek bir e-posta yeterli.',
    'Hangi işleri sohbetle yapmak istediğinizi yazarsanız önceliklendirmemize yön vermiş olursunuz.',
  ],
}

// ------------------------------------------------------------------------------------------ diğer yüzeyler

/** Ana sayfa bandı (UPCOMING yüzeyi). */
export const assistantTeaser = {
  eyebrow: 'Yakında',
  badge: STAGE_LABELS['early-access'],
  title: 'Entegrasyonik Asistan',
  lead: 'Operasyonunuzu sohbetle yöneteceğiniz asistanı geliştiriyoruz: sorunuzu günlük dille yazacaksınız, sonucu kartlarla göreceksiniz; kritik her işlem sizin onayınızla ilerleyecek.',
  points: ['Ekranlarla aynı yetenekler', 'Kritik işlemde insan onayı', 'Yerel uygulama'],
  cta: 'Asistanı keşfedin',
  bubbleAsk: 'Stoku azalan ürünleri göster',
  bubbleAnswer: 'Onayınız gerekiyor',
}

/** Özellikler sayfası köprüsü — istisna DEĞİL: claims.test.ts'in katı taramasından geçer ("yakında"/MCP yok). */
export const featuresBridge = {
  eyebrow: 'Yolda',
  title: 'Sırada: Entegrasyonik Asistan',
  text: 'Sohbetle yönetim ve yardımcı ajanlar üzerinde çalışıyoruz. Geliştirme aşamasındaki bu yetenekleri, bugün ürünün sunduklarından ayrı tutmak için kendi sayfasında anlatıyoruz.',
  cta: 'Asistan sayfasına gidin',
}

/** llms.txt / llms-full.txt satırı: "upcoming" notu; MCP adı ve "yakında" dili burada da KULLANILMAZ. */
export const assistantLlms = {
  short: 'upcoming — geliştirme aşamasında, ürünün bugünkü sürümünde yok. Sohbetle yönetim, yerel uygulama ve öneri hazırlayan ajanlar için vizyon ve erken erişim.',
  full: [
    'Durum: upcoming (geliştirme aşamasında). Aşağıdakiler ürünün bugünkü sürümünde YOKTUR.',
    'Sohbetle yönetim: ekranlarla aynı yetenek kaydından beslenecek; değişiklikler önizleme ve kullanıcı onayıyla uygulanacak.',
    'Yerel uygulama: bilgisayara kurulan bir çalışma alanı olarak tasarlıyoruz; kullanıcı kendi yapay zekâ modelini seçecek.',
    'Ajanlar: yalnızca öneri hazırlayacak; uygulama kararı kullanıcıda kalacak.',
    'Bugün kodda olan temel: tek yetenek kaydı, sunucu tarafı yetki denetimi (varsayılan red), denetim kaydı, hesap başına ayrı veritabanı, ajan izinlerinin varsayılan kapalı olması.',
  ],
}
