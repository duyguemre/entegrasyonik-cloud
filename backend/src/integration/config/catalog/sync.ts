// [eslesme-fiyat WP7b, PLAN §3.6 / K-K] Senkron (`sync.*`) ayarları — backoffice'ten yönetilen kuyruk eşzamanlılığı ve manuel tetik soğuması.
// Tür başına çekim aralıkları `order.*` anahtarlarında KALIR (WP7a'da yayımlandı; anahtarlar kararlıdır, yeniden adlandırılmaz) ve
// WP7b'den itibaren üretici tarafından yayımlanmış platform geçersiz kılmalarıyla okunur (applies: next_cycle).
// NOT: plan bazlı aralık (Starter 10 dk / üst 3 dk) ADR-0020 katmanlarında YOK (engine/integration/platform) → ayrı karar (DURUM).
import { z } from 'zod';
import type { SettingDef } from '../types';
import { durationSetting } from './helpers';
import { CHANNEL_CONCURRENCY, FALLBACK_CONCURRENCY } from '../../contracts/orderQueues';

export const SYNC_SETTINGS: SettingDef<any>[] = [
    {
        key: 'sync.queue.concurrency', group: 'order.sync', scope: 'integration', type: 'int', unit: 'count',
        schema: z.number().int().min(1).max(20), safeRange: { min: 1, max: 10 },
        default: { _: FALLBACK_CONCURRENCY, ...CHANNEL_CONCURRENCY },
        danger: 'caution', applies: 'restart', overridable: true, consumers: ['engine/order/worker-runner.ts'], since: '2026-10-04',
        label: { tr: 'Kanal sipariş kuyruğu eşzamanlılığı (pod başına)', en: 'Channel order queue concurrency (per pod)' },
        help: { tr: 'Kanalın sipariş/iade/mesaj/finans kuyruğunda bir pod\'un aynı anda işleyeceği iş sayısı (PLAN §3.5: TY 5, HB 3, N11 3, PZ 3, IS 2, BH 1).', en: 'Jobs a pod processes concurrently on the channel\'s order/claim/message/finance queue (PLAN §3.5: TY 5, HB 3, N11 3, PZ 3, IS 2, BH 1).' },
        impact: { tr: 'Artırmak pazaryeri hız sınırına (429) daha sık takılmaya yol açabilir; toplam = değer × pod sayısı.', en: 'Raising it may hit marketplace rate limits (429) more often; total = value × pod count.' },
    },
    durationSetting({
        key: 'sync.manual.cooldownMs', group: 'order.sync', scope: 'engine', unit: 'ms', default: 300000, min: 60000, max: 3600000,
        danger: 'safe', applies: 'immediate', consumers: ['../operations/integrations/syncNow.ts', '../api/rpc/handlers/integration-service.ts'],
        label: { tr: '"Şimdi senkronize et" bekleme süresi', en: '"Sync now" cooldown' },
        help: { tr: 'Aynı tenant × entegrasyon × tür için iki manuel senkron arasında beklenecek süre (PLAN §3.5: 5 dk).', en: 'Wait between two manual syncs of the same tenant × integration × kind (PLAN §3.5: 5 min).' },
        since: '2026-10-04',
    }),
];
