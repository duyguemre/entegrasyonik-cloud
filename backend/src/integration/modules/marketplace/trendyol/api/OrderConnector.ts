// api/OrderConnector.ts
import { IOrderRejectParams } from '@interfaces/platforms';
import Service from '../services/Service';
import { IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload } from '@interfaces/index';
import { fromHttpError, IntegrationError } from '@integration/modules/common/IntegrationError';
import { readMockConfig } from '@integration/modules/common/mock/MockMode';
import { integrationCode } from '../constants';
import { TRENDYOL_ORDER_V2, orderListPacer, trendyolOrderListRatePerMin } from '../limits';
import { normalizeTrendyolOrderListUrl } from '../urlSafetyNet';
import { TRENDYOL_ORDERS_LIST_CONTRACT } from '../contracts/orders.list';
import { eventLog } from '@platform/core/logger';

const log = eventLog('adapter-trendyol', 'OrderConnector');

/** Kod içi varsayılan (DB'de orderListUrl yoksa): resmi V2 yolu (spec §1). */
const DEFAULT_ORDER_LIST_URL = "https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders";
/** ESKİ-URL uyarısının süreç başına tekrarını önler (60 sn'lik poll'da log seli olmasın). */
const warnedLegacyUrl = new Set<string>();

export class OrderConnector {
    constructor(private service: Service, private params: any) { }

