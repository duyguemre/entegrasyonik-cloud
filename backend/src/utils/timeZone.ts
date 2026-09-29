/**
 * Saat dilimi yardımcıları (ADR-0021 D1 / PLATFORM_BASELINE C5, DATA_MODEL_CONVENTIONS §3).
 *
 * Kural: gün/ay sınırı hesapları sunucunun yerel saatine (konteynerde UTC) göre DEĞİL, platform saat
 * dilimine (Europe/Istanbul) göre yapılır. Aksi halde TR kullanıcısı için "bugün" 03:00'a kadar yanlış gündür.
 *
 * Yalnızca hesap yapar (Intl tabanlı; ek bağımlılık yok, DB/ağ yok). Döndürülen değerler her zaman
 * mutlak zaman anıdır (UTC epoch'lu `Date`); saklama biçimi (BSON Date) değişmez.
 */

/** Platform varsayılan saat dilimi (PLATFORM_BASELINE C5). Mongo `timezone` seçeneğine de bu değer verilir. */
export const PLATFORM_TIME_ZONE = 'Europe/Istanbul';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
    let f = formatterCache.get(timeZone);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        formatterCache.set(timeZone, f);
    }
    return f;
}

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number }

function zonedParts(date: Date, timeZone: string): ZonedParts {
    const out: any = {};
    for (const p of getFormatter(timeZone).formatToParts(date)) {
        if (p.type !== 'literal') out[p.type] = Number(p.value);
    }
    return out as ZonedParts;
}

/** `date` anında saat diliminin UTC'ye göre ofseti (ms; Istanbul = +3 sa = 10_800_000). */
function zoneOffsetMs(date: Date, timeZone: string): number {
    const p = zonedParts(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Saat diliminde (y, m, d) günü 00:00 anının mutlak zamanı. `d` taşabilir (Date.UTC normalize eder). */
function zonedMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
    const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    const off1 = zoneOffsetMs(new Date(naive), timeZone);
    let result = naive - off1;
    const off2 = zoneOffsetMs(new Date(result), timeZone); // DST geçiş günü düzeltmesi (TR'de sabit +03, genel doğruluk için)
    if (off2 !== off1) result = naive - off2;
    return new Date(result);
}

/** `date`'in düştüğü takvim gününün başlangıcı (saat diliminde 00:00:00.000). */
export function startOfDayInZone(date: Date, timeZone: string = PLATFORM_TIME_ZONE): Date {
    const p = zonedParts(date, timeZone);
    return zonedMidnightToUtc(p.year, p.month, p.day, timeZone);
}

/** `date`'in düştüğü takvim gününün son milisaniyesi (saat diliminde 23:59:59.999). */
export function endOfDayInZone(date: Date, timeZone: string = PLATFORM_TIME_ZONE): Date {
    const p = zonedParts(date, timeZone);
    return new Date(zonedMidnightToUtc(p.year, p.month, p.day + 1, timeZone).getTime() - 1);
}

/** `date`'in gününün başlangıcından `days` takvim günü sonrasının (negatif = önce) gün başlangıcı. */
export function addDaysInZone(date: Date, days: number, timeZone: string = PLATFORM_TIME_ZONE): Date {
    const p = zonedParts(date, timeZone);
    return zonedMidnightToUtc(p.year, p.month, p.day + days, timeZone);
}

/** 'YYYY-MM-DD' — `date`'in saat dilimindeki takvim günü anahtarı. */
export function dayKeyInZone(date: Date, timeZone: string = PLATFORM_TIME_ZONE): string {
    const p = zonedParts(date, timeZone);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
