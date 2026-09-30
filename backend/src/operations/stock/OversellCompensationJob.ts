import { DatabaseManagerInstance } from "@database/DatabaseManager";
import { CLIENT_INTEGRATION_HOT_PROJECTION } from "@database/projections";
import { RedisService } from "@services/redis/RedisService";
import IntegrationFactory from "@integration/modules/IntegrationFactory";
import { NotificationService } from "@services/notification/NotificationService";
import { getRequestId } from "@platform/core/context";
import { StockAllocator } from "./StockAllocator";
import { IOrderRejectParams } from "@interfaces/index";
import { getPodIdentity } from "@utils/podIdentity";
import { IntegrationError } from "@integration/modules/common/IntegrationError";

/**
 * ADR-0004 — Zero-oversell (Karar 7, Aşama C): telafi (OVERSOLD -> grace-retry -> otomatik iptal/bildirim).
 * bkz. docs/adr/0004-zero-oversell-rezervasyon-modeli.md
 *
 * TASARIM KARARI (ADR'de açık değil, bu görevde alınmıştır, gerekçesi): OVERSOLD satırların yeniden
 * denemesi/iptali AYRI bir job olarak yazıldı, `AllocationSweepJob`'a (Aşama B, DEĞİŞTİRİLMEDİ) kanca
 * EKLENMEDİ. Gerekçe: `AllocationSweepJob` her turda pazaryeri durumundan istenen tahsis durumunu YENİDEN
 * TÜRETİR ve idempotent geçişi uygular (`PostOrderOperations.processOrder`) -- bu, "sipariş durumu neyi
 * gerektiriyor" sorusuna cevap verir. Bu job'un sorusu TAMAMEN FARKLI: "stok politikasına göre OVERSOLD bir
 * satırı ŞİMDİ ne yapmalıyım (bekle/yeniden dene/iptal et)" -- pazaryeri durumundan BAĞIMSIZ, yalnızca
 * zaman (grace penceresi) ve stok politikasına bağlı bir kararı temsil eder. İkisini TEK bir joba
 * karıştırmak (sweep'e "eğer OVERSOLD ve grace geçtiyse iptal et" kancası eklemek) iki farklı sorumluluğu
 * (durum senkronizasyonu vs. politika/zaman tetiklemeli telafi) aynı fonksiyonda birleştirip test edilebilirliği
 * düşürürdü; ayrı job daha az invaziv (sweep'in mevcut, characterization testli davranışı HİÇ değişmedi).
 *
 * `Orders` dokümanında `clientId` alanı YOK (tenant zaten ClientDB ile izole) -- `PostOrderOperations` ile
 * AYNI desen: `clientId` (bildirim için) ve pazaryeri `IntegrationFactory` örneği ÇAĞIRAN (`runForClient`)
 * tarafından açıkça taşınır, sipariş dokümanından OKUNMAZ.
 */
