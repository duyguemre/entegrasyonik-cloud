import type { IApplicationDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-ADM): ApplicationDB merkezi `Users` (kimlik doğruluk kaynağı, ADR-0016 §5.3) sorguları.
 * Model her çağrıda tutamaktan alınır.
 */
export class UserRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getUserModel() }

    /** Model tutamacı alan operasyonlara (ör. `assertRecentReauth`) geçirmek için; sorgu yazmak için kullanılmaz. */
    get userModel() { return this.model }

    async create(user: any): Promise<any> {
        return await this.model.create(user)
    }

    async findByEmail(email: string): Promise<any> {
        return await this.model.findOne({ email })
    }

    /** Tenant'taki aktif (`isActive !== false`) sahip sayısı. */
    async countActiveOwners(clientId: number | string): Promise<number> {
        return await this.model.countDocuments({ order: clientId, owner: true, isActive: { $ne: false } })
    }

    /** Merkezi kaydı (e-posta + tenant) günceller; `update` tam güncelleme belgesidir (`$set`/`$inc`). */
    async updateByEmail(email: string, clientId: number | string, update: any): Promise<any> {
        return await this.model.updateOne({ email, clientId }, update)
    }

    /** Kimlikle belge (mongoose belgesi; parola karşılaştırması için). */
    async findById(id: unknown): Promise<any> {
        return await this.model.findById(id)
    }

    async findByIdLean(id: unknown): Promise<any> {
        return await this.model.findById(id).lean()
    }

    async updateById(id: unknown, update: any): Promise<any> {
        return await this.model.updateOne({ _id: id }, update)
    }

    async deleteByEmail(email: string, clientId: number | string): Promise<any> {
        return await this.model.deleteOne({ email, clientId })
    }
}