    /**
     * [C22, 2026-09-28] Sipariş V2 çekimi (spec §2.1): pencere <= 14 gün, size <= 200, sayfa <= 49 (10.000 paket),
     * `totalElements > 10000` => pencere ikiye bölünür (daraltılır), sayfalar ARDIŞIK ve oran limitli (satıcı başına
     * 30/dk muhafazakâr taban, limits.ts) çekilir — eski paralel Promise.all kalktı.
     * Not: `page`/`size` çağıran tarafından verilse de yok sayılır (bu sınıf yönetir). `stream` ucu (orders/stream)
     * bu sürümde KULLANILMAZ: daraltma yeterli; stream oran limiti yayınlanmamış (spec §8 madde 5).
     */
    public async fetchOrdersFromPlatform(query?: any): Promise<any[]> {
        const settings = this.params.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;
        // [Trendyol URL/UA düzeltmesi, 2026-09-27, docs/research/2026-09-27-api-verification.md,
        // BACKLOG.md C11] ESKİ varsayılan (artık geçersiz): "https://api.trendyol.com/sapigw/sellers/<SELLERID>/orders"
        // (yanlış host + yanlış yol öneki + eksik /v2/). Resmi/güncel doğrulanmış değer:
        // "https://apigw.trendyol.com/integration/order/sellers/{sellerId}/v2/orders".
        const urlTemplate = this.resolveOrderListUrl(settings);
        const baseUrl = urlTemplate.replace("<SELLERID>", sellerId);

        // Statü/sipariş no vb. filtreler aynen; tarihler ayrı işlenir (pencere bölme).
        const filterParams = new URLSearchParams();
        let startMs: number | undefined;
        let endMs: number | undefined;
        if (query) {
            Object.keys(query).forEach(key => {
                if (!query[key]) return;
                if (key === 'startDate') { startMs = this.toEpochMs(key, query[key]); return; }
                if (key === 'endDate') { endMs = this.toEpochMs(key, query[key]); return; }
                if (key === 'page' || key === 'size') return; // sayfalama bu sınıfa aittir
                filterParams.append(key, query[key]);
            });
        }

        // Pencereler: tarih verilmediyse tek (sunucu varsayılanı = son 1 hafta) pencere; verildiyse <=14 günlük parçalar.
        const windows: Array<{ start?: number; end?: number }> = [];
        if (startMs === undefined && endMs === undefined) {
            windows.push({});
        } else {
            const now = Date.now();
            const end = endMs ?? now;
            // [WP5] Yalnız son 1 ay sorgulanabilir: daha eski başlangıç kırpılır (aksi halde 4xx); bitiş de bu tabanın altındaysa boş.
            const floor = now - TRENDYOL_ORDER_V2.maxLookbackMs;
            const rawStart = startMs ?? (end - TRENDYOL_ORDER_V2.maxWindowMs);
            if (end < rawStart) {
                throw new IntegrationError('VALIDATION', 'Sipariş sorgusu: endDate startDate\'ten önce olamaz.', {
                    integrationCode, operation: 'fetchOrdersFromPlatform', clientId: this.params.clientId,
                });
            }
            const start = Math.max(rawStart, floor);
            if (end < start) return []; // tüm aralık 1 aylık pencerenin dışında: sorgulanamaz (Trendyol yalnız son 1 ay)
            for (let cursor = start; cursor <= end;) {
                const wEnd = Math.min(end, cursor + TRENDYOL_ORDER_V2.maxWindowMs);
                windows.push({ start: cursor, end: wEnd });
                if (wEnd >= end) break;
                cursor = wEnd + 1;
            }
        }

        const byId = new Map<string, any>();
        const keyless: any[] = [];
        const collect = (content: any) => {
            if (!Array.isArray(content)) return;
            for (const pkg of content) {
                const k = pkg?.shipmentPackageId ?? pkg?.id ?? pkg?._id ?? pkg?.packageId;
                if (k === undefined || k === null || k === '') keyless.push(pkg);
                else byId.set(String(k), pkg); // sınır-çakışması/sayfalama sırasında tekrar: son görülen kazanır
            }
        };

        try {
            for (const win of windows) {
                await this.fetchWindow(baseUrl, filterParams, win, sellerId, collect);
            }
            return [...byId.values(), ...keyless];
        } catch (error: any) {
            // [ADR-0006 adım 3] ÖNCEKİ DAVRANIŞ hata yutup [] dönmekti ("sipariş yok" ile "çekme başarısız"
            // ayırt edilemiyordu, bkz. tests/characterization/stubs/Trendyol.errorSwallow.stub.test.ts).
            // Artık IntegrationError fırlatılır; ImportOrchestrator/Stager hatayı görür, imleç ilerlemez.
            log.error('ORDERCONNECTOR_SIPARIS_CEKME_HATASI', `${sellerId} için sipariş çekme hatası:`, { err: error });
            const ie = fromHttpError(error, {
                integrationCode, operation: 'fetchOrdersFromPlatform', clientId: this.params.clientId, idempotent: true,
            });
            if (ie.httpStatus === 426) {
                // [C22] 426 = eski uç nokta brownout'u (15.10.2026'a dek günde 3x10 dk) — GEÇİCİ; kalıcı VALIDATION/DLQ değil.
                return this.throwBrownout(ie);
            }
            throw ie;
        }
    }

    private throwBrownout(cause: IntegrationError): never {
        throw new IntegrationError('UNAVAILABLE',
            'Trendyol sipariş uç noktası HTTP 426 döndü (eski sürüm brownout/kapanış). orderListUrl V2 (.../v2/orders) olmalı; geçici olarak yeniden denenecek.',
            {
                integrationCode, operation: 'fetchOrdersFromPlatform', clientId: this.params.clientId,
                httpStatus: 426, platformCode: 'TRENDYOL_426_BROWNOUT', circuitOpen: cause.circuitOpen,
            });
    }