export class OversellCompensationJob {
    /** ADR'deki 40 günlük dizi budama penceresine pay eklenmiş tarama alt sınırı (AllocationSweepJob ile AYNI). */
    private static readonly LOOKBACK_DAYS = 45;
    private static readonly DEFAULT_GRACE_MINUTES = 30;
    private static readonly DEFAULT_AUTO_CANCEL = true;
    /** ADR: iptal yeteneği gerçek/testli olan kanallar (N11 hariç -- C9 bulgusu, approve/reject NOT_SUPPORTED). */
    private static readonly CANCEL_SUPPORTED_CHANNELS = new Set(['trendyol', 'hepsiburada', 'pazarama']);
    /** Marketplace reject reason kodu -- doğrulanmış kanallar için sabit değer. */
    private static readonly OUT_OF_STOCK_REASON_ID = 'OUT_OF_STOCK';
    /**
     * [DÜZELTME 2026-09-29, BACKLOG C22] `reasonId` PLATFORM-BAZLI olmalı: her adaptör farklı tipte/anlamda
     * bekliyor, tek generic sabit YANLIŞTI (eski hata). Yalnızca DOĞRULANMIŞ eşlemeler burada yer alır:
     *  - `hepsiburada`: `OrderConnector.rejectOrder(orderNumber, reason: string)` reasonId'yi DOĞRUDAN string
     *    olarak `cancellationReason` alanına geçirir (`OrderService.ts:38`, `Number()`/tip dönüşümü YOK) ->
     *    sabit string GÜVENLİ.
     *  - `pazarama`: `OrderService.rejectOrder` `params.reasonId`'yi HİÇ OKUMAZ, statüyü sabit 13'e (Tedarik
     *    Edilemedi) çeker (`OrderService.ts:41-54`) -> değer etkisiz/kozmetik, sabit string ZARARSIZ.
     *  - `trendyol` KASITLI OLARAK bu tabloda YOK: `OrderConnector.ts:223` `reasonId: Number(params.reasonId)`
     *    ile SAYIYA çevirir; `'OUT_OF_STOCK'` gibi bir string `NaN` üretir -> istek anlamsız/sessizce yanlış
     *    gidiyordu (BULGU, bu görevde giderildi). GERÇEK/doğrulanmış sayısal kod kümesi ne resmi kaynakta
     *    (`docs/research/2026-09-28-trendyol-v2-migration-spec.md:31` -- yalnızca gövde şekli `{lines,reasonId}`
     *    var, kod kataloğu YOK) ne kod tabanında bulunuyor: `ClaimConnector.retrieveOrderRejectionReasons()`/
     *    `claimRejectionReasonsUrl` (`order/claim-issue-reasons`) FARKLI bir uç nokta/anlam alanıdır -- İADE
     *    (claim) red sebebi kataloğudur, sipariş REDDİ/`unsupplied` uç noktasının reasonId'siyle İLGİSİZDİR.
     * Trendyol dosyalarına (OrderConnector/Service.ts) bu görevde DOKUNULMADI (kapsam dışı); bunun yerine bu
     * job Trendyol için rejectOrder'ı HİÇ ÇAĞIRMAZ (bkz. `attemptMarketplaceCancel`).
     */
    private static readonly VERIFIED_REASON_ID_BY_CHANNEL: Readonly<Record<string, string>> = {
        hepsiburada: OversellCompensationJob.OUT_OF_STOCK_REASON_ID,
        pazarama: OversellCompensationJob.OUT_OF_STOCK_REASON_ID,
    };
    /**
     * [GV-08] `rejectOrder` çağrısı için satır bazında talep (lease) süresi. Pazaryeri çağrısı en kötü ~30 sn
     * (ResilientHttpClient varsayılan timeout) x kalem sayısı sürebilir; 2 dk bunu karşılar ama çöken bir
     * pod'un talebi bir sonraki 5 dk'lık turda zaten yeniden alınabilir olur.
     */
    private static readonly CANCEL_CLAIM_TTL_MS = 2 * 60 * 1000;

