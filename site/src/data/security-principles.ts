/**
 * Güvenlik güvence ilkeleri (S16) — `/guvenlik` sayfasının YÖNETİCİ DÜZEYİ çerçevesi.
 *
 * Kullanıcı isteği: "teknik ayrıntı yığını yerine 4-6 güvence ilkesi; her biri kısa başlık + tek cümle değer +
 * isteğe bağlı ayrıntı". Kurallar (ADR-0014 Karar 5):
 * - Her ilke ya kanıtlı güvenlik yetenek kayıtlarına (`capabilityIds` → src/data/capabilities.ts, kanıtları
 *   tests/claims.test.ts doğrular) ya da kendi `points[].evidence` atıflarına dayanır (tests/pages.test.ts dosyanın
 *   varlığını ve atıf metnini doğrular). Kanıtı olmayan cümle yazılmaz.
 * - Sertifika (ISO 27001, SOC 2 vb.), veri konumu, SLA veya süre/rakam iddiası YOK (AES-256-GCM algoritma adı hariç).
 * - Her güvenlik yetenek kaydı tam bir ilkeye bağlanır (kayıt kaybolmaz; test eder).
 */
import { evidence, type EvidenceRef } from './evidence'

export interface SecurityPoint {
  text: string
  evidence: EvidenceRef[]
}

export interface SecurityPrinciple {
  id: string
  icon: 'database' | 'key' | 'lock' | 'eye' | 'shield' | 'refresh'
  title: string
  /** Tek cümlelik değer önermesi (yönetici düzeyi). */
  value: string
  /** Ayrıntı: ilgili güvenlik yetenek kayıtları (`/guvenlik` bunları "Ayrıntı" altında gösterir). */
  capabilityIds: string[]
  /** Ayrıntı: yetenek kaydı olmayan, kendi kanıtıyla gelen maddeler. */
  points: SecurityPoint[]
}

export const securityPrinciples: SecurityPrinciple[] = [
  {
    id: 'izolasyon',
    icon: 'database',
    title: 'Veri izolasyonu',
    value: 'Verileriniz yalnızca size aittir; ürün, stok ve sipariş verileriniz izole bir alanda tutulur.',
    capabilityIds: ['tenant-database'],
    points: [],
  },
  {
    id: 'sifreleme',
    icon: 'key',
    title: 'Şifreleme',
    value: 'Pazaryeri ve entegrasyon anahtarlarınız güçlü şifrelemeyle saklanır; kaydedildikten sonra ekranlarda açık gösterilmez.',
    capabilityIds: ['secrets-encryption', 'secrets-masked'],
    // S27c: algoritma adı özet cümleden "Ayrıntı" paneline taşındı (BRAND §3 — teknik ayrıntının tek yeri).
    points: [
      {
        text: 'Şifreleme, endüstri standardı AES-256-GCM algoritmasıyla yapılır.',
        evidence: [evidence('backend/src/utils/FieldCrypto.ts', 'Alan şifreleme algoritması', 'AES-256-GCM')],
      },
    ],
  },
  {
    id: 'erisim',
    icon: 'lock',
    title: 'Erişim ve oturum güvenliği',
    value: 'Ekibinizde kimin neyi yapabileceğini rol kademeleri belirler; yetkisi tanımlanmamış bir işlem yapılamaz.',
    capabilityIds: ['role-based-access', 'default-deny', 'session-cookie'],
    points: [],
  },
  {
    id: 'denetim',
    icon: 'eye',
    title: 'Denetim izi',
    value: 'Oturum açma ve hassas hesap işlemleri, yalnızca gerekli asgari bilgiyle denetim kaydına yazılır.',
    capabilityIds: [],
    points: [
      {
        text: 'Denetim kaydında kişisel veri olarak yalnızca kullanıcı kimliği, hesap ve bağlantı adresi tutulur; e-posta, parola, oturum belirteci veya istek içeriği yazılmaz.',
        evidence: [evidence('backend/src/database/application/models/AuditLog.ts', 'AuditLog asgari alanlar', 'PII olarak YALNIZCA sub / tid / ip')],
      },
      {
        text: 'Kayıtlar hesap bazında ayrılır ve belirlenen saklama süresinin sonunda otomatik olarak silinir.',
        evidence: [
          evidence('backend/src/database/application/models/AuditLog.ts', 'AuditLog otomatik silme', 'expireAfterSeconds'),
          evidence('backend/src/api/rpc/handlers/audit-service.ts', 'Denetim kaydı hesap filtresi', "KENDİ tenant'ının `AuditLogs` kayıtlarını okuma"),
        ],
      },
    ],
  },
  {
    id: 'kvkk',
    icon: 'shield',
    title: 'KVKK ve veri işleme',
    value: 'Mağazanızın müşteri verilerinde siz veri sorumlusu, Entegrasyonik veri işleyendir; verinizi dışa aktarabilir ve silinmesini talep edebilirsiniz.',
    capabilityIds: ['hosted-payment'],
    points: [
      {
        text: 'Rol dağılımı abonelik sözleşmesinin veri işleme ekinde tanımlanır (metin hukuki inceleme aşamasındadır).',
        evidence: [evidence('site/src/data/legal/abonelik-sozlesmesi.ts', 'Veri işleme eki rol dağılımı', 'Abone veri sorumlusu, Hizmet Sağlayıcı veri işleyendir.')],
      },
      {
        text: 'Hesap sahibi hesap verilerini panelden dışa aktarabilir; hesabın silinmesini ise parola doğrulamasıyla talep edebilir.',
        evidence: [
          evidence('backend/src/api/rpc/handlers/tenant-data-service.ts', 'KVKK dışa aktarma', 'async exportTenantData'),
          evidence('backend/src/api/rpc/handlers/tenant-data-service.ts', 'KVKK silme talebi', 'async requestDeletion'),
          evidence('frontend/src/views/secure/user/PrivacyDataView.vue', 'Gizlilik ve veri ekranı'),
        ],
      },
    ],
  },
  {
    id: 'sureklilik',
    icon: 'refresh',
    title: 'Yedekleme ve süreklilik',
    value: 'Verilerinizi etkileyen bakım adımları doğrulanmış yedek şartına bağlıdır; pazaryeri bağlantılarındaki geçici kesintiler kontrollü biçimde yönetilir.',
    capabilityIds: ['integration-resilience'],
    points: [
      {
        text: 'Şema ve veri değişiklikleri kademeli uygulanır; her değişiklik öncesinde doğrulanmış yedek aranır ve geri dönüş yolu tanımlanır.',
        evidence: [
          evidence('docs/adr/0021-veri-modeli-ve-sema-modernizasyonu.md', 'ADR-0021 doğrulanmış yedek kuralı', 'her DB değişikliği doğrulanmış yedek'),
          evidence('backend/src/database/application/models/SchemaMigration.ts', 'Göç kaydında yedek referansı', 'backupRef'),
        ],
      },
    ],
  },
]

