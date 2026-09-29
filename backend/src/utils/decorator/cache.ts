import NodeCache from 'node-cache';

export const nodeCache = new NodeCache({ stdTTL: 300 }); // 5 dakika varsayılan TTL

// [DÜZELTME, BACKLOG C3 "@Cache sorgu/argüman körlüğü", 2026-09-29, orkestratör] Anahtar-sırasız (stable) JSON
// serileştirme: aynı içerikli nesne HANGİ sırayla kurulursa kurulsun (ör. {a:1,b:2} ile {b:2,a:1}) aynı anahtarı
// üretir, ama FARKLI içerikli nesneler artık FARKLI anahtar üretir (öncesinde `safeKeyPart` düz nesneleri hep
// `''`e daraltıyordu — bkz. aşağıdaki `stableStringify` çağrısı).
function stableStringify(value: any): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    // İç içe Date/ObjectId gibi değerler `Object.keys` ile `{}`e daralırdı (farklı tarih aralıkları çakışırdı);
    // toJSON'u olanlar (Date → ISO, ObjectId → hex) önce kendi JSON biçimine çevrilir.
    if (typeof value.toJSON === 'function') return stableStringify(value.toJSON());
    if (Array.isArray(value))return `[${value.map((v) => stableStringify(v)).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function safeKeyPart(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value._id) return `id:${value._id}`;
    if (value.id) return `id:${value.id}`;
    if (value.code) return `code:${value.code}`;
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        return value.toString();
    }
    // [DÜZELTME, BACKLOG C3, 2026-09-29] Önceden buraya düşen düz nesneler (id/_id/code/özel toString'i olmayan,
    // ör. bir sorgu/filtre nesnesi) `''`e daralıyordu — aynı tenant içinde bile FARKLI sorgu (tarih aralığı,
    // sayfa vb.) TTL süresince önbellekteki ESKİ sonucu döndürüyordu (gerçek bir doğruluk hatası). Artık düz
    // nesneler kararlı (sıralı-anahtar) JSON'a serileştirilir; boş nesne/dizi ({}/[]) davranışı (MEVCUT: '')
    // geriye dönük UYUMLULUK için KORUNDU.
    try {
        const json = stableStringify(value);
        return json === '{}' || json === '[]' ? '' : `q:${json}`;
    } catch {
        return '';
    }
}

export function Cache(ttlSeconds: number = 300, contextName: string = 'unknown-module', keyFn?: (that: any) => string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            /*             const cacheKey = `${propertyKey}-${JSON.stringify(args)}`; */
            /*             const cacheKey = `${propertyKey}-${safeKeyPart(args)}`; */

            const className = target.constructor.name;
            const keyParts = args.map(arg => safeKeyPart(arg)).join('|');
            const context = contextName ?? 'unknown-module'; // Kullanıcı belirtmezse fallback
            const extra = keyFn ? keyFn(this) : '';   // burada this var
            const cacheKey = `${context}.${className}.${propertyKey}-${extra}-${keyParts}`;
            /*             console.log(cacheKey) */
            // Önbellekte var mı kontrol et
            const cached = nodeCache.get(cacheKey);
            if (cached) {
                /*                 console.log(`[Cache] ${propertyKey} hit`); */
                return cached;
            }

            // Yoksa orijinal metodu çalıştır
            /*              console.log(`[Cache] ${propertyKey} miss`);  */
            const result = await originalMethod.apply(this, args);
            const isEmptyArray = Array.isArray(result) && result.length === 0;

            if (result && !isEmptyArray) {
                // Sonucu önbelleğe al
                nodeCache.set(cacheKey, result, ttlSeconds);
            }
            return result;
        };

        return descriptor;
    };
}
