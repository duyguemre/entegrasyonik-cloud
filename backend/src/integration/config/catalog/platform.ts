// ADR-0031 Karar 2 — `_platform` hedefi kataloğu (v1: 9 anahtar). Çalışma zamanı iş ayarları: destek iletişimi,
// duyuru, bakım, UI varsayılanları. Hepsi `exposure:'public'` (GET /api/public-config). Sır YOK; sır/env değerleri
// buraya girmez (Karar 1 sınıflandırma). Anahtar sayısı 25'i geçerse ADR-0031 gözden geçirme eşiği.
import { z } from 'zod';
import type { SettingDef } from '../types';

// Düz metin: HTML işaretleyicisi (< >) ve kontrol karakterleri (yeni satır dahil) reddedilir.
// eslint-disable-next-line no-control-regex
const PLAIN_TEXT = /^[^<>\u0000-\u001f\u007f]*$/;
const plainText = (max: number) => z.string().max(max).regex(PLAIN_TEXT, 'HTML/kontrol karakteri içeremez');

/** `getPlatformSetting` tüketici dosyası (katalog tutarlılık testi: `src/integration` altına göre var olmalı). */
const CONSUMERS = ['config/platformSettings.ts'];

const base = {
    scope: 'platform' as const, danger: 'safe' as const, applies: 'immediate' as const, overridable: true,
    exposure: 'public' as const, consumers: CONSUMERS, since: '2026-09-30',
};

export const PLATFORM_SETTINGS: SettingDef<any>[] = [
    { ...base, key: 'support.email', group: 'platform.support', type: 'text', schema: z.string().email().max(120), default: 'bilgi@entegrasyonik.com.tr',
        label: { tr: 'Destek e-postası', en: 'Support email' },
        help: { tr: 'Uygulamada yardım menüsünde ve giriş ekranında gösterilen destek e-posta adresi.', en: 'Support email shown in the help menu and on the sign-in screen.' } },
    { ...base, key: 'support.phone', group: 'platform.support', type: 'text', schema: z.union([z.literal(''), z.string().regex(/^\+?[0-9 ()-]{7,20}$/, 'Geçerli bir telefon numarası girin')]), default: '',
        label: { tr: 'Destek telefonu', en: 'Support phone' },
        help: { tr: 'Boşsa gösterilmez. Örn. +90 850 000 00 00.', en: 'Hidden when empty. E.g. +90 850 000 00 00.' } },
    { ...base, key: 'announcement.enabled', group: 'platform.announcement', type: 'bool', schema: z.boolean(), default: false,
        label: { tr: 'Duyuru şeridi açık', en: 'Announcement banner enabled' },
        help: { tr: 'Açıkken uygulama kabuğunda duyuru metni gösterilir.', en: 'When on, the announcement text is shown in the app shell.' } },
    { ...base, key: 'announcement.level', group: 'platform.announcement', type: 'enum', schema: z.enum(['info', 'warning']), default: 'info',
        label: { tr: 'Duyuru seviyesi', en: 'Announcement level' },
        help: { tr: 'info: bilgi, warning: uyarı rengi.', en: 'info: neutral, warning: warning colour.' } },
    { ...base, key: 'announcement.text', group: 'platform.announcement', type: 'text', schema: plainText(280), default: '',
        label: { tr: 'Duyuru metni', en: 'Announcement text' },
        help: { tr: 'Düz metin, en çok 280 karakter (HTML ve satır sonu kabul edilmez).', en: 'Plain text, up to 280 characters (no HTML or line breaks).' } },
    { ...base, key: 'maintenance.enabled', group: 'platform.maintenance', type: 'bool', schema: z.boolean(), default: false, danger: 'caution',
        label: { tr: 'Bakım modu', en: 'Maintenance mode' },
        help: { tr: 'Açıkken uygulamada bakım şeridi gösterilir ve tenant yazma istekleri 503 MAINTENANCE döner (okuma, giriş/çıkış ve yönetim uygulaması serbest).', en: 'When on, a maintenance banner is shown and tenant write requests return 503 MAINTENANCE (reads, sign-in/out and the admin app stay available).' },
        impact: { tr: 'Tüm kullanıcılar bakım iletisini görür ve veri yazamaz; yayın gerekçe ve yeniden doğrulama ister.', en: 'All users see the maintenance message and cannot write data; publishing requires a reason and re-authentication.' } },
    { ...base, key: 'maintenance.message', group: 'platform.maintenance', type: 'text', schema: plainText(280), default: '',
        label: { tr: 'Bakım iletisi', en: 'Maintenance message' },
        help: { tr: 'Düz metin, en çok 280 karakter.', en: 'Plain text, up to 280 characters.' } },
    { ...base, key: 'ui.listPageSize', group: 'platform.ui', type: 'enum', schema: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]), default: 25,
        label: { tr: 'Liste sayfa boyutu', en: 'List page size' },
        help: { tr: 'Liste ekranlarında varsayılan sayfa başına satır sayısı (10/25/50/100).', en: 'Default rows per page in list screens (10/25/50/100).' } },
    { ...base, key: 'ui.reportPollMs', group: 'platform.ui', type: 'int', schema: z.number().int().min(3000).max(60000), default: 5000, unit: 'ms', safeRange: { min: 3000, max: 60000 },
        label: { tr: 'Rapor yoklama süresi', en: 'Report poll interval' },
        help: { tr: 'Devam eden rapor ekranlarının yenileme aralığı (3000-60000 ms).', en: 'Refresh interval of in-progress report screens (3000-60000 ms).' } },
];
