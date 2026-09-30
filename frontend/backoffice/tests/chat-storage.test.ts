// CHAT-FE-3 (CHAT_UI_CONTRACT §7.2): backoffice sohbeti müşteri sohbetinden İZOLE — ayrı taşıyıcı (/admin-api/agent),
// ayrı depolama öneki (bo:), ayrı mock bayrağı; depoya yalnız { open, width }. Bağlantılar yalnız backoffice rotalarına.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMockTransport } from '@entegrasyonik/chat/transports/mock'
import { BO_CHAT_PREFIX, prefsKey, readPrefs, writePrefs } from '../src/chat/prefs'
import { agentBaseUrl, withReadOnly } from '../src/chat/transport'
import { boLinkForEntity, resolveBoLink } from '../src/chat/boChatHost'
import { prefsKey as webPrefsKey } from '../../src/chat/placement'

const CHAT_DIR = join(__dirname, '..', 'src', 'chat')
/** Yorumlar hariç kod (belgeleme web anahtarını karşılaştırma için anabilir). */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '')
const chatSources = readdirSync(CHAT_DIR).map((f) => code(readFileSync(join(CHAT_DIR, f), 'utf8')))

function memoryStorage() {
  const data = new Map<string, string>()
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('depolama izolasyonu', () => {
  it('backoffice anahtarı bo:chat:<sub>; web anahtarı ek:chat:<u>:<t> — kesişmez', () => {
    const bo = prefsKey('64b000000000000000000001')!
    const web = webPrefsKey({ userId: '64b000000000000000000001', tenantId: 7 })!
    expect(bo.startsWith(BO_CHAT_PREFIX)).toBe(true)
    expect(bo.startsWith('bo:')).toBe(true)
    expect(web.startsWith('ek:chat:')).toBe(true)
    expect(bo).not.toBe(web)
    expect(prefsKey(undefined)).toBeNull()
  })

  it('yalnız { open, width } yazılır; genişlik 360–560 kıskaçlı; bozuk kayıt varsayılana düşer', () => {
    const s = memoryStorage()
    const key = prefsKey('sub-1')
    writePrefs(key, { open: true, width: 9999, text: 'gizli', apiKey: 'sk-xxx' } as never, s)
    expect(JSON.parse(s.data.get(key!)!)).toEqual({ open: true, width: 560 })
    expect(readPrefs(key, s)).toEqual({ open: true, width: 560 })
    s.data.set(key!, '{bozuk')
    expect(readPrefs(key, s)).toEqual({ open: false, width: 400 })
    expect([...s.data.keys()].every((k) => k.startsWith('bo:'))).toBe(true)
  })

  it('backoffice sohbet kodu müşteri anahtarlarına/bayraklarına/uçlarına dokunmaz; depoya yalnız prefs.ts yazar', () => {
    for (const src of chatSources) {
      expect(src).not.toMatch(/ek:chat|ek-chat-mock|__EK_CHAT_MOCK__|['"`]\/api\/agent/)
    }
    const writers = readdirSync(CHAT_DIR).filter((f) => /localStorage|sessionStorage/.test(code(readFileSync(join(CHAT_DIR, f), 'utf8'))))
    expect(writers).toEqual(['prefs.ts'])
  })
})

describe('taşıyıcı', () => {
  it('temel adres /admin-api/agent (çerez EK_ADMIN); sondaki eğik çizgi temizlenir', () => {
    expect(agentBaseUrl('/admin-api')).toBe('/admin-api/agent')
    expect(agentBaseUrl('https://admin.example.invalid/admin-api/')).toBe('https://admin.example.invalid/admin-api/agent')
  })
  it('v1 salt okuma: info.readOnly her zaman true (rozet)', async () => {
    const t = withReadOnly(createMockTransport({ config: 'enabled', speed: 0 }))
    const info = await t.info()
    expect(info.readOnly).toBe(true)
  })
})

describe('host bağlantıları (yalnız backoffice rotaları)', () => {
  it('tenant → müşteri detayı; kayıtlı ekran → yolu; planlı/bilinmeyen → null; güvensiz parametre atılır', () => {
    expect(resolveBoLink({ screen: 'tenant', params: { tid: '7' } })).toEqual({ path: '/musteriler/7', query: {} })
    expect(resolveBoLink({ screen: 'tenant', params: { tid: 'x' } })).toBeNull()
    expect(resolveBoLink({ screen: 'engine', params: { sekme: 'basarisiz', q: '<script>' } })).toEqual({ path: '/motor', query: { sekme: 'basarisiz' } })
    expect(resolveBoLink({ screen: 'lifecycle' })).toBeNull()
    expect(resolveBoLink({ screen: 'orders' })).toBeNull()
  })
  it('varlık: tenant / platformJob / logEvent; müşteri iş varlıkları (sipariş vb.) bağlanmaz', () => {
    expect(boLinkForEntity({ type: 'tenant', id: '102', label: 'Örnek' })).toEqual({ screen: 'tenant', params: { tid: '102' } })
    expect(boLinkForEntity({ type: 'platformJob', id: 'j-1', label: 'iş' })).toEqual({ screen: 'engine', params: { sekme: 'basarisiz' } })
    expect(boLinkForEntity({ type: 'logEvent', id: 'req-abc123', label: 'log' })).toEqual({ screen: 'logs', params: { reqId: 'req-abc123' } })
    expect(boLinkForEntity({ type: 'order', id: 'O-1', label: 'sipariş' })).toBeNull()
  })
})
