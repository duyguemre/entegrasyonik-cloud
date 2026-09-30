/**
 * frontend/src/help/categories.ts — yardım merkezi kategorileri (sıra = ekrandaki sıra). SAF TS.
 */
import type { HelpCategory } from './types'

export const HELP_CATEGORIES: readonly HelpCategory[] = [
  { id: 'getting-started', icon: 'mdi-rocket-launch-outline', order: 0, title: { tr: 'Başlarken', en: 'Getting started' }, description: { tr: 'Hesap, ilk entegrasyon ve ilk ürün aktarımı', en: 'Account, first integration and first product transfer' } },
  { id: 'using-the-app', icon: 'mdi-application-outline', order: 1, title: { tr: 'Uygulama kullanımı', en: 'Using the app' }, description: { tr: 'Menü, sekmeler, kısayollar, filtreler ve bildirimler', en: 'Menu, tabs, shortcuts, filters and notifications' } },
  { id: 'catalog', icon: 'mdi-tag-multiple-outline', order: 2, title: { tr: 'Ürünler ve katalog', en: 'Products and catalog' }, description: { tr: 'Ürün, varyant, eşleme ve zorunlu özellikler', en: 'Products, variants, mapping and required attributes' } },
  { id: 'stock', icon: 'mdi-package-variant-closed', order: 3, title: { tr: 'Stok', en: 'Stock' }, description: { tr: 'Tek stok, rezervasyon, kanal politikası ve stok sağlığı', en: 'Single stock, reservations, channel policy and stock health' } },
  { id: 'orders', icon: 'mdi-cart-outline', order: 4, title: { tr: 'Sipariş ve iade', en: 'Orders and returns' }, description: { tr: 'Yaşam döngüsü, onay/iptal, iade ve mesajlar', en: 'Lifecycle, approve/cancel, returns and messages' } },
  { id: 'integrations', icon: 'mdi-connection', order: 5, title: { tr: 'Entegrasyonlar', en: 'Integrations' }, description: { tr: 'Kanal bağlama, kapsam ve hata mesajları', en: 'Connecting channels, scope and error messages' } },
  { id: 'finance', icon: 'mdi-finance', order: 6, title: { tr: 'Finans ve raporlar', en: 'Finance and reports' }, description: { tr: 'Finansal hareketler, faturalar ve çıktılar', en: 'Transactions, invoices and printouts' } },
  { id: 'account', icon: 'mdi-shield-account-outline', order: 7, title: { tr: 'Hesap, güvenlik ve KVKK', en: 'Account, security and privacy' }, description: { tr: 'Parola, kullanıcılar, veri dışa aktarma/silme, abonelik', en: 'Password, users, data export/deletion, subscription' } },
  { id: 'troubleshooting', icon: 'mdi-wrench-outline', order: 8, title: { tr: 'Sorun giderme', en: 'Troubleshooting' }, description: { tr: 'Ürün gitmedi, sipariş gelmedi, stok farklı', en: 'Product not sent, order missing, stock mismatch' } },
  { id: 'faq', icon: 'mdi-frequently-asked-questions', order: 9, title: { tr: 'Sık sorulan sorular', en: 'FAQ' }, description: { tr: 'Kısa yanıtlar', en: 'Short answers' } },
  { id: 'support', icon: 'mdi-lifebuoy', order: 10, title: { tr: 'Destek', en: 'Support' }, description: { tr: 'Destek talebi açma ve izleme', en: 'Opening and tracking a support ticket' } },
] as const

export function helpCategory(id: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.id === id)
}
