import { ObjectId } from 'mongodb'
import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-ADM): tenant `Users` (profil/üyelik projeksiyonu) sorguları. Tenant izolasyonu kurucudaki tutamaktan gelir.
 * Model her çağrıda tutamaktan alınır. Kimlik bilgisinin doğruluk kaynağı merkezi `Users`'tır (`UserRepository`, ADR-0016 §5.3).
 */
export class TenantUserRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getUserModel() }

    /** `$match` → `$sort` ($facet dışında: indeks kullanılabilir, DB-02) → `$facet` { totalNumberOfRecords, users(projeksiyonlu) }. Ham sonucu döner. */
    async aggregatePage(sortBy: any, skip: number, limit: number, projection: Record<string, unknown>): Promise<any[]> {
        return await this.model.aggregate([
            { $match: {} }, // ClientDB izoledir, ek bir filtera gerek yok
            { $sort: sortBy },
            {
                $facet: {
                    totalNumberOfRecords: [{ $count: 'count' }],
                    users: [
                        { $skip: skip },
                        { $limit: limit },
                        { $project: projection }
                    ]
                }
            },
        ])
    }

    async create(user: any): Promise<any> {
        return await this.model.create(user)
    }

    /** `userId` geçersizse `new ObjectId()` sorgudan ÖNCE fırlatır. */
    async findById(userId: string): Promise<any> {
        return await this.model.findOne({ _id: new ObjectId(userId) })
    }

    async updateById(userId: string, fields: Record<string, unknown>): Promise<any> {
        return await this.model.updateOne({ _id: new ObjectId(userId) }, { $set: fields })
    }

    async deleteById(id: unknown): Promise<any> {
        return await this.model.deleteOne({ _id: id })
    }
}
