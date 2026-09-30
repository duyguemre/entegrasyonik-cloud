// WP11 (faz4-int): yerel Choice/Value/Category silinince `AttributeMappings`'te kalan yetim referansların temizliği
// (ATTRIBUTE_MAPPING_REVIEW P1-5) ve platform kategorisi değişince bayat özellik eşlemelerinin temizliği (P1-4).
// SAF: yalnız verilen mongoose modelini (tenant `clientDB.getAttributeMappingModel()`) kullanır; DB bağlantısı kurmaz.
// Tüm işlemler İDEMPOTENT (aynı koşul tekrar çalışınca 0 etkiler) -> silme yarım kalırsa aynı çağrı tekrarlanarak iyileşir.
import { ObjectId } from 'mongodb';

type Model = { updateMany: (f: any, u: any) => Promise<any>; deleteMany: (f: any) => Promise<any> };
const count = (r: any, key: 'modifiedCount' | 'deletedCount'): number => Number(r?.[key] ?? 0);

/**
 * Silinen seçenek (Choice): bu seçeneğe bağlı özellik eşlemelerinin bağı KOPARILIR (`localChoiceId=null`, `values=[]`).
 * Kayıt silinmez: platform özelliği meta verisi (isRequired/varianter) Stager doğrulaması için kalır, ama "eşli" sayılmaz.
 */
export async function detachChoiceFromMappings(model: Model, choiceId: string): Promise<number> {
    const r = await model.updateMany(
        { localChoiceId: new ObjectId(choiceId), isCategoryMapping: { $ne: true } },
        { $set: { localChoiceId: null, values: [], updatedAt: new Date() } },
    );
    return count(r, 'modifiedCount');
}

/** Silinen seçenek değeri: hiçbir eşlemede `values[].localValueId` olarak kalmaz. */
export async function pullValueFromMappings(model: Model, valueId: string): Promise<number> {
    const vid = new ObjectId(valueId);
    const r = await model.updateMany(
        { 'values.localValueId': vid },
        { $pull: { values: { localValueId: vid } }, $set: { updatedAt: new Date() } },
    );
    return count(r, 'modifiedCount');
}

/** Silinen yerel kategori: tüm entegrasyonlardaki kategori + özellik eşlemeleri silinir (`localCategoryId` zorunlu alandır; yetim kayıt anlamsızdır). */
export async function deleteMappingsOfCategory(model: Model, categoryId: string): Promise<number> {
    const r = await model.deleteMany({ localCategoryId: new ObjectId(categoryId) });
    return count(r, 'deletedCount');
}

/** Yerel kategorinin platform kategorisi değişti: yeni platform kategorisine ait OLMAYAN özellik eşlemeleri silinir (kategori kaydı kalır). */
export async function deleteStaleAttributeMappings(model: Model, localCategoryId: string, integrationCode: string, platformCategoryId: string): Promise<number> {
    const r = await model.deleteMany({
        localCategoryId: new ObjectId(localCategoryId),
        integrationCode,
        platformAttributeId: { $ne: null },
        platformCategoryId: { $ne: String(platformCategoryId) },
    });
    return count(r, 'deletedCount');
}