    /**
     * Tek bir tarih penceresini sayfalar; 10.000 paket sınırı aşılırsa pencereyi ikiye bölüp özyinelemeli çeker.
     * Sayfalar ARDIŞIKtır ve her istek satıcı başına oran limitleyiciden geçer.
     */
    private async fetchWindow(
        baseUrl: string, filters: URLSearchParams, win: { start?: number; end?: number },
        sellerId: string, collect: (content: any) => void,
    ): Promise<void> {
        const pacerKey = `${this.params.clientId}:${sellerId}`;
        const pageUrl = (pageIndex: number) => {
            const q = new URLSearchParams(filters);
            q.set('page', String(pageIndex));
            q.set('size', String(TRENDYOL_ORDER_V2.pageSize));
            if (win.start !== undefined) q.set('startDate', String(win.start));
            if (win.end !== undefined) q.set('endDate', String(win.end));
            return `${baseUrl}?${q.toString()}`;
        };
        const get = async (pageIndex: number) => {
            await orderListPacer.wait(pacerKey, trendyolOrderListRatePerMin());
            // [ADR-0018 Karar 2a] `contract` YALNIZ gözlem amaçlıdır; istek/yanıt akışı AYNI kalır (bkz. ContractGuard.ts).
            // `operation` BİLİNÇLİ OLARAK verilmedi (Service.request varsayılanı URL'den türetir — davranış AYNI kalır).
            return this.service.get(pageUrl(pageIndex), undefined, { contract: TRENDYOL_ORDERS_LIST_CONTRACT });
        };

        const first = await get(0);
        const data = first?.data;
        const totalElements = Number(data?.totalElements);
        const totalPages = Number(data?.totalPages) || 1;
        const overflow = (Number.isFinite(totalElements) && totalElements > TRENDYOL_ORDER_V2.maxWindowResults)
            || totalPages > TRENDYOL_ORDER_V2.maxPageIndex + 1;

        if (overflow) {
            // Tarihsiz sorgu taşarsa sunucu varsayılanı olan "son 1 hafta" AÇIK pencereye çevrilip bölünür.
            const end = win.end ?? Date.now();
            const start = win.start ?? (end - TRENDYOL_ORDER_V2.defaultWindowMs);
            if (end - start <= TRENDYOL_ORDER_V2.minSplitMs) {
                throw new IntegrationError('VALIDATION',
                    `Trendyol sipariş penceresi ${TRENDYOL_ORDER_V2.minSplitMs / 1000} sn'ye daraltıldığı halde ${TRENDYOL_ORDER_V2.maxWindowResults} kaydı aşıyor; bölünemiyor.`,
                    { integrationCode, operation: 'fetchOrdersFromPlatform', clientId: this.params.clientId, platformCode: 'ORDER_WINDOW_OVERFLOW' });
            }
            const mid = start + Math.floor((end - start) / 2);
            await this.fetchWindow(baseUrl, filters, { start, end: mid }, sellerId, collect);
            await this.fetchWindow(baseUrl, filters, { start: mid + 1, end }, sellerId, collect);
            return;
        }

        if (data?.content) collect(data.content);
        for (let p = 1; p < totalPages; p++) {
            const res = await get(p);
            if (res?.data?.content) collect(res.data.content);
        }
    }

    /**
     * [C22] DB'deki `urls.orderListUrl` bilinen ESKİ (V2'siz/sapigw) biçimdeyse V2'ye normalize eder (bkz. urlSafetyNet.ts);
     * yerel mock modunda (TY_MOCK_MODE=true) mockserver henüz `/v2/orders` sunmadığı için (C15/C20) dokunmaz.
     * Uyarı süreç başına (clientId başına) BİR kez loglanır; log yalnızca host+yol şablonunu içerir (sorgu dizesi/sır yok).
     */
    private resolveOrderListUrl(settings: any): string {
        const configured: string | undefined = settings?.urls?.orderListUrl;
        if (!configured) return DEFAULT_ORDER_LIST_URL;
        if (readMockConfig('TY', 'http://localhost:3005/integration').enabled) return configured;
        const n = normalizeTrendyolOrderListUrl(configured);
        if (n.changed) {
            const key = String(this.params.clientId);
            if (!warnedLegacyUrl.has(key)) {
                warnedLegacyUrl.add(key);
                log.warn('ORDERCONNECTOR_CLIENT_ORDERLISTURL_ESKI_V2', `client=${key} orderListUrl ESKİ (V2'siz) biçimde algılandı, V2'ye normalize edildi: ${n.note}. ` +
                    'DB tanımı güncellenmeli (npm run migrate:trendyol-urls; Protokol 12).');
            }
        }
        return n.url;
    }

