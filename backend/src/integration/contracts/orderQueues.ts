/**
 * [eslesme-fiyat WP7a, 01-ekler/D F-01, PLAN §3.5 K-E] Sipariş senkron kuyruk topolojisi — TEK KAYNAK (saf modül, Redis'e dokunmaz).
 *
 * ÖNCEKİ: tek kuyruk `order-sync-queue`, tek havuz (concurrency 5/pod), her 60 sn yeni jobId (`sync_<c>_<kod>_<pencere>`) →
 * aynı çift için bekleyen/aktif iş varken yenisi eklenir, tek pazaryeri yavaşlığı tüm kanalları bloklar.
 * ŞİMDİ:
 *  - Kanal başına kuyruk `order-sync-<kod>` (PLAN `order-sync:<kod>` yazıyordu; BullMQ kuyruk adında `:` YASAK →
 *    "Queue name cannot contain :"), kanal başına concurrency.
 *  - İş türü (kind) başına ayrı iş: orders | claims | messages | finance; her biri kendi aralığıyla (PLAN §3.6).
 *  - "jobId çift+kind sabit": BullMQ `deduplication.id = sync_<c>_<kod>_<kind>` ile uygulanır. Sabit `jobId` KULLANILMAZ:
 *    `removeOnComplete` (24 sa, ölçüm için) tamamlanan işi tuttuğu sürece aynı jobId'li yeni ekleme sessizce yok sayılırdı.
 *    Tekilleştirme kimliği ise yalnız iş bekleyen/gecikmeli/aktif iken tutulur (tamamlanınca/başarısız olunca serbest).
 *  - Eski `order-sync-queue` YALNIZ BOŞALTMA için dinlenir (yeni iş eklenmez; dağıtım anında kuyrukta kalan işler kaybolmasın).
 */
export const LEGACY_ORDER_QUEUE = 'order-sync-queue';
export const ORDER_QUEUE_PREFIX = 'order-sync-';

/** Sipariş üreticisinin tarayabileceği kanallar (marketplace + ecommerce + ERP adaptörleri). */
export const ORDER_QUEUE_CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'] as const;
export type OrderQueueChannel = typeof ORDER_QUEUE_CHANNELS[number];
/** Listede olmayan (yeni eklenmiş) kanal kodları ortak kuyruğa düşer; kanal eklendiğinde listeye girer. */
export const ORDER_QUEUE_FALLBACK = `${ORDER_QUEUE_PREFIX}other`;

/** Kanal başına başlangıç eşzamanlılığı (PLAN §3.5; backoffice ayarı WP7b `sync.*` kataloğu ile). */
export const CHANNEL_CONCURRENCY: Readonly<Record<OrderQueueChannel, number>> = {
    trendyol: 5, hepsiburada: 3, n11: 3, pazarama: 3, ideasoft: 2, bizimhesap: 1,
};
export const FALLBACK_CONCURRENCY = 1;

export const ORDER_SYNC_KINDS = ['orders', 'claims', 'messages', 'finance'] as const;
export type OrderSyncKind = typeof ORDER_SYNC_KINDS[number];

const isChannel = (code: string): code is OrderQueueChannel => (ORDER_QUEUE_CHANNELS as readonly string[]).includes(code);

export function orderQueueName(integrationCode: string): string {
    const code = String(integrationCode || '').trim().toLowerCase();
    return isChannel(code) ? `${ORDER_QUEUE_PREFIX}${code}` : ORDER_QUEUE_FALLBACK;
}

/** Tüm yeni kuyruk adları (kanal kuyrukları + ortak) — backoffice/metrik listeleri için. */
export const ORDER_QUEUE_NAMES: readonly string[] = [...ORDER_QUEUE_CHANNELS.map(c => `${ORDER_QUEUE_PREFIX}${c}`), ORDER_QUEUE_FALLBACK];

export function concurrencyFor(queueName: string): number {
    const code = queueName.startsWith(ORDER_QUEUE_PREFIX) ? queueName.slice(ORDER_QUEUE_PREFIX.length) : '';
    return isChannel(code) ? CHANNEL_CONCURRENCY[code] : FALLBACK_CONCURRENCY;
}

/** Çift+kind sabit tekilleştirme kimliği (BullMQ özel kimliklerinde `:` yasak; alt çizgi). */
export function orderDedupId(clientId: number | string, integrationCode: string, kind: OrderSyncKind): string {
    return `sync_${clientId}_${integrationCode}_${kind}`;
}

/** Tenant dilimi (PLAN §3.5 `order % 60`): aynı turda eklenen işler 60 sn'ye yayılır. */
export function sliceDelayMs(order: number | undefined, slices = 60, sliceMs = 1000): number {
    const n = Number(order);
    if (!Number.isFinite(n) || n < 0) return 0;
    return (Math.floor(n) % slices) * sliceMs;
}
