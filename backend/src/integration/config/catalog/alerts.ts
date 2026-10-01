// ADR-0017 Karar 4 / ADR-0029 NB8 / ADR-0031: alarm değerlendiricisi EŞİKLERİ (`_platform` hedefi, yöneticiye özel —
// `exposure` YOK, public-config'e girmez). Yalnız operasyonun ayarlayacağı sayısal eşikler buradadır; pencereler
// (R1/R2 15 dk, R7 60 dk), cooldown, histerezis ve fırtına sınırı kodda kalır. Okuyucu: `operations/alerts/alertThresholds.ts`
// (`getPlatformSetting`; yayın yoksa/şema geçmezse varsayılan). Varsayılanlar ADR-0017 Karar 4 tablosuyla aynıdır.
import { z } from 'zod';
import type { SettingDef } from '../types';

const base = {
    scope: 'platform' as const, group: 'platform.alerts' as const, type: 'int' as const, danger: 'safe' as const, applies: 'immediate' as const,
    overridable: true, consumers: ['config/platformSettings.ts'], since: '2026-10-01', advanced: true,
};
const int = (min: number, max: number) => ({ schema: z.number().int().min(min).max(max), safeRange: { min, max } });

export const ALERT_SETTINGS: SettingDef<any>[] = [
    { ...base, key: 'alerts.r1.minCalls', ...int(5, 1000), default: 20, unit: 'count',
        label: { tr: 'R1 en az çağrı', en: 'R1 minimum calls' },
        help: { tr: '15 dakikalık pencerede hata oranının değerlendirilmesi için gereken en az çağrı sayısı.', en: 'Minimum calls in the 15-minute window before the error rate is evaluated.' } },
    { ...base, key: 'alerts.r1.warnPercent', ...int(1, 100), default: 20, unit: 'percent',
        label: { tr: 'R1 uyarı hata oranı', en: 'R1 warning error rate' },
        help: { tr: 'Tenant × entegrasyon hata oranı bu yüzdeye ulaşınca uyarı (veri hataları orana girmez).', en: 'Warning when the tenant × integration error rate reaches this percentage (data errors excluded).' } },
    { ...base, key: 'alerts.r1.criticalPercent', ...int(1, 100), default: 50, unit: 'percent',
        label: { tr: 'R1 kritik hata oranı', en: 'R1 critical error rate' },
        help: { tr: 'Bu yüzdeye ulaşınca kritik. Uyarı eşiğinden küçükse uyarı eşiği kullanılır.', en: 'Critical at this percentage. If lower than the warning threshold, the warning threshold is used.' } },
    { ...base, key: 'alerts.r2.authErrors', ...int(1, 100), default: 3, unit: 'count',
        label: { tr: 'R2 kimlik hatası sayısı', en: 'R2 auth error count' },
        help: { tr: '15 dakikada bu kadar AUTH hatası → "kimlik bilgisi geçersiz" (kritik, tenant bildirimi).', en: 'This many AUTH errors in 15 minutes → "credentials invalid" (critical, tenant notice).' } },
    { ...base, key: 'alerts.r2.circuitOpenMin', ...int(1, 240), default: 10, unit: 'min',
        label: { tr: 'R2 devre açık süresi', en: 'R2 circuit open duration' },
        help: { tr: 'Devre kesici bu kadar dakikadan uzun açık kalırsa uyarı (platform ve tenant).', en: 'Warning when a circuit breaker stays open longer than this (platform and tenant).' } },
    { ...base, key: 'alerts.r3.lagWarnMin', ...int(5, 1440), default: 30, unit: 'min',
        label: { tr: 'R3 sipariş senkron gecikmesi (uyarı)', en: 'R3 order sync lag (warning)' },
        help: { tr: 'Son başarılı sipariş senkronundan bu yana geçen süre bu değeri aşarsa uyarı.', en: 'Warning when the time since the last successful order sync exceeds this.' } },
    { ...base, key: 'alerts.r3.lagCriticalMin', ...int(10, 2880), default: 120, unit: 'min',
        label: { tr: 'R3 sipariş senkron gecikmesi (kritik)', en: 'R3 order sync lag (critical)' },
        help: { tr: 'Bu süreyi aşan gecikme kritiktir. Uyarı eşiğinden küçükse uyarı eşiği kullanılır.', en: 'Lag beyond this is critical. If lower than the warning threshold, the warning threshold is used.' } },
    { ...base, key: 'alerts.r4.queueWait', ...int(10, 100000), default: 200, unit: 'count',
        label: { tr: 'R4 bekleyen iş sayısı', en: 'R4 waiting jobs' },
        help: { tr: 'Sipariş senkron kuyruğunda bekleyen iş bu sayıyı aşarsa uyarı.', en: 'Warning when waiting jobs in the order sync queue exceed this.' } },
    { ...base, key: 'alerts.r4.oldestWaitMin', ...int(1, 240), default: 10, unit: 'min',
        label: { tr: 'R4 en eski bekleyen iş', en: 'R4 oldest waiting job' },
        help: { tr: 'Kuyruktaki en eski iş bu kadar dakikadan uzun beklerse uyarı.', en: 'Warning when the oldest queued job waits longer than this.' } },
    { ...base, key: 'alerts.r7.deadPerHour', ...int(1, 10000), default: 10, unit: 'count',
        label: { tr: 'R7 ölü teslim (saatlik)', en: 'R7 dead deliveries (hourly)' },
        help: { tr: 'Son bir saatte ölü (dead) bildirim teslimi bu sayıya ulaşırsa uyarı.', en: 'Warning when dead notification deliveries in the last hour reach this.' } },
    { ...base, key: 'alerts.r8.unresolvedMin', ...int(0, 1440), default: 60, unit: 'min',
        label: { tr: 'R8 çözülmemiş fazla satış', en: 'R8 unresolved oversell' },
        help: { tr: 'Grace sonrası otomatik çözülemeyen (tenant\'a görev açılmış) OVERSOLD satır bu kadar dakika sonra hâlâ açıksa uyarı.', en: 'Warning when an OVERSOLD line escalated after the grace window is still open after this many minutes.' } },    { ...base, key: 'alerts.r5.pendingMin', ...int(5, 1440), default: 30, unit: 'min',
        label: { tr: 'R5 katalog birikmesi', en: 'R5 catalog backlog' },
        help: { tr: 'En eski ertelenmemiş bekleyen katalog işi bu kadar dakikadan eskiyse uyarı.', en: 'Warning when the oldest non-deferred pending catalog job is older than this many minutes.' } },
    { ...base, key: 'alerts.r10.p95Min', ...int(1, 120), default: 5, unit: 'min',
        label: { tr: 'R10 stok yayın gecikmesi (p95)', en: 'R10 stock publish lag (p95)' },
        help: { tr: 'Son bir saatte stok yayın gecikmesinin p95 değeri bu kadar dakikayı aşarsa uyarı (en az 20 gözlem).', en: 'Warning when the 1-hour p95 stock publish lag exceeds this many minutes (at least 20 observations).' } },
    { ...base, key: 'alerts.r11.minCount', ...int(1, 1000), default: 5, unit: 'count',
        label: { tr: 'R11 yeni hata türü', en: 'R11 new error type' },
        help: { tr: 'Son bir saatte ilk kez görülen hata türü bu kadar tekrarlanırsa uyarı.', en: 'Warning when an error type first seen in the last hour occurs this many times.' } },
];
