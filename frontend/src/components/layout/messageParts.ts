/**
 * Onay diyaloğu (ConfirmationDialogComponent) mesajı için güvenli, DAR biçimlendirme modeli.
 *
 * NEDEN (docs/FRONTEND_CODE_AUDIT.md G-01, BR-32): diyalog mesajı eskiden `v-html` ile basılıyordu
 * ve çağıranlar müşteri adı / pazaryeri gerekçesi / sipariş no gibi dış kaynaklı değerleri HTML
 * dizesine düz interpolasyonla katıyordu -> depolanmış XSS. Artık `message` ya düz metindir
 * (`string`, her zaman metin olarak basılır) ya da aşağıdaki parça dizisidir; parçaların içeriği
 * (`text`) HER ZAMAN metin düğümü olarak render edilir, hiçbir zaman HTML olarak yorumlanmaz.
 *
 * Desteklenen biçimler bugün kullanılan üç işaretlemenin karşılığıdır: kalın ad (`<b>`),
 * satır sonu (`<br>`), küçük not (`<small>`). Başka biçim gerekirse buraya AÇIKÇA eklenir.
 */
export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'emphasis'; text: string }
  | { type: 'note'; text: string }
  | { type: 'break' }

/** Düz metin parçası. */
export const text = (value: unknown): MessagePart => ({ type: 'text', text: String(value ?? '') })
/** Vurgulu (kalın) parça — ör. müşteri adı, adet. */
export const emphasis = (value: unknown): MessagePart => ({ type: 'emphasis', text: String(value ?? '') })
/** Küçük yazılı not parçası. */
export const note = (value: unknown): MessagePart => ({ type: 'note', text: String(value ?? '') })
/** Satır sonu. */
export const lineBreak = (): MessagePart => ({ type: 'break' })

/** Erişilebilirlik/test için parçaların düz metin karşılığı (satır sonu -> `\n`). */
export function messagePartsToPlainText(parts: MessagePart[]): string {
  return parts.map((p) => (p.type === 'break' ? '\n' : p.text)).join('')
}
