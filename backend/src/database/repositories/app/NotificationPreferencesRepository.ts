import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `NotificationPreferences` (userId = kullanıcı, null = tenant varsayılanı). Model her çağrıda alınır. */
export class NotificationPreferencesRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getNotificationPreferencesModel() }

    async findOne(tid: number, userId: string | null): Promise<any> {
        return await this.model.findOne({ tid, userId }).lean()
    }

    /** Kendi + tenant varsayılanı tercihleri paralel okur (sıra: kendi, varsayılan). */
    async findMineAndTenantDefault(tid: number, userId: string): Promise<[any, any]> {
        const model = this.model
        return await Promise.all([
            model.findOne({ tid, userId }).lean(),
            model.findOne({ tid, userId: null }).lean(),
        ])
    }

    async upsert(tid: number, userId: string | null, update: Record<string, unknown>): Promise<any> {
        return await this.model.findOneAndUpdate({ tid, userId }, update, { upsert: true, new: true })
    }
}