    public async run(): Promise<{ skipped: boolean; scannedClients: number; retried: number; cancelled: number; escalated: number }> {
        if (!RedisService.isReady()) {
            console.warn('[OversellCompensationJob] Redis bağlı değil (isReady()=false); bu tur ATLANIYOR.');
            return { skipped: true, scannedClients: 0, retried: 0, cancelled: 0, escalated: 0 };
        }

        let scannedClients = 0, retried = 0, cancelled = 0, escalated = 0;

        try {
            const applicationDB = await DatabaseManagerInstance.getApplicationDB();
            const activeClients = await applicationDB.getClientModel().find({ status: 'ACTIVE' }).lean();
            const cutoff = new Date(Date.now() - OversellCompensationJob.LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

            for (const client of activeClients || []) {
                scannedClients++;
                const clientOrder = Number((client as any).order);
                try {
                    const r = await this.runForClient(clientOrder, cutoff);
                    retried += r.retried; cancelled += r.cancelled; escalated += r.escalated;
                } catch (error) {
                    console.error(`[OversellCompensationJob] Client hata (order=${clientOrder}):`, error);
                }
            }
        } catch (error) {
            console.error('[OversellCompensationJob] Tur genel hata:', error);
        }

        return { skipped: false, scannedClients, retried, cancelled, escalated };
    }

    private async runForClient(clientOrder: number, cutoff: Date): Promise<{ retried: number; cancelled: number; escalated: number }> {
        let retried = 0, cancelled = 0, escalated = 0;

        const clientDB = await DatabaseManagerInstance.getClientDB(clientOrder);
        if (!clientDB) return { retried, cancelled, escalated };

        const orderModel = clientDB.getOrderModel();
        const oversoldOrders = await orderModel.find({
            'dates.orderDate': { $gte: cutoff },
            items: { $elemMatch: { allocationState: 'OVERSOLD' } },
        }).lean();
        if (!oversoldOrders || oversoldOrders.length === 0) return { retried, cancelled, escalated };

        const integrationDoc: any = await clientDB.getClientIntegrationModel().findOne({}, CLIENT_INTEGRATION_HOT_PROJECTION).lean(); // [DB-03]
        const allocator = new StockAllocator(clientDB as any);
        const factory = new IntegrationFactory(clientOrder);
        const now = new Date();

        for (const order of oversoldOrders as any[]) {
            const stockPolicy = this.resolveStockPolicy(integrationDoc, order.integrationCode);
            const graceMs = (stockPolicy.graceMinutes ?? OversellCompensationJob.DEFAULT_GRACE_MINUTES) * 60 * 1000;

            for (const item of order.items || []) {
                if (item.allocationState !== 'OVERSOLD') continue;

                const detectedAt = item.lastAllocationAppliedAt ? new Date(item.lastAllocationAppliedAt) : (order.dates?.orderDate ? new Date(order.dates.orderDate) : now);
                const elapsedMs = now.getTime() - detectedAt.getTime();
                const key = `${order.integrationCode}:${order.externalOrderId}:${item.externalLineItemId}`;

                try {
                    if (elapsedMs < graceMs) {
                        const didRetry = await this.tryRetry(clientDB, allocator, clientOrder, order, item, key);
                        if (didRetry) retried++;
                    } else {
                        const outcome = await this.tryCompensate(clientDB, allocator, factory, integrationDoc, stockPolicy, clientOrder, order, item, key);
                        if (outcome === 'CANCELLED') cancelled++;
                        else if (outcome === 'ESCALATED') escalated++;
                    }
                } catch (error) {
                    console.error(`[OversellCompensationJob] Satır işleme hatası (order=${order.externalOrderId}, line=${item.externalLineItemId}):`, error);
                }
            }
        }

        return { retried, cancelled, escalated };
    }

    /** Grace penceresi içinde: stok artmışsa OVERSOLD -> RESERVED yeniden dene (ADR Karar 7b). */
    private async tryRetry(clientDB: any, allocator: StockAllocator, clientOrder: number, order: any, item: any, key: string): Promise<boolean> {
        const variantId = await this.resolveVariantId(clientDB, item);
        if (!variantId) return false;

        const qty = Number(item.quantity) || 0;
        const result = await allocator.retryOversold(variantId, key, qty);
        if (result.state === 'RESERVED' && !result.idempotent) {
            await clientDB.getOrderModel().updateOne(
                { _id: order._id, 'items.externalLineItemId': item.externalLineItemId },
                { $set: { 'items.$.allocationState': 'RESERVED', 'items.$.lastAllocationAppliedAt': new Date() } },
            );
            await this.notify(clientOrder, order, item, { code: 'STOCK_REALLOCATED', params: {} }, {
                severity: 'success',
                title: 'Stok yeniden ayrıldı',
                message: `${order.orderNumber || order.externalOrderId} numaralı siparişteki stok yetersizliği giderildi; kalem yeniden RESERVED durumuna alındı.`,
            });
            return true;
        }
        return false;
    }

    /** Grace süresi doldu: politika izin veriyorsa ve kanal destekliyorsa otomatik iptal; yoksa manuel görev. */
    private async tryCompensate(
        clientDB: any, allocator: StockAllocator, factory: IntegrationFactory, integrationDoc: any, stockPolicy: any,
        clientOrder: number, order: any, item: any, key: string,
    ): Promise<'CANCELLED' | 'ESCALATED' | 'NONE'> {
        const autoCancel = stockPolicy.autoCancelOversold ?? OversellCompensationJob.DEFAULT_AUTO_CANCEL;
        const channelSupported = OversellCompensationJob.CANCEL_SUPPORTED_CHANNELS.has((order.integrationCode || '').toLowerCase());

        if (autoCancel && channelSupported) {
            // [GV-08] Belirsiz sonuçlu satırda ASLA yeniden iptal atılmaz (ADR-0006: yazmada körlemesine retry yok);
            // bildirim zaten gönderilmiştir, mutabakat/manuel çözer.
            if (item.cancelUnknownAt) return 'NONE';

            // [GV-08] Pazaryeri yazması (geri alınamaz): ÖNCE atomik satır talebi; yalnızca kazanan çağırır.
            const claim = await this.claimCancel(clientDB, order, item);
            if (!claim) return 'NONE'; // başka pod/tur işliyor VEYA satır artık OVERSOLD değil -- bu turda atla.

            const outcome = await this.attemptMarketplaceCancel(factory, order, item);
            if (outcome === 'UNKNOWN_OUTCOME') {
                // Sonuç belirsiz: iptal pazaryerinde uygulanmış OLABİLİR. Satır kalıcı işaretlenir (cancelUnknownAt) ->
                // sonraki turlar bu satıra iptal ATMAZ; talep bırakılır. Tenant'a bildirim; çözüm mutabakat/manuel.
                await clientDB.getOrderModel().updateOne(
                    { _id: order._id, 'items.externalLineItemId': item.externalLineItemId },
                    {
                        $set: { 'items.$.cancelUnknownAt': new Date(), 'items.$.oversoldEscalatedAt': new Date() },
                        $unset: { 'items.$.cancelClaimedBy': '', 'items.$.cancelClaimedAt': '', 'items.$.cancelClaimUntil': '' },
                    },
                );
                await this.notify(clientOrder, order, item, { code: 'STOCK_COMPENSATION_MANUAL', params: { reason: 'cancel_uncertain' } }, {
                    severity: 'error',
                    title: 'Manuel doğrulama gerekli: iptal sonucu belirsiz',
                    message: `${order.orderNumber || order.externalOrderId} numaralı siparişteki "${item.productName || item.sku}" kalemi için pazaryerine gönderilen otomatik iptalin sonucu belirsiz (zaman aşımı/ağ hatası ya da bu kanal için otomatik iptal kod eşlemesi henüz tanımlı değil). Çift iptal riski nedeniyle otomatik tekrar denenmeyecek; lütfen pazaryeri panelinden sipariş durumunu doğrulayın.`,
                });
                return 'ESCALATED';
            }
            const cancelSucceeded = outcome === 'SUCCESS';
            if (cancelSucceeded) {
                const variantId = await this.resolveVariantId(clientDB, item);
                if (variantId) await allocator.release(variantId, key);
                await clientDB.getOrderModel().updateOne(
                    { _id: order._id, 'items.externalLineItemId': item.externalLineItemId },
                    { $set: { 'items.$.allocationState': 'RELEASED', 'items.$.itemStatus': 'CANCELLED', 'items.$.lastAllocationAppliedAt': new Date() } },
                );
                await this.notify(clientOrder, order, item, { code: 'STOCK_LINE_AUTO_CANCELLED', params: {} }, {
                    severity: 'warning',
                    title: 'Sipariş kalemi otomatik iptal edildi',
                    message: `${order.orderNumber || order.externalOrderId} numaralı siparişteki "${item.productName || item.sku}" kalemi stok yetersizliği nedeniyle otomatik olarak pazaryerine iptal bildirildi.`,
                });
                return 'CANCELLED';
            }
            // Marketplace iptali kesin/kalıcı BAŞARISIZ (false, doğrulama/yetki hatası, istek hiç gönderilmedi):
            // talebi bırak, manuel göreve düşür (aşağıya devam).
            await this.releaseClaim(clientDB, order, item, claim);
        }

        if (item.oversoldEscalatedAt) return 'NONE'; // bildirim spam koruması (ADR'de yok, uygulayıcı kararı).

        await clientDB.getOrderModel().updateOne(
            { _id: order._id, 'items.externalLineItemId': item.externalLineItemId },
            { $set: { 'items.$.oversoldEscalatedAt': new Date() } },
        );
        await this.notify(clientOrder, order, item, { code: 'STOCK_COMPENSATION_MANUAL', params: { reason: 'insufficient_stock' } }, {
            severity: 'error',
            title: 'Manuel işlem gerekli: stok yetersizliği',
            message: `${order.orderNumber || order.externalOrderId} numaralı siparişteki "${item.productName || item.sku}" kalemi ${OversellCompensationJob.DEFAULT_GRACE_MINUTES} dk'lık bekleme süresini geçti; ${channelSupported ? 'otomatik iptal denendi ancak başarısız oldu' : 'bu kanalda otomatik iptal desteklenmiyor veya politika kapalı'}, manuel olarak ele alınmalı.`,
        });
        return 'ESCALATED';
    }

    /**
     * [GV-08] Satır bazında atomik talep (claim/lease). `@utils/mongoLease` desenidir (`findOneAndUpdate` + koşullu
     * `$set`; `leaseOwner/leaseUntil` karşılığı `cancelClaimedBy/cancelClaimUntil`), ANCAK iki bilinçli farkla:
     *  1) Dizi elemanı (`Orders.items[]`) üzerinde `$elemMatch` + konumsal (`items.$`) güncelleme gerekir; yardımcı
     *     üst düzey alan varsayar.
     *  2) "Aynı sahip yeniden alabilir" (heartbeat) dalı YOKTUR: aynı pod'daki üst üste binen tur da bloklanmalıdır
     *     (pod kimliği turlar arasında AYNI). Talep yalnızca boşsa/süresi dolmuşsa alınır.
     * Guard: `allocationState==='OVERSOLD'` ∧ `cancelUnknownAt` yok ∧ (`cancelClaimUntil` yok/null VEYA < şimdi).
     * (`{ cancelClaimUntil: null }` alanın hiç olmamasını da eşler; `$lt` tek başına null/yok değeri eşlemez -- BSON tip
     * kısıtlaması -- bu yüzden açıkça verilir. [DÜZELTME 2026-09-28] `@utils/mongoLease.acquireLease` de artık AYNI
     * `[{ leaseUntil: null }, { leaseUntil: { $lt: now } }]` biçimini kullanır; eskiden yalnızca `$lt` vardı ve hiç
     * alınmamış/bırakılmış lease'ler HİÇ alınamıyordu -- bu dosyadaki desen baştan doğruydu.)
     */
    private async claimCancel(clientDB: any, order: any, item: any): Promise<{ claimedAt: Date } | null> {
        const now = new Date();
        const claimed = await clientDB.getOrderModel().findOneAndUpdate(
            {
                _id: order._id,
                items: {
                    $elemMatch: {
                        externalLineItemId: item.externalLineItemId,
                        allocationState: 'OVERSOLD',
                        cancelUnknownAt: null,
                        $or: [{ cancelClaimUntil: null }, { cancelClaimUntil: { $lt: now } }],
                    },
                },
            },
            {
                $set: {
                    'items.$.cancelClaimedBy': getPodIdentity(),
                    'items.$.cancelClaimedAt': now,
                    'items.$.cancelClaimUntil': new Date(now.getTime() + OversellCompensationJob.CANCEL_CLAIM_TTL_MS),
                },
            },
            { new: true },
        );
        return claimed ? { claimedAt: now } : null;
    }

    /** Talebi bırakır -- yalnızca hâlâ BU turun talebiyse (`cancelClaimedBy`+`cancelClaimedAt` eşleşir); başkası devraldıysa dokunmaz. */
    private async releaseClaim(clientDB: any, order: any, item: any, claim: { claimedAt: Date }): Promise<void> {
        try {
            await clientDB.getOrderModel().updateOne(
                {
                    _id: order._id,
                    items: { $elemMatch: { externalLineItemId: item.externalLineItemId, cancelClaimedBy: getPodIdentity(), cancelClaimedAt: claim.claimedAt } },
                },
                { $unset: { 'items.$.cancelClaimedBy': '', 'items.$.cancelClaimedAt': '', 'items.$.cancelClaimUntil': '' } },
            );
        } catch (error) {
            // Bırakılamazsa lease TTL sonunda kendiliğinden düşer (yeniden alınabilir); tur akışını bozma.
            console.error(`[OversellCompensationJob] Talep bırakılamadı (order=${order.externalOrderId}):`, error);
        }
    }

    /**
     * `IPlatform.rejectOrder` ile GERÇEK (mock/sandbox, ResilientHttpClient testli) bağlayıcıyı çağırır. Sonuç
     * ÜÇ yönlüdür (ADR-0006): `UNKNOWN_OUTCOME` (yazma zaman aşımı/5xx/bağlantı kopması -- iptal uygulanmış OLABİLİR)
     * ayrı ele alınır; `FAILED` kesin/kalıcı başarısızlıktır.
     *
     * [DÜZELTME 2026-09-29, BACKLOG C22] Kanal için `VERIFIED_REASON_ID_BY_CHANNEL`'da doğrulanmış bir eşleme
     * YOKSA (bugün yalnız `trendyol`) istek HİÇ GÖNDERİLMEZ -- eskiden buraya HER kanal için SABİT
     * `'OUT_OF_STOCK'` string'i geçilirdi; Trendyol connector'ı bunu `Number()` ile çevirince `NaN` üretiyor,
     * istek anlamsız/sessizce yanlış gidiyordu. Ağ çağrısı yapılmadığı için sonuç aslında "belirsiz" değil
     * "kesinlikle gönderilmedi"dir; yine de GV-08'in "sonucu belirsiz yazmada asla otomatik retry yok" güvenlik
     * ağı (kalıcı `cancelUnknownAt` işareti + tek seferlik manuel bildirim) BİLİNÇLİ OLARAK burada da yeniden
     * kullanılır (yeni bir dönüş durumu/dal icat edilmedi) -- etki aynıdır: bir daha otomatik denenmez, tenant'a
     * tek bildirim gider, destek pazaryeri panelinden doğrular. Trendyol için doğrulanmış bir kod bulunursa tek
     * yapılması gereken `VERIFIED_REASON_ID_BY_CHANNEL`'a `trendyol` girdisini eklemektir.
     */
    private async attemptMarketplaceCancel(factory: IntegrationFactory, order: any, item: any): Promise<'SUCCESS' | 'FAILED' | 'UNKNOWN_OUTCOME'> {
        const channel = (order.integrationCode || '').toLowerCase();
        const reasonId = OversellCompensationJob.VERIFIED_REASON_ID_BY_CHANNEL[channel];
        if (!reasonId) {
            // Not: burada ayrıca `console.error` ile LOGLAMIYORUZ (dosyanın mevcut `no-console` ratchet
            // mandalını AŞMAMAK için, bkz. `quality/baseline.json`); operatör görünürlüğü zaten
            // `tryCompensate`'in UNKNOWN_OUTCOME dalındaki tenant bildirimiyle (severity:'error') sağlanır.
            return 'UNKNOWN_OUTCOME';
        }
        try {
            const instance = await factory.getInstance(order.integrationCode);
            const rejectParams: IOrderRejectParams = {
                reasonId,
                description: 'Stok yetersizliği nedeniyle otomatik iptal (zero-oversell telafi akışı).',
                source: 'SELLER',
                lineItems: [{ externalLineId: item.externalItemId, quantity: Number(item.quantity) || 0 }],
                meta: order.meta,
            };
            const result = await instance.rejectOrder(order.externalOrderId, rejectParams);
            return result !== false ? 'SUCCESS' : 'FAILED';
        } catch (error) {
            console.error(`[OversellCompensationJob] Pazaryeri iptal çağrısı başarısız (order=${order.externalOrderId}):`, error);
            const unknown = IntegrationError.isIntegrationError(error)
                ? error.code === 'UNKNOWN_OUTCOME'
                : /\[UNKNOWN_OUTCOME\]/.test(String((error as any)?.message ?? ''));
            return unknown ? 'UNKNOWN_OUTCOME' : 'FAILED';
        }
    }

    private async resolveVariantId(clientDB: any, item: any): Promise<any | null> {
        if (item.internalVariantId) return item.internalVariantId;
        if (item.barcode) {
            const byBarcode = await clientDB.getVariantModel().findOne({ barcode: item.barcode }).select('_id').lean();
            if (byBarcode) return byBarcode._id;
        }
        if (item.sku) {
            const bySku = await clientDB.getVariantModel().findOne({ stockcode: item.sku }).select('_id').lean();
            if (bySku) return bySku._id;
        }
        return null;
    }

    /** Tenant düzeyi `stockPolicy` yok (ADR: kanal başına `marketplace[].settings.stockPolicy`). */
    private resolveStockPolicy(integrationDoc: any, integrationCode: string): any {
        const mp = (integrationDoc?.marketplace || []).find((m: any) => m.code === integrationCode);
        return mp?.settings?.stockPolicy || {};
    }

    /** [ADR-0029 NB3] Katalog kodu + params ile `notify`; bayrak kapaliyken eski olay (`legacy`) birebir. */
    private async notify(
        clientOrder: number,
        order: any,
        item: any,
        cat: { code: string; params: Record<string, unknown>; withInteg?: boolean },
        payload: { severity: 'success' | 'warning' | 'error'; title: string; message: string },
    ): Promise<void> {
        try {
            await NotificationService.notify(cat.code, clientOrder, {
                ...(cat.withInteg ? { integ: String(order.integrationCode ?? 'unknown') } : {}),
                lineId: String(item.externalLineItemId),
                orderId: String(order.externalOrderId),
                ...(item.sku && cat.code !== 'STOCK_COMPENSATION_MANUAL' ? { sku: String(item.sku).slice(0, 80) } : {}), // MANUAL semasinda sku yok (strict)
                ...cat.params,
            }, {
                corrId: getRequestId(),
                module: 'OversellCompensationJob',
                legacy: { event: {
                    clientId: String(clientOrder),
                    notificationData: {
                        type: 'STOCK_ALERT',
                        severity: payload.severity,
                        title: payload.title,
                        message: payload.message,
                        metaData: {
                            integrationCode: order.integrationCode,
                            externalOrderId: order.externalOrderId,
                            externalLineItemId: item.externalLineItemId,
                            sku: item.sku,
                            barcode: item.barcode,
                        },
                    },
                } as any },
            });
        } catch (error) {
            console.error('[OversellCompensationJob] Bildirim gönderilemedi:', error);
        }
    }
}
