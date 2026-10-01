import { IClientDB } from '@interfaces/index';

/** Tenant entegrasyon belgesindeki kanal dizileri (`ClientIntegration.<tip>[]`). */
export type ClientIntegrationKind = 'erp' | 'marketplace' | 'shipment' | 'ecommerce';

/**
 * ADR-0024 Dalga 3 (P3-INT): tenant DB `ClientIntegrations` belgesi (kanal ayarları, stok politikası, sıralama).
 * Kurucu tenant DB tutamacını alır (ADR-0016 §5.1, `clientId` parametresi yok). Model her çağrıda alınır.
 * Sır maskeleme/şifreleme ve URL alanı temizliği burada DEĞİL, `operations/integrations/settings.ts`'tedir.
 */
export class ClientIntegrationRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getClientIntegrationModel(); }

    /** Tek tenant belgesi (yalın), `order` artan sıralı (eski `getClientIntegrations`). */
    findDocSorted(): Promise<any> {
        return this.model.findOne({}).sort({ order: 1 }).lean();
    }

    /** Tek tenant belgesi (yalın, sıralamasız; stok politikası okuması). */
    findDoc(): Promise<any> {
        return this.model.findOne({}).lean();
    }

    /** `{<tip>.code: code}` belgesinden yalnız ilgili kanal öğesi (`$elemMatch`), `_id` hariç. */
    findItem(kind: ClientIntegrationKind, code: any): Promise<any> {
        return this.model.findOne(
            { [kind + '.code']: code },
            { [kind]: { $elemMatch: { code } }, _id: 0 }
        ).lean();
    }

    /** Kanal öğesinin `settings` alanını tamamen yazar; güncel belge döner (yalın DEĞİL — eski çağrı). */
    setItemSettings(kind: Exclude<ClientIntegrationKind, 'ecommerce'>, code: any, settings: any): Promise<any> {
        return this.model.findOneAndUpdate({ [kind + '.code']: code }, { $set: { [kind + '.$.settings']: settings }, },
            { upsert: false, returnDocument: 'after' }
        );
    }

    /** E-ticaret öğesi için alan alan `$set/$unset` güncellemesi; güncel belge (yalın). */
    updateECommerceItem(code: any, update: Record<string, any>): Promise<any> {
        return this.model.findOneAndUpdate({ 'ecommerce.code': code }, update,
            { upsert: false, returnDocument: 'after' }
        ).lean();
    }

    /** Atomik kısmi güncelleme (stok politikası); eşleşme yoksa `null`. */
    updateWhere(filter: Record<string, any>, update: Record<string, any>): Promise<any> {
        return this.model.findOneAndUpdate(filter, update, { upsert: false, returnDocument: 'after' });
    }

    bulkWrite(ops: any[]): Promise<any> {
        return this.model.bulkWrite(ops);
    }
}
