import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `Tickets` koleksiyonu sorguları. Model her çağrıda tutamaktan alınır. */
export class TicketRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getTicketModel() }

    /** `$match` → `$sort` ($facet dışında: indeks kullanılabilir, DB-02) → `$facet` { totalRecords, tickets }. Ham toplulaştırma sonucunu döner. */
    async aggregatePage(filterQuery: any, sort: any, skip: number, limit: number): Promise<any[]> {
        return await this.model.aggregate([
            { $match: filterQuery },
            { $sort: sort },
            {
                $facet: {
                    totalRecords: [{ $count: 'count' }],
                    tickets: [
                        { $skip: skip },
                        { $limit: limit }
                    ]
                }
            }
        ])
    }

    /** Backoffice listesi: filtre + sıralama + skip/limit (lean). */
    async findPage(query: any, sort: any, skip: number, limit: number): Promise<any[]> {
        return await this.model.find(query).sort(sort).skip(skip).limit(limit).lean()
    }

    async count(query: any): Promise<number> {
        return await this.model.countDocuments(query)
    }

    async deleteById(ticketId: unknown): Promise<any> {
        return await this.model.findByIdAndDelete(ticketId)
    }

    async updateById(ticketId: unknown, update: any): Promise<any> {
        return await this.model.findByIdAndUpdate(ticketId, update)
    }

    async create(ticket: any): Promise<any> {
        return await this.model.create(ticket)
    }

    /** Kiracıya ait biletin üzerinde güncelleme uygular; güncellenmiş belgeyi döner. */
    async updateOwned(ticketId: unknown, clientId: number, update: any): Promise<any> {
        return await this.model.findOneAndUpdate({ _id: ticketId, clientId }, update, { new: true })
    }
}
