/**
 * Otopilot VAAT KAYDI — tek doğruluk kaynağı (S24, kullanıcı kararları K43–K46).
 *
 * Karar (K43): Otopilot sitede "erken erişim / geliştirme aşamasında / yakında" diye SUNULMAZ; hazır bir özellik gibi,
 * şimdiki zamanla anlatılır. Buna karşılık her vaat cümlesi YALNIZCA bu dosyada yazılır ve yanında bir iç not taşır:
 *
 *   - `text`      : sitede görünen vaat (şimdiki zaman, kendinden emin; mutlak/garanti/abartı yok — testler tarar).
 *   - `readiness` : YAYIN ÖNCESİ ÜRÜN KONTROLÜ için iç not — sitede, llms metinlerinde, SEO'da GÖSTERİLMEZ
 *                   (tests/agent-claims.test.ts: sayfa verisine ve derleme çıktısına sızmaz).
 *       status   : 'live'     → bugün kodda çalışıyor (basis = repo içi kanıt; dosya + atıf metni test edilir)
 *                  'building' → geliştirmede (basis = tasarım kararı / ADR)
 *                  'planned'  → henüz başlanmadı
 *       note     : ürün ekibi için tek cümle — yayından önce neyin doğrulanması gerektiği.
 *
 * Sayfa ve bileşenler bu kaydı DOĞRUDAN okumaz: `assistant.ts` metni `claim(id)` ile alır (readiness nesnesi sayfa
 * verisine hiç girmez). Test: sayfa verisindeki her vaat alanı bu kayıttaki bir metne eşit; kullanılmayan vaat yok.
 * Ad metin olarak yazılmaz; `AGENT_BRAND` / `AGENT_NAME` şablonla kullanılır (ad sabiti testi).
 */
import { evidence, PATHS, type EvidenceRef } from './evidence'
import { AGENT_BRAND } from './agent-brand'

export type ClaimReadinessStatus = 'live' | 'building' | 'planned'

export interface ClaimReadiness {
  status: ClaimReadinessStatus
  note: string
  basis: EvidenceRef[]
}

export interface AgentClaim {
  text: string
  readiness: ClaimReadiness
}

const CAP = 'backend/src/capabilities'
const ADR18 = 'docs/adr/0018-entegrasyon-uyum-izleme-ve-ajan-hazir-altyapi.md'
const adr18 = (contains: string) => evidence(ADR18, 'ADR-0018 ajan-hazır altyapı', contains)

const planned = (note: string, basis: EvidenceRef[] = []): ClaimReadiness => ({ status: 'planned', note, basis })
const building = (note: string, basis: EvidenceRef[]): ClaimReadiness => ({ status: 'building', note, basis })
const live = (note: string, basis: EvidenceRef[]): ClaimReadiness => ({ status: 'live', note, basis })

