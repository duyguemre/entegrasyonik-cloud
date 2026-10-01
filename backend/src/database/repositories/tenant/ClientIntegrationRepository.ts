import { IClientDB } from '@interfaces/index';

/** `ClientIntegrations` tekil belgesindeki kanal dizileri (tenant DB; ADR-0003 sır alanları bu dizilerin `settings` altında). */
export type IntegrationSlot = 'erp' | 'marketplace' | 'shipment' | 'ecommerce';

/**
 * ADR-0024 P3-INT: `ClientIntegrations` sorguları (eski `IntegrationService` gövdesinden; sorgu biçimleri BİREBİR korunur).
 * Kurucu tenant DB tutamacını alır (clientId parametresi yok; tenant = tutamaç).
 */
export class ClientIntegrationRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getClientIntegrationModel(); }

    /** Tenant entegrasyon belgesi (sıralı ilk). */
    findFirstSorted(): Promise<any> {
        return this.model.findOne({}).sort({ order: 1 }).lean();
    }

    /** Tenant entegrasyon belgesi (sırasız; stok politikası okuması). */
    findDoc(): Promise<any> {
        return this.model.findOne({}).lean();
    }

    /** Tek kanal öğesini (`<slot>.code === code`) belge `_id`'siz projeksiyonla döner: `{ [slot]: [item] }`. */
    findSlotItem(slot: IntegrationSlot, code: unknown): Promise<any> {
        return this.model.findOne({ [slot + '.code']: code }, { [slot]: { $elemMatch: { code } }, _id: 0 }).lean();
    }

    /** Güncelleme (upsert yok, güncel belge döner). */
    updateOne(filter: Record<string, any>, update: Record<string, any>): Promise<any> {
        return this.model.findOneAndUpdate(filter, update, { upsert: false, returnDocument: 'after' });
    }

    /** `updateOne` ile aynı; sonuç `lean()` (e-ticaret ayarı yazımının eski biçimi). */
    updateOneLean(filter: Record<string, any>, update: Record<string, any>): Promise<any> {
        return this.model.findOneAndUpdate(filter, update, { upsert: false, returnDocument: 'after' }).lean();
    }

    /** Pazaryeri sıralaması: kod başına `order` 1..n. */
    sortByCodes(sortedCodes: Iterable<unknown>): Promise<any> {
        let order = 1;
        const updates = [];
        for (const code of sortedCodes) updates.push({ updateOne: { filter: { code }, update: { $set: { order: order++ } } } });
        return this.model.bulkWrite(updates);
    }
}
