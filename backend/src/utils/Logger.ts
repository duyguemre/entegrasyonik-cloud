export type LoggerType =
    | 'Order Fetcher'
    | 'Catalog Dispatcher'
    | 'Catalog Validator'
    | 'Catalog Publisher'
    | 'Catalog Sentinel'
    | 'Catalog Synchronizer'
    | 'OrderFetcher'
    | 'IntegrationService'
    | 'IntegrationFactory'
    | 'Catalog Importer'
    | 'Catalog Stager'
    | 'Order Repository'
    | 'Customer Repository'
    | 'Claim Repository'
    | 'Invoice Repository'
    | 'Message Repository'
    | 'Financial Repository'
    | 'Database';

export const getColoredPrefix = (type: LoggerType, customLabel?: string): string => {
    // Sadece standart 16-Renk Paleti kullanıldı
    const colors: Record<LoggerType, string> = {
        // --- REPO & VERİTABANI İŞLEMLERİ ---
        "Database": "\x1b[31m",               // Kırmızı (Kritik İşlemler)
        "Order Repository": "\x1b[34m",       // Mavi 
        "Customer Repository": "\x1b[35m",    // Macenta (Mor)
        "Claim Repository": "\x1b[36m",       // Siyan (Turkuaz)
        "Invoice Repository": "\x1b[32m",     // Yeşil
        "Message Repository": "\x1b[32m",     // Yeşil
        "Financial Repository": "\x1b[32m",   // Yeşil
        // --- ENTEGRASYON & SİPARİŞ ÇEKİMİ ---
        "Order Fetcher": "\x1b[33m",          // Sarı (Genel Çekim)
        "OrderFetcher": "\x1b[92m",           // Parlak Yeşil (Aksiyon/Para akışı)
        "IntegrationFactory": "\x1b[94m",     // Parlak Mavi (Kurulum)
        "IntegrationService": "\x1b[96m",     // Parlak Siyan (Servis İşlemleri)

        // --- KATALOG İŞLEMLERİ ---
        "Catalog Validator": "\x1b[91m",      // Parlak Kırmızı (Hata Kontrol/Doğrulama)
        "Catalog Dispatcher": "\x1b[95m",     // Parlak Macenta (Dağıtım)
        "Catalog Publisher": "\x1b[93m",      // Parlak Sarı (Yayına Alma)
        "Catalog Sentinel": "\x1b[32m",       // Yeşil (Takip/Bekçi)
        "Catalog Synchronizer": "\x1b[37m",   // Beyaz (Genel Eşitleme)
        "Catalog Stager": "\x1b[90m",         // Parlak Siyah / Gri (Hazırlık)
        "Catalog Importer": "\x1b[97m",       // Parlak Beyaz (Temiz İçe Aktarım)
    };

    const reset = "\x1b[0m";
    const bold = "\x1b[1m";

    const displayText = customLabel || type;

    return `${colors[type]}${bold}[${displayText}]${reset}`;
};

export const getLogPrefix = (workerName: LoggerType, clientId: number | string, integrationCode: string = ''): string => {
    const parts = [
        clientId ? `Client ${clientId}` : '',
        integrationCode ? integrationCode : '',
        workerName
    ].filter(Boolean);

    const dynamicLabel = parts.join(' - ');

    // Rengi workerName'den al, metin olarak dynamicLabel'ı bas
    return getColoredPrefix(workerName, dynamicLabel);
}