export const AGENT_CLAIMS = {
  // ---------------------------------------------------------------- ana vaat (hero, ana sayfa, köprü, SEO)
  'core-title': {
    text: 'Operasyonunuzu izleyen, onayınızla çalışan ajanlar.',
    readiness: planned('Ajan çalışma zamanı henüz yok; yayından önce en az bir ajanın uçtan uca (izle → öner → onay → uygula) çalıştığı doğrulanmalı.', [adr18('Model veya ajan onay kanalına erişemez')]),
  },
  'core-lead': {
    text: 'Stok, sipariş ve katalogdaki sorunları fark eder, çözümü hazırlar ve onayınızla uygular.',
    readiness: planned('Stok farkı, sipariş takibi ve katalog sağlığı ajanlarının üçü de yayında olmalı; biri eksikse cümle daraltılmalı.'),
  },
  'core-short': {
    text: 'Operasyonunuzu izleyen, hazır öneriler getiren ve yalnızca onayınızla uygulayan ajanlar.',
    readiness: planned('core-title ile aynı koşul.'),
  },
  'bridge-text': {
    text: 'Stok, sipariş ve katalog takibini operasyon ajanlarına bırakın: ajanlar sorunu fark eder, çözümü hazırlar ve onayınızla uygular.',
    readiness: planned('core-lead ile aynı koşul.'),
  },

  'hero-moment': {
    text: 'Sorunu fark eder, öneriyi hazırlar; siz onaylayınca uygular.',
    readiness: planned('core-lead ile aynı koşul; ana sayfa vitrinindeki öneri → onay → uygulama anı (stok farkı örneği) üründe gösterilebilir olmalı.'),
  },

  // ---------------------------------------------------------------- ajan döngüsü
  'loop-lead': {
    text: 'Her ajan aynı beş adımlı döngüyle çalışır. Dört adımı ajan üstlenir; karar adımı yalnızca sizindir.',
    readiness: building('Döngü ADR-0018 Karar 3c ile tasarlandı; onay adımı ve kaynaklı kayıt kodda doğrulanmalı.', [adr18('onaylayan kullanıcının kimliğiyle')]),
  },
  'loop-watch': {
    text: 'Kanallar arası stok farkını, geciken siparişi ve reddedilen ürünü izler.',
    readiness: planned('Üç sinyalin her biri için tespit kuralı ve eşik tanımı gerekli.'),
  },
  'loop-propose': {
    text: 'Bulduğunu sade bir özetle ve değişikliğin önizlemesiyle önünüze getirir.',
    readiness: planned('Önizleme kartı (değişiklik öncesi/sonrası) arayüzde olmalı.'),
  },
  'loop-approve': {
    text: 'Öneriyi inceler, onaylar ya da reddedersiniz; karar sizindir.',
    readiness: building('Onay kanalı modelden ayrı olmalı (ADR-0018 Karar 3c).', [adr18('Model veya ajan onay kanalına erişemez')]),
  },
  'loop-apply': {
    text: 'Onaylanan işlem sizin yetkinizle, paneldeki kurallarla birebir aynı şekilde uygulanır.',
    readiness: building('Uygulama, onaylayanın kimliğiyle ve mevcut yetki denetimiyle çalışmalı.', [adr18('onaylayan kullanıcının kimliğiyle')]),
  },
  'loop-report': {
    text: 'Sonuç size özetlenir; her adım kayıt altına alınır.',
    readiness: building("Ajan çağrıları denetim kaydına kaynağıyla (source:'agent') yazılmalı.", [adr18("source:'agent'")]),
  },
  'loop-principle': {
    text: 'Tespitler tanımlı kurallarla yapılır; yapay zekâ size anlaşılır bir özet ve öneri sunar.',
    readiness: planned('Kural katmanı ile özet katmanının ayrımı uygulamada korunmalı.'),
  },

  // ---------------------------------------------------------------- ajanlar
  'agents-lead': {
    text: 'Tekrar eden takip işlerini ajanlar üstlenir; ekibiniz satışa odaklanır.',
    readiness: planned('Dört ajanın yayında olması gerekir.'),
  },
  'agent-monitor': {
    text: 'Pazaryeri tarafındaki değişiklikleri izler ve etkisini özetler; olası bir aksaklık size ulaşmadan ele alınır.',
    readiness: building('Pasif sözleşme bekçisi kodda; üzerine kurulan izleme ajanı henüz yok.', [
      evidence('backend/src/integration/compliance/ContractGuard.ts', 'ADR-0018 Karar 2a pasif sözleşme bekçisi', 'Pasif sözleşme bekçisi'),
    ]),
  },
  'agent-monitor-watches': { text: 'Kanal bağlantılarındaki değişiklikler', readiness: building('agent-monitor ile aynı.', []) },
  'agent-monitor-brings': { text: 'Etki özeti ve çözüm önerisi', readiness: building('agent-monitor ile aynı.', []) },
  'agent-orders': {
    text: 'Geciken ya da bir adımda takılan siparişleri fark eder ve öncelik sırasına dizilmiş bir eylem listesi sunar.',
    readiness: planned('Sipariş takip ajanı henüz yok.'),
  },
  'agent-orders-watches': { text: 'Geciken ve takılı kalan siparişler', readiness: planned('agent-orders ile aynı.') },
  'agent-orders-brings': { text: 'Önceliklendirilmiş eylem listesi', readiness: planned('agent-orders ile aynı.') },
  'agent-catalog': {
    text: 'Reddedilen ya da eksik bilgili ürünleri bulur ve düzeltme için hazır bir taslak getirir.',
    readiness: planned('Katalog sağlığı ajanı henüz yok.'),
  },
  'agent-catalog-watches': { text: 'Reddedilen ve eksik bilgili ürünler', readiness: planned('agent-catalog ile aynı.') },
  'agent-catalog-brings': { text: 'Düzeltme taslağı', readiness: planned('agent-catalog ile aynı.') },
  'agent-stock': {
    text: 'Kanallar arasındaki stok farklarının nedenini sade bir dille açıklar ve düzeltici adımı onayınıza sunar.',
    readiness: planned('Stok farkı ajanı henüz yok.'),
  },
  'agent-stock-watches': { text: 'Kanallar arası stok farkları', readiness: planned('agent-stock ile aynı.') },
  'agent-stock-brings': { text: 'Neden açıklaması ve düzeltici adım', readiness: planned('agent-stock ile aynı.') },

  // ---------------------------------------------------------------- kontrol ve güven
  'control-lead': {
    text: 'Ajanlar hızlıdır ama başıboş değildir: her öneri onayınızdan geçer, her adım kayda girer.',
    readiness: building('Onay kapısı ve kaynaklı kayıt birlikte yayında olmalı.', [adr18('Model veya ajan onay kanalına erişemez')]),
  },
  'control-gate': {
    text: 'Fiyat, stok ya da sipariş durumunu değiştiren her öneri, ayrı bir onay adımından geçer.',
    readiness: building('Onay adımı yapay zekânın erişemeyeceği ayrı kanal olmalı.', [adr18('Model veya ajan onay kanalına erişemez')]),
  },
  'control-readonly': {
    text: 'Ajanlar veriyi okuyup öneri hazırlar; değişiklik yalnızca sizin onayladığınız adımda uygulanır.',
    readiness: live('Bugün hiçbir yetenek ajanlara açık değil (varsayılan kapalı); açılırken salt-okuma varsayılanı korunmalı.', [
      evidence(`${CAP}/define.ts`, 'Varsayılan ajan kararı: kapalı', 'export const NO_AGENT: AgentDecision = { allowed: false }'),
    ]),
  },
  'control-audit': {
    text: 'Kim neyi, ne zaman onayladı sorusunun yanıtı her an hazırdır.',
    readiness: building('Denetim kaydı kodda; ajan adımlarının kaynağıyla yazılması gerekiyor.', [
      evidence('backend/src/services/audit/AuditLogger.ts', 'AuditLogger asgari denetim kaydı', 'asgari denetim kaydı'),
    ]),
  },
  // PRC-MKT (K58): adil rekabet ilkesinin Otopilot karşılığı — yalnız İLKE dili; fiyatlama özelliği vaat edilmez (K43).
  'trust-price': {
    text: 'Ajanlar fiyat kararını sizin yerinize vermez: fiyata dokunan bir öneri yalnızca sizin kurallarınıza ve sizin verinize dayanır; başka bir işletmenin verisi hesaba katılmaz.',
    readiness: building('Fiyat önerisi yapan ajan yok; yayına girdiğinde AUTO_PRICING_LEGAL §c K2 (işletmeler arası veri yok) ve K4 (satıcının kendi kuralı, dayatılan değer yok) korunmalı.', [
      evidence(PATHS.adr0003, 'ADR-0003 hesap başına veri alanı', 'entegrasyonikClient_1'),
      adr18('Model veya ajan onay kanalına erişemez'),
    ]),
  },
  'trust-data': {
    text: 'Verileriniz yalnızca size aittir ve izole bir alanda korunur; ajanlar yalnızca sizin hesabınızın verisiyle çalışır.',
    readiness: live('Hesap başına ayrı veri alanı ve şifreli anahtarlar kodda; ajan erişiminin oturumdaki hesapla sınırlı kaldığı doğrulanmalı.', [
      evidence(PATHS.adr0003, 'ADR-0003 hesap başına veri alanı', 'entegrasyonikClient_1'),
      evidence('backend/src/utils/FieldCrypto.ts', 'Alan şifreleme', 'AES-256-GCM'),
    ]),
  },
  'trust-role': {
    text: 'Her işlem rolünüzün izinleriyle denetlenir; yetkinizin yetmediği bir işlemi ajan da yapamaz.',
    readiness: live('Sunucu tarafı yetki denetimi (varsayılan red) kodda; ajan çağrılarının aynı yoldan geçtiği doğrulanmalı.', [
      evidence('backend/src/api/rpc/operationPolicy.ts', 'operationPolicy varsayılan red', 'varsayılan olarak REDDEDİLİR'),
    ]),
  },

  // ---------------------------------------------------------------- sohbet
  'chat-lead': {
    text: 'Sorunuzu günlük dille yazın; sohbet, paneldeki işlemlerin aynısını aynı kurallarla çalıştırır.',
    readiness: building('Sohbet ekranlarla aynı yetenek kaydından beslenmeli (ADR-0019).', [
      evidence(`${CAP}/index.ts`, 'Yetenek kaydı: tek gerçek kaynak (ADR-0019 §1)', 'Yetenek Kaydı — TEK gerçek kaynak'),
    ]),
  },
  'chat-natural': {
    text: 'Menü aramadan, konuşur gibi yazın; ihtiyacınız olan ekran ve filtre sizin için bulunur.',
    readiness: planned('Doğal dil → ekran/filtre eşlemesi henüz yok.'),
  },
  'chat-same-rules': {
    text: 'Sohbetten yapılan her işlem, paneldeki izin ve kurallarla birebir aynı şekilde çalışır.',
    readiness: building('Yetki tablosu yetenek kaydından türetiliyor; sohbet aynı denetimden geçmeli.', [
      evidence(`${CAP}/derive/policy.ts`, 'Yetki tablosu kayıttan türetilir', 'export function derivePolicy'),
    ]),
  },
  'chat-cards': {
    text: 'Yanıtlar kart ve tablo olarak gelir; tek dokunuşla ilgili ekrana geçip kaldığınız yerden devam edersiniz.',
    readiness: planned('Sohbet yanıtlarında uygulama bileşenleri (kart/tablo) henüz yok.'),
  },
  'chat-preview': {
    text: 'Değişiklik isteyen her mesaj önce bir önizleme kartına dönüşür; siz onaylayınca uygulanır.',
    readiness: building('Önizleme + onay akışı ADR-0018 Karar 3c ile tasarlandı.', [adr18('Model veya ajan onay kanalına erişemez')]),
  },

  // ---------------------------------------------------------------- SSS
  'faq-approval': {
    text: 'Hayır. Ajanlar öneri hazırlar; fiyat, stok ya da sipariş durumunu değiştiren her adım onayınızı bekler.',
    readiness: building('control-gate ile aynı.', [adr18('Model veya ajan onay kanalına erişemez')]),
  },
  'faq-access': {
    text: 'Ajanlar yalnızca sizin hesabınızla ve rolünüzün izinleriyle çalışır. Rolünüzün yetmediği bir işlemi ajanlar da yapamaz.',
    readiness: live('trust-role ile aynı.', [evidence('backend/src/api/rpc/operationPolicy.ts', 'operationPolicy varsayılan red', 'varsayılan olarak REDDEDİLİR')]),
  },
  'faq-privacy': {
    text: 'Verileriniz yalnızca size aittir ve izole bir alanda korunur; entegrasyon anahtarlarınız şifreli saklanır. Öneri hazırlanırken alıcılarınızın kişisel bilgileri varsayılan olarak maskelenir.',
    readiness: planned('Kişisel veri maskeleme henüz yok; yayından önce uygulanmalı ya da ikinci cümle kaldırılmalı.'),
  },
  'faq-start': {
    text: `Demo talep edin; ${AGENT_BRAND} ajanlarını işletmenizin akışı üzerinde birlikte inceleyelim.`,
    readiness: planned('Demo süreci (kim, hangi ortamda gösterir) satış ekibiyle netleşmeli.'),
  },

  // ---------------------------------------------------------------- CTA
  'cta-text': {
    text: 'Kısa bir demoda ajanların kanallarınızda neyi izlediğini ve size nasıl öneri getirdiğini gösterelim.',
    readiness: planned('Demo ortamı gerekli.'),
  },

  // ---------------------------------------------------------------- llms.txt / llms-full.txt
  'llms-short': {
    text: 'Stok, sipariş ve katalog takibini izleyen, öneri hazırlayan ve yalnızca kullanıcı onayıyla uygulayan operasyon ajanları; sohbetle yönetim.',
    readiness: planned('core-lead ile aynı koşul.'),
  },
  'llms-loop': {
    text: 'Ajan döngüsü: gözle, öner, onayla, uygula, raporla. Değişiklikler kullanıcı onayıyla, kullanıcının yetkisiyle uygulanır ve kayda geçer.',
    readiness: building('loop-* ile aynı.', [adr18('onaylayan kullanıcının kimliğiyle')]),
  },
  'llms-chat': {
    text: 'Sohbetle yönetim: panelle aynı işlemler ve aynı yetki kuralları; değişiklikler önizleme ve kullanıcı onayıyla uygulanır.',
    readiness: building('chat-* ile aynı.', [adr18('Model veya ajan onay kanalına erişemez')]),
  },
  'llms-trust': {
    text: 'Güven: veriler yalnızca işletmeye aittir ve izole bir alanda korunur; entegrasyon anahtarları şifreli saklanır; her işlem kullanıcının rol izinleriyle denetlenir.',
    readiness: live('trust-data + trust-role ile aynı.', [evidence('backend/src/api/rpc/operationPolicy.ts', 'operationPolicy varsayılan red', 'varsayılan olarak REDDEDİLİR')]),
  },
} as const satisfies Record<string, AgentClaim>

export type AgentClaimId = keyof typeof AGENT_CLAIMS

/** Vaat metni (yalnızca metin; `readiness` sayfa verisine girmez). */
export const claim = (id: AgentClaimId): string => AGENT_CLAIMS[id].text
