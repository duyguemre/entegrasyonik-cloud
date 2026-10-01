// MCP-6 (ADR-0035) — sözleşme şekli ve statik güvenlik kuralları (MCP_UI_CONTRACT §4, §7, §8).
//  1. `src/types/McpTypes.ts` ↔ sözleşme §4 kod bloğu: arayüz adları + alan adları birebir (belge kanonik).
//  2. Hata kodu listesi ↔ sözleşme §4 "Hata kodları" satırı.
//  3. Her mock senaryosu (§7 adları eksiksiz) çalışma anında §4 şekline uyar (tip denetimine ek savunma).
//  4. Statik: S1'de yönlendirme yalnız `redirectTo` ile; MCP dosyalarında `v-html` = 0; mock yalnız DEV dalında.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MCP_ERROR_CODES } from '../src/types/McpTypes'
import { MCP_MOCK_SCENARIOS, MCP_MOCK_SCENARIO_NAMES, mcpEndpointOf, resolveMcpMock, type McpEndpoint } from '../src/mocks/mcp'

const ROOT = resolve(__dirname, '..')
// Windows çalışma kopyasında CRLF olabilir; desenler LF bekler.
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const CONTRACT = readFileSync(resolve(ROOT, '../docs/cloud-contracts/MCP_UI_CONTRACT.md'), 'utf8').replace(/\r\n/g, '\n')
const TYPES = read('src/types/McpTypes.ts')

/** `interface X { ... }` blokları → üst düzey alan adları (iç içe `{}` derinliği izlenir; yorumlar atılır). */
function interfaces(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const re = /interface\s+(\w+)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    let depth = 1
    let i = re.lastIndex
    let body = ''
    while (i < clean.length && depth > 0) {
      const ch = clean[i++]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        body += ' '
      } else if (depth === 1) body += ch
    }
    // Yalnız derinlik-1 metni kaldı; alanlar `ad?:` / `ad:` biçiminde.
    const fields = [...body.matchAll(/(?:^|[;\n{,]\s*)(\w+)\??\s*:/g)].map((x) => x[1])
    out[m[1]] = [...new Set(fields)].sort()
  }
  return out
}

function contractTsBlock(): string {
  const start = CONTRACT.indexOf('## 4.')
  const block = CONTRACT.slice(start).match(/```ts\n([\s\S]*?)```/)
  if (!block) throw new Error('Sözleşme §4 ts bloğu bulunamadı')
  return block[1]
}

describe('McpTypes ↔ MCP_UI_CONTRACT §4 (belge kanonik)', () => {
  const contract = interfaces(contractTsBlock())
  const ours = interfaces(TYPES)

  it('sözleşmedeki her arayüz aynı alan kümesiyle tanımlı', () => {
    expect(Object.keys(contract).length).toBeGreaterThanOrEqual(9)
    // Ayrıştırıcının kendisi boş küme üretmesin (sahte yeşil koruması).
    expect(contract.ConsentRequest).toEqual(['client', 'expiresAt', 'id', 'notice', 'requestedScopes', 'state', 'tenants'])
    expect(contract.McpSettings).toContain('consentOutdated')
    for (const [name, fields] of Object.entries(contract)) {
      expect(ours[name], `${name} McpTypes.ts'de yok`).toBeDefined()
      expect(ours[name], name).toEqual(fields)
    }
  })

  it('ConsentRequest.tenants satırı (ayrı ConsentTenant arayüzü) sözleşmedeki satır içi tiple aynı alanlar', () => {
    const tenantsLine = contractTsBlock().match(/tenants:\s*Array<\{([\s\S]*?)\}>/)
    expect(tenantsLine).toBeTruthy()
    const fields = [...tenantsLine![1].matchAll(/(\w+)\??\s*:/g)].map((x) => x[1]).sort()
    expect(ours.ConsentTenant).toEqual(fields)
  })

  it('hata kodları §4 listesiyle birebir', () => {
    const line = CONTRACT.split('\n').find((l) => l.startsWith('Hata kodları'))!
    const codes = [...line.matchAll(/`([A-Z_]+)`/g)].map((x) => x[1])
    expect([...MCP_ERROR_CODES].sort()).toEqual(codes.sort())
  })

  it('rota tablosu (§1) — S1/S2 router, S3/S4 screens.ts', () => {
    const router = read('src/router/index.ts')
    const screens = read('src/navigation/screens.ts')
    expect(router).toMatch(/path: 'oauth\/consent'/)
    expect(router).toMatch(/path: 'approve\/:id'/)
    expect(screens).toMatch(/slug: 'account\/connected-apps'/)
    expect(screens).toMatch(/slug: 'settings\/ai-connection'/)
  })
})

