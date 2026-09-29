import NodeCache from 'node-cache';

export const nodeCache = new NodeCache({ stdTTL: 300 }); // 5 dakika varsayılan TTL

function safeKeyPart(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value._id) return `id:${value._id}`;
    if (value.id) return `id:${value.id}`;
    if (value.code) return `code:${value.code}`;
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        return value.toString();
    }
    return '';
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