    private toEpochMs(key: string, value: any): number | undefined {
        let ms: number;
        if (value instanceof Date) ms = value.getTime();
        else if (typeof value === 'number') ms = value;
        else if (/^\d{10,}$/.test(String(value).trim())) ms = Number(String(value).trim()); // zaten epoch ms
        else ms = new Date(value).getTime();
        if (!Number.isFinite(ms)) {
            throw new IntegrationError('VALIDATION', `Sipariş sorgusu: ${key} geçerli bir tarih/zaman damgası değil.`, {
                integrationCode, operation: 'fetchOrdersFromPlatform', clientId: this.params.clientId,
            });
        }
        return ms;
    }

    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        const settings = this.params.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;

        // 1. URL Hazırlığı
        // Trendyol bu işlem için PACKAGEID bekliyor. 
        // Bu veri genellikle sipariş aktarılırken meta içinde sakladığımız shipmentPackageId'dir.
        const packageId = params.meta?.packageId || externalOrderId;

        // [Trendyol URL/UA düzeltmesi, 2026-09-27, C11] Yalnızca host+ana-yol öneki
        // ("api.trendyol.com/sapigw"→"apigw.trendyol.com/integration/order") düzeltildi; alt-yol
        // ("/shipment-packages/<PACKAGEID>/items/unsupplied") AYNEN korundu — resmi olarak
        // TEYİT EDİLMEDİ (docs/research/2026-09-27-api-verification.md kapsam dışı bıraktı),
        // TAHMİN EDİLMEDİ.
        const urlTemplate = settings.urls?.orderRejectUrl || "https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/shipment-packages/<PACKAGEID>/items/unsupplied";
        const baseUrl = urlTemplate
            .replace("<SELLERID>", sellerId)
            .replace("<PACKAGEID>", packageId);

        // [eslesme-fiyat WP4, 02-ekler/trendyol C-11] `reasonId` SAYISAL olmalı; eskiden `Number('OUT_OF_STOCK')` = NaN sessizce
        // gidiyordu. Sayı değilse ağa yazmadan VALIDATION (sebep kodu kataloğu resmî sayfadan doğrulanamadı).
        const reasonId = Number(params.reasonId);
        if (params.reasonId === undefined || params.reasonId === null || String(params.reasonId).trim() === '' || !Number.isInteger(reasonId)) {
            throw new IntegrationError('VALIDATION', `Trendyol tedarik edememe: reasonId sayısal olmalı ('${String(params.reasonId ?? '').slice(0, 30)}').`, {
                integrationCode, operation: 'rejectOrder', clientId: this.params.clientId,
            });
        }

        // 2. Payload (Body) Hazırlığı
        // Verdiğin örnek formata göre (lines dizisi ve reasonId)
        const payload = {
            lines: params.lineItems?.map(line => ({
                lineId: Number(line.externalLineId), // Örnekte 0 (number) bekliyor
                quantity: line.quantity
            })) || [],
            reasonId // Örnekte 0 (number) bekliyor
        };