// ── Mock senaryoları ─────────────────────────────────────────────────────────────────────────────────────────

const SCOPES = ['mcp:read', 'mcp:write']
const ACCESS = ['off', 'read', 'readwrite']
const STATUSES = ['pending', 'executed', 'failed', 'unknown_outcome', 'rejected', 'expired']
const isIso = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const isStr = (v: unknown) => typeof v === 'string' && v.length > 0

function checkApproval(v: any) {
  expect(isStr(v.id)).toBe(true)
  expect(STATUSES).toContain(v.status)
  expect(isStr(v.client?.name)).toBe(true)
  expect(isStr(v.capability?.id) && isStr(v.capability?.title)).toBe(true)
  expect(typeof v.external).toBe('boolean')
  expect(isStr(v.preview?.title) && isStr(v.preview?.confirmLabel)).toBe(true)
  expect(Array.isArray(v.preview.lines)).toBe(true)
  expect(v.preview.lines.length).toBeLessThanOrEqual(20)
  for (const l of v.preview.lines) {
    expect(typeof l).toBe('string')
    expect(l.length).toBeLessThanOrEqual(200)
    expect(l).not.toMatch(/<[a-z!/]/i) // düz metin
  }
  expect(isIso(v.expiresAt)).toBe(true)
}

function checkConnection(c: any, scope: 'me' | 'tenant') {
  expect(isStr(c.id) && isStr(c.clientName) && isStr(c.redirectHost)).toBe(true)
  expect(typeof c.known).toBe('boolean')
  expect(typeof c.tenant?.tid).toBe('number')
  for (const s of c.scopes) expect(SCOPES).toContain(s)
  expect(isIso(c.createdAt) && isIso(c.expiresAt)).toBe(true)
  expect(c.lastUsedAt === null || isIso(c.lastUsedAt)).toBe(true)
  if (scope === 'me') expect(c.user).toBeUndefined()
  else expect(isStr(c.user?.email)).toBe(true)
}

