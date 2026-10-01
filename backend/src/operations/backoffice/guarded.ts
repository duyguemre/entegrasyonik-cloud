// K51: bölüm başına zaman aşımı + degraded deseni (`overviewOps.getHealth` ile aynı mantık; orada yerel kopya kalır, o dosya dokunulmadı).
// Bir bölüm `ms` içinde bitmezse ya da hata verirse `{ ok:false, error }` döner; çağıran uç düşmez. Zamanlayıcı süreci tutmaz (unref).
export const SECTION_TIMEOUT_MS = 2000;
export type SectionError = 'timeout' | 'error';
export type Guarded<T> = { ok: true; value: T } | { ok: false; error: SectionError };

export async function guard<T>(ms: number, fn: () => Promise<T>): Promise<Guarded<T>> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), ms); (timer as any).unref?.(); });
    try {
        const r = await Promise.race([fn().then((value) => ({ value })), timeout]);
        return r === 'timeout' ? { ok: false, error: 'timeout' } : { ok: true, value: r.value };
    } catch {
        return { ok: false, error: 'error' };
    } finally {
        if (timer) clearTimeout(timer);
    }
}