        // Trendyol dokümanına göre bu endpoint PUT çalışır
        await this.service.put(baseUrl, payload);
        return true;
    }



    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        const settings = this.params.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;
        // [Trendyol URL/UA düzeltmesi, 2026-09-27, C11] Yalnızca host+ana-yol öneki düzeltildi;
        // alt-yol ("/shipment-packages/shipped") AYNEN korundu — resmi olarak teyit edilmedi.
        const urlTemplate = settings.urls?.orderShippingUrl || "https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/shipment-packages/shipped";
        const baseUrl = urlTemplate.replace("<SELLERID>", sellerId);

        // Trendyol tekil gönderim için bile list (array) beklediği için sarmalıyoruz
        const payloadBody = {
            shipments: [
                {
                    // Interface'deki orderId'yi Trendyol'un shipmentPackageId'si olarak kullanıyoruz
                    shipmentPackageId: payload.orderId,
                    trackingNumber: payload.trackingCode,
                    carrierCode: payload.carrierCode,
                    shipmentDate: payload.shipmentDate || new Date().toISOString(),
                    // Eğer parçalı gönderim (lineItems) varsa map'le, yoksa boş bırak (tümünü kapsar)
                    items: payload.lineItems?.map(item => ({
                        lineId: item.merchantSku, // Veya externalLineId (Interface'e eklenmeli)
                        quantity: item.quantity
                    })) || []
                }
            ]
        };

        try {
            const response = await this.service.post(baseUrl, payloadBody);
            return {
                success: true,
                message: "Kargo bilgisi Trendyol'a iletildi.",
                platformId: response.data?.batchRequestId || `TY-${payload.trackingCode}`,
                rawResponse: response.data
            };
        } catch (error: any) {
            // [ADR-0006 adım 2] IntegrationError sözleşmesi: generic Error yerine kod/retryable taşıyan tip.
            throw fromHttpError(error, {
                integrationCode, operation: 'sendOrderShipping', clientId: this.params.clientId, idempotent: false,
            });
        }
    }

    /**
     * [eslesme-fiyat WP4, K-D / 02-ekler/trendyol C-5] Satıcı kargosu (`shippingModel: seller`): takip numarası bildirimi
     * `PUT order/sellers/{sellerId}/shipment-packages/{packageId}/update-tracking-number` `{trackingNumber}`.
     * Uç resmî "kargo takip kodu bildirme" sayfasından; canlı/stage doğrulaması kullanıcıda (yazma — yalnız stage).
     * DB `orderTrackingNumberUrl` verilirse o kullanılır.
     */
    public async sendSellerTrackingNumber(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        const settings = this.params.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;
        if (!payload.orderId) throw new IntegrationError('VALIDATION', 'Trendyol kargo bildirimi: paket kimliği (shipmentPackageId) yok.', { integrationCode, operation: 'sendSellerTrackingNumber', clientId: this.params.clientId });
        if (!payload.trackingCode) throw new IntegrationError('VALIDATION', 'Trendyol kargo bildirimi: takip numarası yok.', { integrationCode, operation: 'sendSellerTrackingNumber', clientId: this.params.clientId });
        const urlTemplate = settings.urls?.orderTrackingNumberUrl || "https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/shipment-packages/<PACKAGEID>/update-tracking-number";
        const url = urlTemplate.replace("<SELLERID>", sellerId).replace("<PACKAGEID>", String(payload.orderId));
        try {
            const response = await this.service.put(url, { trackingNumber: String(payload.trackingCode) });
            return { success: true, performed: true, message: "Takip numarası Trendyol'a bildirildi.", platformId: String(payload.orderId), rawResponse: response.data };
        } catch (error: any) {
            throw fromHttpError(error, { integrationCode, operation: 'sendSellerTrackingNumber', clientId: this.params.clientId, idempotent: true });
        }
    }

    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        const settings = this.params.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;

        // 1. URL Hazırlığı (Kullanıcının belirttiği sendInvoiceLinkUrl öncelikli)
        // [C22 2026-09-28] Resmi yol `sellers/{sellerId}/seller-invoice-links` (spec §1; `order/` öneki YOK).
        // ESKİ varsayılan (C11 sonrası): ".../integration/order/sellers/<SELLERID>/seller-invoice-links".
        const urlTemplate = settings.urls?.sendInvoiceLinkUrl || "https://apigw.trendyol.com/integration/sellers/<SELLERID>/seller-invoice-links";

        const baseUrl = urlTemplate.replace("<SELLERID>", sellerId);

        // 2. Payload Hazırlığı (resmi şema, spec §7): { invoiceLink, shipmentPackageId(long), invoiceNumber? }.
        // ESKİ gövde { orderNumber, invoiceLink } idi (resmi şemayla uyuşmuyordu). `invoiceDateTime` GÖNDERİLMEZ: tipi/birimi
        // spec'te doğrulanamadı (opsiyonel alan). Başarı 201; 409 anlamı spec'te açıklanmadı -> IntegrationError(VALIDATION)
        // olarak yüzeye çıkar (sahte başarı yok).
        const shipmentPackageId = Number(payload.meta?.packageId ?? payload.orderId);
        if (!Number.isFinite(shipmentPackageId)) {
            throw new IntegrationError('VALIDATION', 'Fatura linki: shipmentPackageId sayısal olmalı (Trendyol paket kimliği).', {
                integrationCode, operation: 'sendOrderInvoice', clientId: this.params.clientId,
            });
        }
        const payloadBody: Record<string, any> = {
            invoiceLink: payload.pdfUrl || "",
            shipmentPackageId,
        };
        if (payload.invoiceNumber) payloadBody.invoiceNumber = String(payload.invoiceNumber);
        // [eslesme-fiyat WP4, 02-ekler/trendyol C-6 / D-TY-8] mikro ihracat / Cross-Border (micro, etgbNo) paketlerinde
        // `invoiceNumber` (3 alfanümerik + 13 rakam) ve `invoiceDateTime` (epoch ms) ZORUNLU → eksikse ağa yazmadan VALIDATION.
        const po = payload.meta?.platformOrder ?? payload.meta ?? {};
        const invoiceTs = payload.invoiceDate !== undefined && payload.invoiceDate !== null && payload.invoiceDate !== '' ? new Date(payload.invoiceDate as any).getTime() : NaN;
        if (po.micro === true || (po.etgbNo !== undefined && po.etgbNo !== null && String(po.etgbNo) !== '')) {
            const errs: string[] = [];
            if (!/^[A-Za-z0-9]{3}\d{13}$/.test(String(payload.invoiceNumber ?? ''))) errs.push('invoiceNumber (3 harf/rakam + 13 rakam)');
            if (!Number.isFinite(invoiceTs)) errs.push('invoiceDateTime (fatura tarihi)');
            if (errs.length) {
                throw new IntegrationError('VALIDATION', `Trendyol mikro ihracat faturası: zorunlu alan eksik/geçersiz: ${errs.join(', ')}.`, {
                    integrationCode, operation: 'sendOrderInvoice', clientId: this.params.clientId,
                });
            }
            // Yalnız zorunlu olduğu pakette gönderilir (genel akışta tipi/birimi doğrulanmadı; [İKİNCİL] epoch ms).
            payloadBody.invoiceDateTime = invoiceTs;
        }

        try {
            const response = await this.service.post(baseUrl, payloadBody);

            return {
                success: true,
                message: "Fatura linki Trendyol'a başarıyla iletildi.",
                platformId: `TY-INV-${payload.invoiceNumber}`,
                rawResponse: response.data || response
            };

        } catch (error: any) {
            // [C-6] 409: link başka pakete atanmış ([İKİNCİL]) → anlamlı VALIDATION (sahte başarı yok).
            if ((error?.response?.status ?? error?.status) === 409) {
                throw new IntegrationError('VALIDATION', 'Trendyol fatura linki reddedildi (409): bu link/fatura başka bir pakete atanmış olabilir.', {
                    integrationCode, operation: 'sendOrderInvoice', clientId: this.params.clientId, platformCode: 'INVOICE_LINK_CONFLICT',
                });
            }
            // [ADR-0006 adım 2]
            throw fromHttpError(error, {
                integrationCode, operation: 'sendOrderInvoice', clientId: this.params.clientId, idempotent: false,
            });
        }
    }
}