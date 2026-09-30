// ADR-0029 Karar 4/5 (NB5): ozet zamani ve sessiz saat hesabi (saf; Intl ile saat dilimi, harici kutuphane yok).
export const DEFAULT_TZ = 'Europe/Istanbul';
export interface DigestPref { cadence: 'hourly' | 'daily'; hourLocal: number }
export interface QuietHours { start: string; end: string; tz: string }

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeDigest(raw: unknown): DigestPref {
    const r = (raw ?? {}) as { cadence?: unknown; hourLocal?: unknown };
    const cadence = r.cadence === 'hourly' ? 'hourly' : 'daily';
    const h = typeof r.hourLocal === 'number' && Number.isInteger(r.hourLocal) && r.hourLocal >= 0 && r.hourLocal <= 23 ? r.hourLocal : 9;
    return { cadence, hourLocal: h };
}

function validTz(tz: unknown): string {
    if (typeof tz !== 'string') return DEFAULT_TZ;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

export function normalizeQuiet(raw: unknown): QuietHours | undefined {
    const r = raw as { start?: unknown; end?: unknown; tz?: unknown } | null | undefined;
    if (!r || typeof r.start !== 'string' || typeof r.end !== 'string' || !HHMM.test(r.start) || !HHMM.test(r.end) || r.start === r.end) return undefined;
    return { start: r.start, end: r.end, tz: validTz(r.tz) };
}

function parts(d: Date, tz: string) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    const o: Record<string, number> = {};
    for (const p of f.formatToParts(d)) if (p.type !== 'literal') o[p.type] = Number(p.value);
    return { y: o.year, mo: o.month, d: o.day, h: o.hour, mi: o.minute };
}

/** Yerel saat (tz) -> UTC anlik. DST kenarinda bir rafine adim. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
    const naive = Date.UTC(y, mo - 1, d, h, mi);
    const off = (t: number) => { const p = parts(new Date(t), tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - t; };
    const first = naive - off(naive);
    return new Date(naive - off(first));
}

/** `after` ANINDAN SONRAKI ilk ozet zamani: saatlik = sonraki tam saat; gunluk = sonraki `hourLocal:00` (yerel). */
export function nextDigestAt(after: Date, pref: DigestPref, tz = DEFAULT_TZ): Date {
    if (pref.cadence === 'hourly') return new Date((Math.floor(after.getTime() / 3_600_000) + 1) * 3_600_000);
    const p = parts(after, tz);
    let c = zonedToUtc(p.y, p.mo, p.d, pref.hourLocal, 0, tz);
    if (c.getTime() <= after.getTime()) {
        const next = new Date(Date.UTC(p.y, p.mo - 1, p.d + 1));
        c = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), pref.hourLocal, 0, tz);
    }
    return c;
}

/** `now` sessiz saat araligindaysa bitis anini, degilse undefined. Gece yarisini asan aralik (22:00-08:00) desteklenir. */
export function quietUntil(now: Date, q: QuietHours | undefined): Date | undefined {
    if (!q) return undefined;
    const [sh, sm] = q.start.split(':').map(Number); const [eh, em] = q.end.split(':').map(Number);
    const s = sh * 60 + sm; const e = eh * 60 + em;
    const p = parts(now, q.tz); const m = p.h * 60 + p.mi;
    const inside = s < e ? m >= s && m < e : m >= s || m < e;
    if (!inside) return undefined;
    // Bitis: bugun (yerel) e:00 ; aralik geceyi asiyor ve simdi baslangictan sonraysa yarin.
    const dayOffset = s > e && m >= s ? 1 : 0;
    const base = new Date(Date.UTC(p.y, p.mo - 1, p.d + dayOffset));
    return zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), eh, em, q.tz);
}
