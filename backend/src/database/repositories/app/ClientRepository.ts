import type { IApplicationDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `Clients` koleksiyonu sorguları. Model her çağrıda tutamaktan alınır.
 */
export class ClientRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getClientModel() }

    /** Yönetici listesi: güvenli projeksiyon + sıralama + sayfa ve toplam (koşut). */
    async listPage(query: any, projection: any, sort: any, skip: number, limit: number): Promise<[any[], number]> {
        return await Promise.all([
            this.model.find(query).select(projection).sort(sort).skip(skip).limit(limit).lean(),
            this.model.countDocuments(query),
        ]) as [any[], number]
    }

    /** `clientId` + `title` alanlarıyla ACTIVE mağazalar. */
    async listActiveIdTitle(): Promise<any[]> {
        return await this.model.find({ status: 'ACTIVE' }, 'clientId title').lean()
    }

    /** Oturum/mağaza seçimi için asgari alanlar. */
    async findSessionTarget(order: number): Promise<any> {
        return await this.model.findOne({ order }, 'order clientId title status').lean()
    }

    async findByOrder(order: number): Promise<any> {
        return await this.model.findOne({ order }).lean()
    }

    async findIdTitleByClientIds(clientIds: any[]): Promise<any[]> {
        return await this.model.find({ clientId: { $in: clientIds } }).select('clientId title').lean()
    }

    async listAllIdTitleByTitle(): Promise<any[]> {
        return await this.model.find({}).select('clientId title').sort({ title: 1 }).lean()
    }

    async updateByOrder(order: number, $set: any): Promise<any> {
        return await this.model.findOneAndUpdate({ order }, { $set }, { new: true })
    }
}
