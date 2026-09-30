// §9 sseParser: parça sınırında bölünmüş satırlar, \r\n, çok satırlı data, nabız yorumu, boş olay, 1 MB üstü red.
import { describe, expect, it } from 'vitest'
import { createSseParser, SseEventTooLargeError } from '../src/transport/sseParser'

describe('sseParser', () => {
  it('tek olay', () => {
    expect(createSseParser().push('event: part\ndata: {"a":1}\n\n')).toEqual([{ event: 'part', data: '{"a":1}' }])
  })
  it('parça sınırında bölünmüş satır ve olay birleşir', () => {
    const p = createSseParser()
    expect(p.push('event: pa')).toEqual([])
    expect(p.push('rt\ndata: {"a"')).toEqual([])
    expect(p.push(':1}\n')).toEqual([])
    expect(p.push('\n')).toEqual([{ event: 'part', data: '{"a":1}' }])
  })
  it('\\r\\n ve \\r satır sonları; parça sınırında bölünen \\r\\n tek satır sonu sayılır', () => {
    expect(createSseParser().push('event: x\r\ndata: 1\r\n\r\n')).toEqual([{ event: 'x', data: '1' }])
    expect(createSseParser().push('data: 2\r\r')).toEqual([{ event: 'message', data: '2' }])
    const p = createSseParser()
    expect(p.push('data: 3\r')).toEqual([])
    expect(p.push('\n\r\n')).toEqual([{ event: 'message', data: '3' }])
  })
  it('çok satırlı data \\n ile birleşir; baştaki tek boşluk atılır', () => {
    expect(createSseParser().push('data: a\ndata:b\ndata:  c\n\n')).toEqual([{ event: 'message', data: 'a\nb\n c' }])
  })
  it('nabız yorumu (":") ve id/retry yok sayılır', () => {
    const p = createSseParser()
    expect(p.push(': ping\n\n')).toEqual([])
    expect(p.push('id: 7\nretry: 100\n: x\ndata: ok\n\n')).toEqual([{ event: 'message', data: 'ok' }])
  })
  it('data taşımayan (boş/yalnız event) olay gönderilmez', () => {
    expect(createSseParser().push('\n\nevent: only\n\n')).toEqual([])
  })
  it('bir parçada birden çok olay', () => {
    const out = createSseParser().push('data: 1\n\ndata: 2\n\n')
    expect(out.map((f) => f.data)).toEqual(['1', '2'])
  })
  it('sonlandırıcı boş satır gelmeden biten olay gönderilmez', () => {
    const p = createSseParser()
    p.push('data: yarim\n')
    expect(p.end()).toEqual([])
  })
  it('1 MB üstü tek olay reddedilir (satır içi ve çok satırlı)', () => {
    const big = 'x'.repeat(1024 * 1024 + 10)
    expect(() => createSseParser().push(`data: ${big}`)).toThrow(SseEventTooLargeError)
    const p = createSseParser(100)
    expect(() => p.push(`data: ${'y'.repeat(60)}\ndata: ${'y'.repeat(60)}\n`)).toThrow(SseEventTooLargeError)
  })
  it('çok sayıda küçük olay 1 MB sınırına takılmaz', () => {
    const chunk = Array.from({ length: 2000 }, (_, i) => `data: ${'z'.repeat(600)}${i}\n\n`).join('')
    expect(createSseParser().push(chunk)).toHaveLength(2000)
  })
})
