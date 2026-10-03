import { carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { IOrderPackage, IOrderRejectParams, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload, OrderInternalStatusEnum } from '@interfaces/index';
import { OrderConnector } from '../api/OrderConnector';
import { paginatePage, readTotal, N11_MAX_PAGES } from '../api/paginatePage';
import { OrderMapper } from '../transformers/OrderMapper';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';
import { eventLog } from '@platform/core/logger';

const log = eventLog('adapter-n11', 'OrderService');
/** Kayıtların TÜMÜ kimliksizse ve en az bu kadar kayıt varsa şema kayması varsayılır (Trendyol/HB/Pazarama DRIFT_MIN_RECORDS ile aynı eşik). */
const DRIFT_MIN_RECORDS = 3;

export class OrderService {
    private connector: OrderConnector;
    private mapper: OrderMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new OrderConnector(this.service, this.params);
        this.mapper = new OrderMapper();
    }

    /**
     * REST sipariş sayfalaması (ortak `paginate` üzerinde; bkz. api/paginatePage.ts). Durma: totalElements'a ulaşma | dönen < pageSize | boş sayfa.
     * Sunucu sayfa parametresini yok sayıp aynı sayfayı dönerse ya da sayfa tavanına (50) ulaşılırsa sonuç `markIncomplete` ile işaretlenir
     * (yapılandırılmış uyarı). İlk sayfa `content[]` içermiyorsa `undefined` (çağıran SOAP'a düşer); sonraki sayfa bozuksa fırlatılır
     * (kısmi sonuç dönmez). Tarih istek biçimi: epoch ms (ikincil kaynak: GMT+3 - epoch
     * mutlak olduğundan dönüşüm gerekmez; parametre adları startDate/endDate ikincil kaynağa dayanır, DOĞRULANAMADI).
     */
    private async fetchAllRestPages(query?: Record<string, any>): Promise<any[] | undefined> {
        const window: Record<string, number> = {};
        if (query?.lastSyncTimestamp) {
            const start = new Date(query.lastSyncTimestamp).getTime();
            if (Number.isFinite(start)) {
                window.startDate = start;
                // [faz4-int-wp7] Motor daraltilmis pencere icin endDate verebilir (eksik cekimde bolme).
                const qe = query?.endDate ? new Date(query.endDate).getTime() : NaN;
                window.endDate = Number.isFinite(qe) ? qe : Date.now();
            }
        }
        let shapeMissing = false;
        const raw = await paginatePage(async (page, limit) => {
            // [eslesme-fiyat WP4, C-5] resmî `page`/`size` (max 100; 10413) — eskiden `currentPage`/`pageSize`.
            const response = await this.connector.fetchOrdersRest({ page, size: limit, ...window });
            if (!Array.isArray(response?.content)) {
                if (page === 0) {
                    log.warn('N11_REST_UNEXPECTED_SHAPE', `REST yanıtı beklenen şekilde değil (content[] yok), SOAP'a düşülüyor. Yanıt anahtarları: ${Object.keys(response ?? {}).join(',') || '(boş)'}`);
                    shapeMissing = true;
                    return { items: [] };
                }
                throw new Error(`REST sipariş sayfa ${page} beklenen şekilde değil (content[] yok); kısmi sonuç döndürülmedi.`);
            }
            return { items: response.content, total: readTotal(response.totalElements) };
        }, { operation: 'fetchOrders', clientId: this.clientId, maxPages: N11_MAX_PAGES });
        return shapeMissing ? undefined : raw;
    }

    /** Sayfalar arası örtüşen paketleri tekilleştirir (kimlik: id ?? orderNumber). Kimlik denetiminden SONRA çağrılır (kimliksiz kayıtlar birbirine çökmesin). */
    private dedupe(list: any[]): any[] {
        const seen = new Set<string>();
        return list.filter(o => {
            const key = String(o?.id ?? o?.orderNumber ?? JSON.stringify(o));
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * [INT-05 / conformance C7b, playbook §4.2] Sipariş numarası (`orderNumber`) olmayan kayıt (mapper da bunu eler) SESSİZCE yutulmaz:
     * atlanır + loglanır (Trendyol C22 / HB / Pazarama deseni); kayıtların TÜMÜ (>= DRIFT_MIN_RECORDS) kimliksizse şema kayması varsayılıp
     * VALIDATION fırlatılır. `carryIncomplete` ham diziden okunur (işaret ham dizidedir).
     */
    private dropMissingIdentity(raw: any[]): any[] {
        const valid = raw.filter(o => !!o?.orderNumber);
        const skipped = raw.length - valid.length;
        if (skipped === 0) return raw;
        log.error('ORDERSERVICE_N11_SIPARIS_KIMLIGI_EKSIK', `${skipped}/${raw.length} N11 sipariş kaydı kimlik (orderNumber) eksikliği nedeniyle ATLANDI (şema kayması olabilir).`);
        if (raw.length >= DRIFT_MIN_RECORDS && valid.length === 0) {
            throw new IntegrationError('VALIDATION',
                `N11 sipariş yanıtı beklenen kimlik alanlarını taşımıyor (${raw.length}/${raw.length} kayıt geçersiz; şema kayması şüphesi).`,
                { integrationCode, operation: 'fetchOrders', clientId: this.clientId, platformCode: 'ORDER_SCHEMA_DRIFT' });
        }
        return valid;
    }

    public async fetchOrders(query?: Record<string, any>): Promise<IOrderPackage[]> {
        try {
            // Try REST first
            try {
                // [faz4-int-wp1 / F-02] Tüm sayfalar dolaşılır; lastSyncTimestamp varsa zaman penceresi (epoch ms)
                // isteğe girer. İlk sayfa beklenen şekilde değilse (content[] yok) eski davranış: SOAP'a düşülür.
                const restPackages = await this.fetchAllRestPages(query);
                if (restPackages) {
                    return carryIncomplete(restPackages, this.mapper.toInternalOrderPackagesFromRest({ content: this.dedupe(this.dropMissingIdentity(restPackages)) }));
                }
                // content[] yok: fetchAllRestPages uyardı; SOAP'a bilinçli düşülür.
            } catch (e: any) {
                // [ADR-0006 Karar 2] TERS ÇEVRİLDİ: ÖNCEKİ DAVRANIŞ her REST hatasında (AUTH/VALIDATION
                // dahil) sessizce SOAP'a düşerdi. Yedek yol yalnızca UNAVAILABLE/NOT_SUPPORTED'ta ve
                // LOGLANARAK kullanılır; AUTH/VALIDATION'da yedeğe düşülmez, hata doğrudan fırlatılır.
                const code = IntegrationError.isIntegrationError(e) ? e.code : undefined;
                if (code !== 'UNAVAILABLE' && code !== 'NOT_SUPPORTED') throw e;
                log.warn('ORDERSERVICE_REST_BASARISIZ_SOAP_DUSULUYOR', `REST başarısız (${code}), SOAP'a düşülüyor: ${e.message}`);
            }

            // N11 API requires search parameters. We default to the last 24 hours.
            const startDate = query?.lastSyncTimestamp
                ? new Date(query.lastSyncTimestamp)
                : new Date(Date.now() - 24 * 60 * 60 * 1000);

            const endDate = new Date();

            const formatDate = (date: Date) => {
                return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
            };

            const payload = {
                'sch:searchData': {
                    period: {
                        startDate: formatDate(startDate),
                        endDate: formatDate(endDate)
                    }
                }
            };

            const response = await this.connector.fetchOrdersFromPlatform(payload);
            const soapOrders = response?.orderList?.order;
            const soapList = soapOrders ? (Array.isArray(soapOrders) ? soapOrders : [soapOrders]) : [];
            return this.mapper.toInternalOrderPackages({ orderList: { order: this.dropMissingIdentity(soapList) } });

        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11OrderService:fetchOrders] ${error.message}`);
        }
    }

    /**
     * [ADR-0006 adım 4] TERS ÇEVRİLDİ (BACKLOG C9 sahte başarı): ÖNCEKİ DAVRANIŞ hiçbir SOAP/REST
     * çağrısı yapmadan `true` dönüyordu (bkz. tests/characterization/stubs/N11.approveReject.stub.test.ts).
     * Gerçek N11 sipariş reddi (ClaimReturn/ShipmentPackage reddi) uç noktası uygulanana kadar
     * NOT_SUPPORTED fırlatılır.
     */
    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        throw new IntegrationError('NOT_SUPPORTED', 'N11 sipariş reddi henüz gerçek olarak uygulanmadı.', {
            integrationCode, operation: 'rejectOrder', clientId: this.clientId,
        });
    }

    /**
     * [eslesme-fiyat WP4, 02-ekler/n11 C-9] `MakeOrderItemShipment` gövdesi kaynaklardaki yapıya göre: `orderItemList.orderItem[]{ id,
     * shipmentInfo{ shipmentCompany{id}, campaignNumber, trackingNumber, shipmentMethod } }`. ESKİDEN yalnız İLK kalem, firma ADI
     * (`shipmentCompany.name`) ve takip numarası `campaignNumber`'a da yazılıyordu. Artık TÜM kalemler; firma kimliği `carrierCode`
     * sayısalsa doğrudan, değilse `GetShipmentCompanies` listesinden ad/kısa ad/kodla çözülür (bulunamazsa ağa gitmeden VALIDATION);
     * `campaignNumber` yalnız `meta.campaignNumber` verilirse. Şema [İKİNCİL] kaynaktan: resmî WSDL ile yerelde doğrulanacak.
     */
    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        try {
            const fromLines = (payload.lineItems || []).map(l => l?.externalLineItemId).filter((v): v is string => v !== undefined && v !== null && String(v) !== '');
            const fromMeta = Array.isArray(payload.meta?.lines) ? payload.meta!.lines.map((l: any) => l?.orderLineId ?? l?.id).filter((v: any) => v !== undefined && v !== null && String(v) !== '') : [];
            const itemIds = [...new Set((fromLines.length ? fromLines : fromMeta.length ? fromMeta : [payload.orderId]).map(String))];
            const companyId = await this.resolveShipmentCompanyId(payload);
            const shipmentInfo: Record<string, any> = {
                shipmentCompany: { id: companyId },
                trackingNumber: payload.trackingCode,
                shipmentMethod: 1,
            };
            if (payload.meta?.campaignNumber) shipmentInfo.campaignNumber = String(payload.meta.campaignNumber);
            const soapPayload = {
                'sch:orderItemList': { orderItem: itemIds.map(id => ({ id, shipmentInfo })) },
            };

            await this.connector.makeOrderItemShipment(soapPayload);
            return { success: true };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11OrderService:sendOrderShipping] ${error.message}`);
        }
    }

    private shipmentCompanies?: Promise<any[]>;

    private async resolveShipmentCompanyId(payload: ISendTrackingPayload): Promise<string> {
        const code = String(payload.carrierCode ?? '').trim();
        if (/^\d+$/.test(code)) return code;
        const name = String(payload.carrierName ?? '').trim();
        const wanted = [code, name].filter(Boolean).map(v => v.toLocaleLowerCase('tr'));
        if (!wanted.length) {
            throw new IntegrationError('VALIDATION', `N11 kargo bildirimi: kargo firması belirtilmedi (${payload.orderId}).`, {
                integrationCode, operation: 'sendOrderShipping', clientId: this.clientId,
            });
        }
        this.shipmentCompanies ??= this.connector.fetchShipmentCompanies().then((r: any) => {
            const list = r?.shipmentCompanies?.shipmentCompany ?? [];
            return Array.isArray(list) ? list : [list];
        }).catch((e: any) => { this.shipmentCompanies = undefined; throw e; });
        const list = await this.shipmentCompanies;
        const hit = list.find((c: any) => [c?.name, c?.shortName, c?.code].some(v => v !== undefined && v !== null && wanted.includes(String(v).trim().toLocaleLowerCase('tr'))));
        if (!hit?.id) {
            throw new IntegrationError('VALIDATION', `N11 kargo bildirimi: '${name || code}' N11 kargo firmaları listesinde bulunamadı.`, {
                integrationCode, operation: 'sendOrderShipping', clientId: this.clientId,
            });
        }
        return String(hit.id);
    }

    /**
     * [ADR-0006 adım 4] TERS ÇEVRİLDİ (BACKLOG C9 sahte başarı): ÖNCEKİ DAVRANIŞ hiçbir SOAP/REST
     * çağrısı yapmadan `true` dönüyordu. [eslesme-fiyat WP4] Onay artık gerçek REST çağrısıdır; diğerleri NOT_SUPPORTED.
     */
    public async updateOrderPackageStatus(orderNumber: string, externalLineItemId: string, targetStatus: OrderInternalStatusEnum, meta?: any): Promise<boolean> {
        // [eslesme-fiyat WP4, 02-ekler/n11 C-7] Onay REST'te var: `Created` kalemlerin `orderLineId` listesi `Picking`'e çekilir.
        // Diğer statüler resmî uçta yok → NOT_SUPPORTED kalır (sahte başarı yok).
        if (targetStatus !== OrderInternalStatusEnum.APPROVED) {
            throw new IntegrationError('NOT_SUPPORTED', `N11 sipariş statü güncelleme yalnız onay (Picking) için destekleniyor (${targetStatus}).`, {
                integrationCode, operation: 'updateOrderPackageStatus', clientId: this.clientId,
            });
        }
        const lines: any[] = Array.isArray(meta?.lines) ? meta.lines : [];
        const fromLines = lines
            .filter((l) => {
                const st = l?.orderItemLineItemStatusName ?? l?.status;
                return st === undefined || st === null || String(st).toLowerCase() === 'created';
            })
            .map((l) => Number(l?.orderLineId))
            .filter((n) => Number.isFinite(n) && n > 0);
        const fallback = Number(externalLineItemId || meta?.externalLineItemId);
        const lineIds = fromLines.length ? fromLines : (Number.isFinite(fallback) && fallback > 0 ? [fallback] : []);
        if (!lineIds.length) {
            throw new IntegrationError('VALIDATION', `N11 sipariş onayı: onaylanacak kalem (orderLineId) bulunamadı (${orderNumber}).`, {
                integrationCode, operation: 'updateOrderPackageStatus', clientId: this.clientId,
            });
        }
        await this.connector.updateOrderRest(lineIds, 'Picking');
        return true;
    }

    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        try {
            const soapPayload = {
                'sch:orderNumber': payload.orderId,
                'sch:url': payload.pdfUrl
            };
            await this.connector.saveLinkSellerInvoice(soapPayload);
            return { success: true };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11OrderService:sendOrderInvoice] ${error.message}`);
        }
    }

    public async retrieveOrderRejectionReasons(): Promise<any[]> {
        return [
            { id: 'OUT_OF_STOCK', title: 'Stokta Yok' }
        ];
    }
}
