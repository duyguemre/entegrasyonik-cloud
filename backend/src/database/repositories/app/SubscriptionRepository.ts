import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `Subscriptions` sorguları. */
export class SubscriptionRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getSubscriptionModel() }

    async findByClientId(clientId: number): Promise<any> {
        return await this.model
            .findOne({ clientId })
            .lean()
    }

    /** Checkout başlatma: plan/sağlayıcı referansını yazar; durum yalnızca ekleme anında `trialing` (mevcut durum ezilmez). */
    async upsertCheckout(clientId: number, fields: { planCode: string; planVersion: any; provider: string; providerSubscriptionRef: string }): Promise<void> {
        await this.model.updateOne(
            { clientId },
            {
                $set: {
                    planCode: fields.planCode,
                    planVersion: fields.planVersion,
                    provider: fields.provider,
                    providerSubscriptionRef: fields.providerSubscriptionRef,
                },
                $setOnInsert: { status: 'trialing' },
            },
            { upsert: true },
        )
    }
}