const CHECKS: Record<McpEndpoint, (body: any) => void> = {
  'consent.get': (b) => {
    expect(isStr(b.id)).toBe(true)
    expect(['pending', 'expired']).toContain(b.state)
    expect(typeof b.client.known).toBe('boolean')
    expect(isStr(b.client.redirectHost)).toBe(true)
    for (const s of b.requestedScopes) expect(SCOPES).toContain(s)
    for (const t of b.tenants) {
      expect(typeof t.tid).toBe('number')
      expect(ACCESS).toContain(t.mcpAccess)
      expect(typeof t.writeAvailable).toBe('boolean')
      if (t.mcpAccess !== 'readwrite') expect(t.writeAvailable).toBe(false)
    }
    expect(isStr(b.notice.textVersion) && isStr(b.notice.text)).toBe(true)
    expect(b.notice.text).not.toMatch(/<[a-z!/]/i)
    expect(isIso(b.expiresAt)).toBe(true)
  },
  'consent.decide': (b) => expect(b.redirectTo).toMatch(/^https:\/\//),
  'approval.get': checkApproval,
  'approval.decide': checkApproval,
  'approvals.list': (b) => b.items.forEach(checkApproval),
  'connections.me': (b) => b.items.forEach((c: any) => checkConnection(c, 'me')),
  'connections.tenant': (b) => b.items.forEach((c: any) => checkConnection(c, 'tenant')),
  'connections.revoke': (b) => expect(b).toBeNull(),
  'connections.revokeAll': (b) => expect(typeof b.revoked).toBe('number'),
  'settings.get': (b) => {
    expect(ACCESS).toContain(b.access)
    expect(b.consent === null || (isStr(b.consent.textVersion) && isIso(b.consent.at) && isStr(b.consent.byEmail))).toBe(true)
    expect(isStr(b.currentText.textVersion) && isStr(b.currentText.text)).toBe(true)
    expect(typeof b.consentOutdated).toBe('boolean')
    expect(typeof b.canEdit).toBe('boolean')
    expect(b.serverUrl).toMatch(/^https:\/\//)
    expect(typeof b.activeConnections).toBe('number')
  },
  'settings.save': (b) => CHECKS['settings.get'](b),
}

const PATHS: Record<McpEndpoint, [string, string, unknown?]> = {
  'consent.get': ['GET', 'oauth/requests/req-1'],
  'consent.decide': ['POST', 'oauth/requests/req-1/decision', { approve: true, tid: 101, scopes: ['mcp:read'] }],
  'approval.get': ['GET', 'mcp/approvals/apr-1'],
  'approval.decide': ['POST', 'mcp/approvals/apr-1', { decision: 'approve' }],
  'approvals.list': ['GET', 'mcp/approvals?status=pending'],
  'connections.me': ['GET', 'mcp/connections?scope=me'],
  'connections.tenant': ['GET', 'mcp/connections?scope=tenant'],
  'connections.revoke': ['DELETE', 'mcp/connections/fam-1'],
  'connections.revokeAll': ['POST', 'mcp/connections/revoke-all', {}],
  'settings.get': ['GET', 'mcp/settings'],
  'settings.save': ['PUT', 'mcp/settings', { access: 'readwrite', acceptTextVersion: 'mcp-v1' }],
}

describe('mock senaryoları (§7)', () => {
  it('sözleşmedeki 16 senaryo adının tamamı tanımlı', () => {
    const section = CONTRACT.slice(CONTRACT.indexOf('## 7.'), CONTRACT.indexOf('## 8.'))
    const names = [...section.matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)].map((x) => x[1])
    expect(names.length).toBe(16)
    for (const n of names) expect(MCP_MOCK_SCENARIO_NAMES).toContain(n)
  })

  it('uç yönlendirmesi (yöntem + yol → uç) — S1/S2/S3/S4', () => {
    for (const [endpoint, [method, path]] of Object.entries(PATHS)) {
      expect(mcpEndpointOf(method, path)?.endpoint, `${method} ${path}`).toBe(endpoint)
    }
    expect(mcpEndpointOf('GET', '/api/oauth/requests/a%2Fb')).toEqual({ endpoint: 'consent.get', id: 'a/b' })
    expect(mcpEndpointOf('GET', 'mcp/unknown')).toBeNull()
    expect(mcpEndpointOf('PATCH', 'mcp/settings')).toBeNull()
  })

  for (const name of MCP_MOCK_SCENARIO_NAMES) {
    it(`${name}: her yanıt §4 şeklinde (başarı) ya da ApiError zarfı (hata)`, () => {
      const scenario = MCP_MOCK_SCENARIOS[name] as Record<string, unknown>
      for (const endpoint of Object.keys(scenario) as McpEndpoint[]) {
        const [method, path, body] = PATHS[endpoint]
        const reply = resolveMcpMock(scenario, method, path, body ?? null)!
        expect(reply, `${name}/${endpoint}`).toBeTruthy()
        if (reply.status < 300) CHECKS[endpoint](reply.body)
        else {
          const e = reply.body as any
          expect(isStr(e.error) && isStr(e.requestId)).toBe(true)
          expect(MCP_ERROR_CODES as readonly string[]).toContain(e.code)
        }
      }
    })
  }

  it('consent-unknown-multi: 3 mağaza, biri off, biri writeAvailable:false; istemci doğrulanmamış', () => {
    const b = (resolveMcpMock(MCP_MOCK_SCENARIOS['consent-unknown-multi'], 'GET', 'oauth/requests/x') as any).body
    expect(b.client.known).toBe(false)
    expect(b.tenants).toHaveLength(3)
    expect(b.tenants.filter((t: any) => t.mcpAccess === 'off')).toHaveLength(1)
    expect(b.tenants.filter((t: any) => t.mcpAccess !== 'off' && !t.writeAvailable)).toHaveLength(1)
  })

  it('approval-pending: 60 sn süre (her okumada taze)', () => {
    const b = (resolveMcpMock(MCP_MOCK_SCENARIOS['approval-pending'], 'GET', 'mcp/approvals/x') as any).body
    const sec = (Date.parse(b.expiresAt) - Date.now()) / 1000
    expect(sec).toBeGreaterThan(55)
    expect(sec).toBeLessThanOrEqual(60)
  })

  it('sentetik veri: gerçek alan adı yok (.invalid), HTML yok', () => {
    const src = read('src/mocks/mcp.ts')
    const hosts = [...src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((x) => x[1])
    for (const h of hosts) expect(h.endsWith('.invalid'), h).toBe(true)
    for (const e of src.match(/[\w.-]+@[\w.-]+/g) ?? []) expect(e.endsWith('.invalid'), e).toBe(true)
  })
})

// ── Statik güvenlik kuralları ────────────────────────────────────────────────────────────────────────────────

const MCP_FILES = [
  'src/views/unsecure/OAuthConsentView.vue',
  'src/views/unsecure/McpApprovalView.vue',
  'src/views/secure/user/ConnectedAppsView.vue',
  'src/views/secure/settings/AiConnectionView.vue',
  'src/components/mcp/McpActionPreview.vue',
  'src/components/mcp/McpConnectGuide.vue',
  'src/components/mcp/McpCopyField.vue',
]

describe('statik kurallar (§8)', () => {
  it('S1: `location.assign` yalnız yanıttaki `redirectTo` ile; başka yönlendirme/URL kurma yok', () => {
    const src = read('src/views/unsecure/OAuthConsentView.vue')
    const script = src.slice(src.indexOf('<script'))
    const assigns = [...script.matchAll(/location\.(assign|replace|href)\s*[(=]\s*([^)\n]*)/g)]
    expect(assigns).toHaveLength(1)
    expect(assigns[0][1]).toBe('assign')
    expect(assigns[0][2].trim()).toBe('res.data.redirectTo')
    expect(script).not.toMatch(/window\.open\(|location\.href\s*=/)
    expect(script).not.toMatch(/new URL\(|encodeURIComponent\(/)
  })

  it('MCP ekranlarında v-html / innerHTML YOK (preview/notice düz metin)', () => {
    for (const f of MCP_FILES) {
      const src = read(f).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '')
      expect(src, f).not.toMatch(/\sv-html=|\.innerHTML\s*=/)
    }
  })

  it('MCP ekranlarında ham renk yok (token-only)', () => {
    for (const f of MCP_FILES) {
      const style = read(f).split('<style')[1] ?? ''
      expect(style, f).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
    }
  })

  it('S1/S2: ilk odak başlıkta (tabindex=-1 + focus), birincil düğmede autofocus yok', () => {
    for (const f of ['src/views/unsecure/OAuthConsentView.vue', 'src/views/unsecure/McpApprovalView.vue']) {
      const src = read(f)
      expect(src).toMatch(/<h1 ref="headingRef"[^>]*tabindex="-1"/)
      expect(src).toMatch(/headingRef\.value\?\.focus\(\)/)
      expect(src).not.toMatch(/autofocus/)
    }
  })

  it('S1 yazma kutusu varsayılan işaretsiz; mağaza değişince sıfırlanır', () => {
    const src = read('src/views/unsecure/OAuthConsentView.vue')
    expect(src).toMatch(/const write = ref\(false\)/)
    expect(src).toMatch(/watch\(tid, \(\) => \{\s*write\.value = false/)
  })

  it('mock modülü yalnız DEV dalında dinamik içe aktarılır (üretim paketine girmez)', () => {
    const src = read('src/composables/useMcpApi.ts')
    expect(src).not.toMatch(/^import[^\n]*mocks\/mcp/m)
    const idx = src.indexOf("import('@/mocks/mcp')")
    expect(idx).toBeGreaterThan(0)
    const before = src.slice(0, idx)
    const fn = before.slice(before.lastIndexOf('async function devMock'))
    expect(fn).toMatch(/if \(!import\.meta\.env\.DEV\) return null/)
  })

  it('statik metinde hedef yapay zekâ ürün adı yok (K07; ad yalnız backend clientName)', () => {
    const banned = /\b(claude|chatgpt|openai|anthropic|gemini|copilot|perplexity|mistral)\b/i
    for (const f of [...MCP_FILES, 'src/components/mcp/mcpMessages.ts', 'src/mocks/mcp.ts']) {
      expect(read(f), f).not.toMatch(banned)
    }
  })
})
