// Test yardımcısı: yalnızca tenant-yüzü testlerinin ihtiyaç duyduğu Mongo aggregate alt kümesi (bellek-içi). DB YOK.
//   $match (eşitlik, $gte/$lte/$in/$ne, $exists), $sort (tek/çok alan), $group (_id: null | '$alan' | {a:'$x'}; $sum: 1|'$alan', $first),
//   $unwind ('$yol'), $project (yalnızca 1 alanları), $limit, $count.
const get = (o: any, p: string): any => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

function matchValue(actual: any, exp: any): boolean {
  if (exp && typeof exp === 'object' && !Array.isArray(exp) && !(exp instanceof Date) && Object.keys(exp).some((k) => k.startsWith('$'))) {
    return Object.entries(exp).every(([op, v]: [string, any]) => {
      if (op === '$gte') return actual !== undefined && actual >= v;
      if (op === '$lte') return actual !== undefined && actual <= v;
      if (op === '$in') return Array.isArray(v) && v.includes(actual);
      if (op === '$ne') return actual !== v;
      if (op === '$exists') return (actual !== undefined) === !!v;
      if (op === '$elemMatch') return Array.isArray(actual) && actual.some((el) => matchDoc(el, v));
      if (op === '$gt') return actual !== undefined && actual > v;
      throw new Error('miniAggregate: desteklenmeyen operatör ' + op);
    });
  }
  return actual === exp;
}
export const matchDoc = (doc: any, m: any): boolean => Object.entries(m).every(([k, v]) => matchValue(get(doc, k), v));

export function aggregate(docs: any[], pipeline: any[]): any[] {
  let rows = docs.map((d) => JSON.parse(JSON.stringify(d), (_k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v)));
  for (const stage of pipeline) {
    if (stage.$match) rows = rows.filter((r) => matchDoc(r, stage.$match));
    else if (stage.$sort) {
      const entries = Object.entries(stage.$sort) as [string, number][];
      rows = [...rows].sort((a, b) => { for (const [k, dir] of entries) { const x = get(a, k), y = get(b, k); if (x < y) return -dir; if (x > y) return dir; } return 0; });
    } else if (stage.$unwind) {
      const p = String(stage.$unwind).replace(/^\$/, '');
      rows = rows.flatMap((r) => (get(r, p) || []).map((x: any) => ({ ...r, [p]: x })));
    } else if (stage.$limit) rows = rows.slice(0, stage.$limit);
    else if (stage.$count) rows = [{ [stage.$count]: rows.length }];
    else if (stage.$project) {
      rows = rows.map((r) => {
        const o: any = {};
        if (r._id !== undefined) o._id = r._id; // Mongo $project _id'yi varsayılan olarak korur
        for (const [k, v] of Object.entries(stage.$project)) {
          if (v !== 1) continue;
          const val = get(r, k);
          if (val === undefined) continue;
          const parts = k.split('.'); let t = o;
          for (let i = 0; i < parts.length - 1; i++) { t[parts[i]] = t[parts[i]] ?? {}; t = t[parts[i]]; }
          t[parts[parts.length - 1]] = val;
        }
        return o;
      });
    } else if (stage.$group) {
      const g = stage.$group;
      const keyOf = (r: any): any => {
        const spec = g._id;
        if (spec === null) return null;
        if (typeof spec === 'string') return get(r, spec.replace(/^\$/, ''));
        return Object.fromEntries(Object.entries(spec).map(([k, v]: [string, any]) => [k, get(r, String(v).replace(/^\$/, ''))]));
      };
      const groups = new Map<string, { key: any; rows: any[] }>();
      for (const r of rows) {
        const key = keyOf(r); const id = JSON.stringify(key);
        if (!groups.has(id)) groups.set(id, { key, rows: [] });
        groups.get(id)!.rows.push(r);
      }
      rows = [...groups.values()].map(({ key, rows: rs }) => {
        const out: any = { _id: key };
        for (const [f, spec] of Object.entries(g) as [string, any][]) {
          if (f === '_id') continue;
          if (spec.$sum !== undefined) out[f] = rs.reduce((s, r) => s + (spec.$sum === 1 ? 1 : Number(get(r, String(spec.$sum).replace(/^\$/, ''))) || 0), 0);
          else if (spec.$first !== undefined) out[f] = get(rs[0], String(spec.$first).replace(/^\$/, ''));
          else throw new Error('miniAggregate: desteklenmeyen $group alanı ' + f);
        }
        return out;
      });
    } else throw new Error('miniAggregate: desteklenmeyen aşama ' + Object.keys(stage)[0]);
  }
  return rows;
}
