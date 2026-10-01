/**
 * Satır tabanlı SSE ayrıştırıcı (CHAT_UI_CONTRACT.md §3.1). `fetch` POST yanıtının gövdesi için yazıldı (EventSource
 * POST desteklemez). Kurallar (WHATWG "event stream" alt kümesi):
 *  - satır sonu `\n`, `\r\n` ya da `\r`; parça (chunk) sınırında bölünmüş satır/`\r\n` doğru birleşir,
 *  - `:` ile başlayan satır yorum/nabızdır → yok sayılır,
 *  - çok satırlı `data:` değerleri `\n` ile birleşir; boş satır olayı gönderir,
 *  - `data` taşımayan olay (yalnız `event:` ya da boş blok) gönderilmez,
 *  - `id:` / `retry:` yok sayılır (tur sürdürülemez; ADR-0034 Karar 5),
 *  - tek olay `maxEventBytes`'ı (varsayılan 1 MB) aşarsa `SseEventTooLargeError`.
 */

export interface SseFrame {
  event: string
  data: string
}

export class SseEventTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`SSE olayı ${limit} baytı aşıyor`)
    this.name = 'SseEventTooLargeError'
  }
}

export const DEFAULT_MAX_EVENT_BYTES = 1024 * 1024

export interface SseParser {
  /** Yeni metin parçasını işler; tamamlanan olayları döndürür. */
  push(chunk: string): SseFrame[]
  /** Akış bitti: yarım kalan olay GÖNDERİLMEZ (sonlandırıcı boş satır gelmedi). */
  end(): SseFrame[]
}

export function createSseParser(maxEventBytes: number = DEFAULT_MAX_EVENT_BYTES): SseParser {
  let buffer = ''
  let pendingCR = false
  let eventName = ''
  let dataLines: string[] = []
  let size = 0

  function reset() {
    eventName = ''
    dataLines = []
    size = 0
  }

  function dispatch(out: SseFrame[]) {
    if (dataLines.length > 0) out.push({ event: eventName || 'message', data: dataLines.join('\n') })
    reset()
  }

  function line(text: string, out: SseFrame[]) {
    if (text === '') return dispatch(out)
    if (text.startsWith(':')) return
    const colon = text.indexOf(':')
    const field = colon === -1 ? text : text.slice(0, colon)
    let value = colon === -1 ? '' : text.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value
    else if (field === 'data') {
      size += value.length + 1
      if (size > maxEventBytes) {
        reset()
        throw new SseEventTooLargeError(maxEventBytes)
      }
      dataLines.push(value)
    }
  }

  return {
    push(chunk: string) {
      const out: SseFrame[] = []
      let text = chunk
      // Önceki parça `\r` ile bittiyse ve bu parça `\n` ile başlıyorsa: tek satır sonu (`\r\n`).
      if (pendingCR && text.startsWith('\n')) text = text.slice(1)
      pendingCR = false
      buffer += text
      let start = 0
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i]
        if (ch !== '\n' && ch !== '\r') continue
        line(buffer.slice(start, i), out)
        if (ch === '\r') {
          if (i + 1 < buffer.length) {
            if (buffer[i + 1] === '\n') i++
          } else pendingCR = true
        }
        start = i + 1
      }
      buffer = buffer.slice(start)
      // Sonlanmamış tek satır sınırı aşıyorsa (satır sonu hiç gelmeyen dev olay) bellekte büyütülmez.
      if (buffer.length > maxEventBytes) {
        buffer = ''
        reset()
        throw new SseEventTooLargeError(maxEventBytes)
      }
      return out
    },
    end() {
      buffer = ''
      reset()
      return []
    },
  }
}
