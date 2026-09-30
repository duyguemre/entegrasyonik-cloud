/**
 * Backoffice sohbet metin ezmeleri (host `t`, anahtar `chat.<paket anahtarı>`): paket metinleri müşteri/tenant diliyle
 * yazılmıştır ("hesap sahibi", "ekip"); backoffice'te anahtar PLATFORM anahtarıdır ve onayı platform yöneticisi verir.
 * Yalnız anlamı değişen metinler ezilir; geri kalanı paketin kendi metnidir. Parametreler paket gibi `{ad}` ile doldurulur.
 */
export const BO_CHAT_TEXTS: Record<string, string> = {
  'setup.intro': '{name}, platformun kendi yapay zekâ sağlayıcı anahtarıyla çalışır. Anahtar şifreli saklanır, hiçbir yanıtta geri gösterilmez; kullanım ücreti bu sağlayıcı hesabına yansır. Müşteri anahtarları burada görünmez.',
  'setup.removeBody': 'Kaldırınca {name} tüm platform yöneticileri için kapanır. Yeni anahtar girilene kadar yönetim sohbeti kullanılamaz.',
  'setup.consentCheckbox': 'Okudum; platform yöneticisi olarak verilerin seçtiğim sağlayıcıya aktarılmasını onaylıyorum.',
  'setup.consentAdminNote': 'Sohbetin açılması için bir platform yöneticisinin bu metni onaylaması gerekecek.',
  'setup.consentRevokeBody': 'Onayı geri alınca {name} tüm platform yöneticileri için kapanır.',
  'setup.consentPendingAdmin.title': 'Platform yöneticisi onayı bekleniyor',
  'setup.consentPendingAdmin.body': 'Anahtar tanımlandı; {name}, bir platform yöneticisi veri aktarım bilgilendirmesini onayladıktan sonra açılır.',
  'setup.noPermission.title': 'Platform anahtarı gerekiyor',
  'setup.noPermission.body': "{name}'u kullanmak için Sistem ayarları → {name} ekranında platform yapay zekâ sağlayıcı anahtarı tanımlanmalı.",
}

export function boChatText(key: string, params: Record<string, unknown> = {}): string | undefined {
  const raw = BO_CHAT_TEXTS[key.replace(/^chat\./, '')]
  return raw?.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] === undefined ? `{${k}}` : String(params[k])))
}
