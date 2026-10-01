// ADR-0034 BR-2: `pii:'masked'` yeteneklerin projeksiyonunda kullanilan SAF yardimcilar. Ham kisi verisi (ad, telefon, adres) LLM'e ve
// sohbet tablosuna cikmaz; liste gorunumunde "A*** Y***" gibi bas harf + yildiz yeterlidir (ayrinti icin ekranda ac baglantisi).

/** "Ayse" -> "A***"; bos/gecersiz -> ''. */
export function maskWord(word: unknown): string {
    const s = typeof word === 'string' ? word.trim() : '';
    if (!s) return '';
    return `${Array.from(s)[0].toLocaleUpperCase('tr')}***`;
}

/** Ad + soyad -> "A*** Y***" (yalniz biri varsa o). */
export function maskPerson(first: unknown, last: unknown): string {
    return [maskWord(first), maskWord(last)].filter(Boolean).join(' ');
}

/** Tarih/ISO girdisi -> ISO metin; gecersiz -> null. */
export function toIso(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    const d = v instanceof Date ? v : new Date(v as string | number);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
