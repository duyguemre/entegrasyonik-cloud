import { IClientDB } from "@interfaces/index";

/**
 * StatsOperations: Ürün ve Varyant stok/durum istatistiklerini yöneten,
 * ağır hesaplama ve senkronizasyon (reconcile) işlemlerinden sorumlu sınıf.
 */
export class StatsOperations {
    constructor(private clientDB: IClientDB) { }

    /**
     * İstatistikleri "kirli" (güncel değil) olarak işaretler.
     * Worker'lar (Sender, Sentinel vb.) statü değiştirdiğinde tetiklenir.
     */
    public async markStatsAsDirty(): Promise<void> {
        await this.clientDB.getStatisticsModel().updateOne(
            { _id: "variant_stats" },
            { $set: { isDirty: true } }
        );
    }

    /**
     * Tüm tabloyu tarayarak gerçek zamanlı istatistikleri hesaplar ve 
     * "variant_stats" dokümanına mühürler.
     */
    public async reconcileStatistics(): Promise<any> {
        const realData = await this.calculateFullAggregateStats();
        const totalProducts = await this.clientDB.getProductModel().countDocuments({});

        const finalStats = {
            _id: "variant_stats",
            totalProducts,
            counts: realData.counts,
            totalVariants: realData.totalVariants,
            totalStock: realData.totalStock,
            isDirty: false, // İşlem bittiği için veri artık temiz
            updatedAt: new Date()
        };

        await this.clientDB.getStatisticsModel().updateOne(
            { _id: "variant_stats" },
            { $set: finalStats },
            { upsert: true }
        );

        return finalStats;
    }

    /**
     * MongoDB Aggregate Facet özelliğini kullanarak tek seferde 
     * tüm platformların statü dağılımını hesaplayan ağır metod.
     */
    private async calculateFullAggregateStats(): Promise<any> {
        // 1. Aktif Platform Kodlarını Al (Entegrasyon ayarlarından)
        // Not: Burada getCachedClientIntegrations ihtiyacı duyulabilir, 
        // eğer CatalogOperations'tan bağımsız kurguluyorsak direkt DB'den çekiyoruz.
        const clientIntegrations = await this.clientDB.getClientIntegrationModel().findOne({}).lean();

        const integrations = [
            ...(clientIntegrations?.marketplace || []),
            ...(clientIntegrations?.ecommerce || []),
            ...(clientIntegrations?.erp || [])
        ];
        const platforms = integrations.map((item: any) => item.code);

        // 2. Facets (Dikey gruplama) Hazırla
        const facets: Record<string, any[]> = {};

        platforms.forEach(platform => {
            facets[platform] = [
                {
                    $group: {
                        _id: `$platforms.${platform}.upload.TRANSFER.status`,
                        count: { $sum: 1 },
                        onSaleCount: {
                            $sum: {
                                $cond: [{ $eq: [`$platforms.${platform}.upload.onSale`, true] }, 1, 0]
                            }
                        }
                    }
                }
            ];
        });

        // Toplam varyant ve stok değerlerini ayrıca grupla
        facets['totalValues'] = [
            {
                $group: {
                    _id: null,
                    totalVariants: { $sum: 1 },
                    totalStock: { $sum: '$stock' }
                }
            }
        ];

        // 3. Dev Aggregate sorgusunu çalıştır
        const rawResult = await this.clientDB.getVariantModel().aggregate([{ $facet: facets }]);
        const totalValues = rawResult[0].totalValues?.[0] || { totalVariants: 0, totalStock: 0 };

        // 4. Veriyi Normalize Et (Diziden anlamlı bir objeye dönüştür)
        const result = platforms.reduce((acc, platform) => {
            const platformData = rawResult[0][platform] || [];

            const platformCounts: Record<string, number> = {
                'SENT': 0,
                'WAITING': 0,
                'COMPLETED': 0,
                'FAILED': 0,
                'PENDING': 0,
                'ONSALECOUNT': 0
            };

            let assignedCount = 0;

            if (platformData.length > 0) {
                for (const item of platformData) {
                    // Mongoose aggregate null dönen statüleri yakalamak için kontrol
                    if (item._id && platformCounts.hasOwnProperty(item._id)) {
                        platformCounts[item._id] = item.count;
                        assignedCount += item.count;
                    }
                    platformCounts["ONSALECOUNT"] += (item.onSaleCount || 0);
                }
            }

            // PENDING = Toplam Varyant - (Platformda bir statüsü olanlar)
            platformCounts['PENDING'] = Math.max(0, totalValues.totalVariants - assignedCount);

            acc[platform] = platformCounts;
            return acc;
        }, {} as Record<string, any>);

        return {
            counts: result,
            totalVariants: totalValues.totalVariants,
            totalStock: totalValues.totalStock
        };
    }
}