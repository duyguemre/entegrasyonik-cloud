// PRC-CFG / PRC-R1: buybox tazeleme kuyruğu — SAF fonksiyonlar (DB/ağ yok). İki karar burada:
//  1) tenant içi: hangi barkodlar izlenir (SKU tavanı + öncelik politikası) ve hangileri şimdi vadesi gelmiş (tazeleme aralığı);
//  2) tenant'lar arası: kanal başına dakikalık çağrı bütçesi adil (round-robin) paylaştırılır; bütçe dolunca kalan ertelenir.
// Adalet: her turda her tenant'a sırayla BİR parti (≤10 barkod = 1 istek) verilir; başlangıç tenant'ı her turda kayar (aynı tenant
// sürekli ilk olmaz). Büyük tenant küçükleri aç bırakamaz: bütçe B, tenant sayısı T ise her tenant en az floor(B/T) parti alır.
import type { CompetitionPriority } from '@integration/config/catalog/pricing';

/** Trendyol buybox ucu istek başına en çok 10 barkod kabul eder (resmi doküman özeti; COMPETITION_PRICING §3). */
export const BUYBOX_BATCH_SIZE = 10;

export interface BuyboxCandidate {
    barcode: string;
    /** Eldeki stok (rezerv dahil); `stocked_only` ve `changed_first` sıralaması için. */
    stock: number;
    /** Son okuma denemesi (başarılı ya da bulunamadı). Hiç okunmadıysa null. */
    checkedAt: Date | null;
    /** Buybox durumunun son değiştiği an (sıra/fiyat/durum). */
    changedAt: Date | null;
}

const ts = (d: Date | null) => (d ? d.getTime() : Number.NEGATIVE_INFINITY);
/** "Yeni değişmiş" penceresi: son 24 saatte buybox'ı değişen SKU `changed_first` politikasında öne alınır. */
export const CHANGED_WINDOW_MS = 24 * 3600_000;

/**
 * Politika sırası (izlenen küme bu sıranın ilk `skuCap` elemanıdır). Kararlı: eşitlikte barkod sırası.
 *  - changed_first: son 24 sa'te değişmiş -> stoklu -> en eski okuma
 *  - stocked_only : yalnız stoklu; en eski okuma önce
 *  - oldest_first : en eski okuma önce
 */
export function orderCandidates(cands: readonly BuyboxCandidate[], policy: CompetitionPriority, now: Date): BuyboxCandidate[] {
    const nowMs = now.getTime();
    const list = policy === 'stocked_only' ? cands.filter((c) => c.stock > 0) : [...cands];
    const recent = (c: BuyboxCandidate) => (c.changedAt && nowMs - c.changedAt.getTime() <= CHANGED_WINDOW_MS ? 1 : 0);
    return list.sort((a, b) => {
        if (policy === 'changed_first') {
            const r = recent(b) - recent(a); if (r) return r;
            const s = (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0); if (s) return s;
        }
        const o = ts(a.checkedAt) - ts(b.checkedAt); if (o) return o;
        return a.barcode < b.barcode ? -1 : a.barcode > b.barcode ? 1 : 0;
    });
}

export interface DueSelection {
    /** Vadesi gelmiş barkodlar (öncelik sırasıyla). */
    due: string[];
    /** İzlenen (tavan içindeki) barkod sayısı. */
    tracked: number;
    /** Tavan nedeniyle izlenmeyen aday sayısı. */
    overCap: number;
}

/** Tavan + vade: izlenen küme = politika sırasının ilk `skuCap`'i; vadeli = hiç okunmamış ya da `refreshMin`'den eski. */
export function selectDue(cands: readonly BuyboxCandidate[], s: { skuCap: number; refreshMin: number; priority: CompetitionPriority }, now: Date): DueSelection {
    if (s.skuCap <= 0) return { due: [], tracked: 0, overCap: cands.length };
    const ordered = orderCandidates(cands, s.priority, now);
    const tracked = ordered.slice(0, s.skuCap);
    const cutoff = now.getTime() - s.refreshMin * 60_000;
    return {
        due: tracked.filter((c) => !c.checkedAt || c.checkedAt.getTime() <= cutoff).map((c) => c.barcode),
        tracked: tracked.length,
        overCap: Math.max(0, cands.length - tracked.length),
    };
}

export function chunk<T>(arr: readonly T[], size: number = BUYBOX_BATCH_SIZE): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

export interface TenantQueue { tid: number; barcodes: string[] }
export interface PlannedCall { tid: number; barcodes: string[] }
export interface FairPlan {
    calls: PlannedCall[];
    /** Bütçe nedeniyle bu turda okunamayan barkod sayısı (tenant başına). */
    deferred: Map<number, number>;
    /** Bir sonraki turun başlangıç indeksi (dönen başlangıç). */
    nextStart: number;
}

/**
 * Bütçeyi (istek sayısı) tenant'lar arasında round-robin paylaştırır. `start`: bu turda ilk sıradaki tenant'ın indeksi
 * (tid'e göre sıralı listede). Bütçe 0 ise hiçbir çağrı planlanmaz, tüm vadeli barkodlar ertelenir.
 */
export function allocateFair(queues: readonly TenantQueue[], budgetCalls: number, start = 0): FairPlan {
    const sorted = [...queues].filter((q) => q.barcodes.length > 0).sort((a, b) => a.tid - b.tid);
    const n = sorted.length;
    const batches = sorted.map((q) => chunk(q.barcodes));
    const cursor = sorted.map(() => 0);
    const calls: PlannedCall[] = [];
    let budget = Math.max(0, Math.floor(budgetCalls));
    const offset = n > 0 ? ((start % n) + n) % n : 0;
    let progressed = true;
    while (budget > 0 && progressed) {
        progressed = false;
        for (let k = 0; k < n && budget > 0; k++) {
            const i = (offset + k) % n;
            if (cursor[i] >= batches[i].length) continue;
            calls.push({ tid: sorted[i].tid, barcodes: batches[i][cursor[i]] });
            cursor[i]++;
            budget--;
            progressed = true;
        }
    }
    const deferred = new Map<number, number>();
    sorted.forEach((q, i) => {
        const left = batches[i].slice(cursor[i]).reduce((a, b) => a + b.length, 0);
        if (left > 0) deferred.set(q.tid, left);
    });
    return { calls, deferred, nextStart: n > 0 ? (offset + 1) % n : 0 };
}
