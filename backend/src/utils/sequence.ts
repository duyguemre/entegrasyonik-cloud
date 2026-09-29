/**
 * Atomik sıralı sayaç (ADR-0021 D5, DATA_MODEL_CONVENTIONS §2: "Sıralı insan-okunur numaralar yalnız `Counters` +
 * atomik `$inc`; `Math.random`/`max+1` yasak").
 *
 * `Counters` belgesi: `{ _id: <ad>, sequence_value: <sayı> }`. `findOneAndUpdate(..., {$inc}, {upsert, new})` tek belge
 * üzerinde atomiktir; eşzamanlı çağıranlar farklı değer alır (çakışma/tekrar yok). Yalnızca çağıran modeli kullanır (DB
 * bağlantısı açmaz), bu yüzden mock'lu test edilebilir.
 */
export async function nextSequence(counterModel: any, name: string): Promise<number> {
    const doc = await counterModel.findOneAndUpdate(
        { _id: name },
        { $inc: { sequence_value: 1 } },
        { new: true, upsert: true }
    );
    const n = Number(doc && doc.sequence_value);
    if (!Number.isInteger(n) || n < 1) {
        throw new Error(`Sayaç geçersiz değer döndürdü: ${name}`);
    }
    return n;
}
