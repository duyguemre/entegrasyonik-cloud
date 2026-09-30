import { ADAPTER_KEYS } from '../modules/adapterKeys';
// ADR-0018 Aşama A — BİLİNÇLİ OLARAK bağımsız (SIFIR içe aktarım) statik eşleme. `ContractGuard.ts`'in
// `IntegrationDescriptorRegistry`'yi (ve dolayısıyla TÜM adaptör `descriptor.ts`/`limits.ts` dosyalarını,
// ki onlar `ResilientHttpClient`'ı içe aktarır) İÇE AKTARMASI, `ResilientHttpClient -> ContractGuard ->
// IntegrationDescriptorRegistry -> descriptor.ts -> limits.ts -> ResilientHttpClient` DÖNGÜSEL
// bağımlılığı oluşturur (dependency-cruiser `no-circular` ile doğrulandı, tsPreCompilationDeps:true altında
// `import type` bile İZLENİR). Bu dosya döngüyü KIRAR: yalnız veri, hiçbir modülü içe aktarmaz.
// Doğruluk kontrolü: `tests/contract/catalog/codeToCategory.consistency.test.ts` bu haritayı
// `IntegrationDescriptorRegistry`'nin GERÇEK kategorileriyle karşılaştırır (o test döngüye GİRMEZ, çünkü
// test dosyaları çalışma-zamanı modül grafiğinin parçası değildir).
// ADR-0033 INT-02: `adapterKeys.ts` (saf veri, SIFIR içe aktarım) tablosundan türer; döngü riski yok.
export const INTEGRATION_CODE_CATEGORY: Readonly<Record<string, string>> = Object.fromEntries(ADAPTER_KEYS.map(k => [k.code, k.category]));

/** Bilinmeyen kod için 'marketplace' varsayılanına düşer (yalnız bilgi amaçlı alan; erişim/karar için kullanılmaz). */
export function categoryOfIntegrationCode(code: string): string {
    return INTEGRATION_CODE_CATEGORY[code] ?? 'marketplace';
}
