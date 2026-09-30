// §9 ChatProviderSetup: anahtar kayıttan sonra boşalır ve DOM/depoda kalmaz; onay kutusu yalnız canConsent'te;
// sahip değilse consent gönderilmez; her ProviderErrorCode için ileti; canConfigure:false görünümü.
import { describe, expect, it, vi } from 'vitest'
import ChatProviderSetup from '../src/components/ChatProviderSetup.vue'
import { createMockTransport, type MockConfigId } from '../src/transport/mock'
import { createTranslator } from '../src/i18n'
import { ChatTransportError } from '../src/transport/types'
import { PROVIDER_ERROR_CODES, providerErrorMessage } from '../src/components/providerErrors'
import { flush, mountWithChat, testChat } from './helpers'

const SECRET = 'sk-cok-gizli-anahtar-123456'

async function setup(config: MockConfigId, variant: 'panel' | 'settings' = 'panel') {
  const transport = createMockTransport({ speed: 0, config })
  const { controller } = testChat()
  const w = mountWithChat(ChatProviderSetup, { api: transport.setup, variant }, controller)
  await flush(8)
  return { w, transport }
}

describe('ChatProviderSetup', () => {
  it('anahtar alanı: password, autocomplete=off, spellcheck=false; yardım bağlantısı yeni sekme + noopener noreferrer', async () => {
    const { w } = await setup('setup-required')
    const input = w.find('input[type="password"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('autocomplete')).toBe('off')
    expect(input.attributes('spellcheck')).toBe('false')
    const help = w.find('a.ek-chat-setup__help')
    expect(help.attributes('target')).toBe('_blank')
    expect(help.attributes('rel')).toBe('noopener noreferrer')
    expect(help.attributes('href')).toMatch(/^https:\/\//)
  })

  it('kayıttan sonra anahtar DOM\'da, localStorage/sessionStorage\'da ve yayılan olaylarda YOK', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const { w } = await setup('setup-required')
    await w.find('input[type="password"]').setValue(SECRET)
    await w.find('input[type="checkbox"]').setValue(true)
    await w.find('form').trigger('submit')
    await flush(10)
    expect(w.html()).not.toContain(SECRET)
    expect(w.text()).toContain('Kayıtlı anahtar ••••')
    expect(w.find('input[type="password"]').exists()).toBe(false)
    const stores = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    expect(stores).not.toContain(SECRET)
    expect(JSON.stringify(w.emitted())).not.toContain(SECRET)
    expect(w.emitted('ready')).toBeTruthy()
  })

  it('onay kutusu yalnız sahipte (canConsent); admin için not ve consent GÖNDERİLMEZ', async () => {
    const owner = await setup('setup-required')
    expect(owner.w.find('input[type="checkbox"]').exists()).toBe(true)

    const transport = createMockTransport({ speed: 0, config: 'setup-required' })
    transport.state.canConsent = false
    const save = vi.spyOn(transport.setup, 'save')
    const w = mountWithChat(ChatProviderSetup, { api: transport.setup, variant: 'panel' }, testChat().controller)
    await flush(8)
    expect(w.find('input[type="checkbox"]').exists()).toBe(false)
    expect(w.text()).toContain('hesap sahibinin bu metni onaylaması gerekecek')
    await w.find('input[type="password"]').setValue('sk-good')
    await w.find('form').trigger('submit')
    await flush(10)
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0][0].consent).toBeUndefined()
  })

  it('aktarım bilgilendirmesi herkes tarafından görülür (admin bekleme görünümü dahil)', async () => {
    const { w } = await setup('consent-pending-admin')
    expect(w.find('[data-view="consent-admin"]').exists()).toBe(true)
    expect(w.text()).toContain('Hesap sahibinin onayı bekleniyor')
    expect(w.text()).toContain('Veri aktarım bilgilendirmesi')
    expect(w.findAll('button').some((b) => b.text() === 'Onaylıyorum')).toBe(false)
  })

  it('consent-pending-owner: "Onaylıyorum" → ready', async () => {
    const { w } = await setup('consent-pending-owner')
    const btn = w.findAll('button').find((b) => b.text() === 'Onaylıyorum')!
    await btn.trigger('click')
    await flush(8)
    expect(w.emitted('ready')).toBeTruthy()
  })

  it('canConfigure:false → yönetici görünümü (form yok)', async () => {
    const { w } = await setup('setup-no-permission')
    expect(w.find('[data-view="no-permission"]').exists()).toBe(true)
    expect(w.text()).toContain('yöneticinizin bir yapay zekâ sağlayıcı anahtarı tanımlaması gerekiyor')
    expect(w.find('form').exists()).toBe(false)
  })

  it('test hatası: geçersiz anahtar iletisi (ham sağlayıcı yanıtı yok); anahtar boşsa uyarı', async () => {
    const { w } = await setup('setup-required')
    await w.findAll('button').find((b) => b.text() === 'Bağlantıyı test et')!.trigger('click')
    await flush(3)
    expect(w.text()).toContain('API anahtarını girin.')
    await w.find('input[type="password"]').setValue('sk-bad')
    await w.findAll('button').find((b) => b.text() === 'Bağlantıyı test et')!.trigger('click')
    await flush(8)
    expect(w.find('[data-testid="ek-chat-test-result"]').text()).toContain('Anahtar geçersiz ya da iptal edilmiş')
  })

  it('her ProviderErrorCode için kullanıcı iletisi (rate: N sn)', () => {
    const t = createTranslator(() => 'tr')
    for (const code of PROVIDER_ERROR_CODES) {
      const msg = providerErrorMessage(t, code, 20)!
      expect(msg.length, code).toBeGreaterThan(20)
      expect(msg, code).not.toContain('providerError.')
    }
    expect(providerErrorMessage(t, 'LLM_RATE_LIMITED', 20)).toContain('20 sn')
    expect(new ChatTransportError('LLM_QUOTA', 'x').code).toBe('LLM_QUOTA')
  })

  it('kaydetme hatası (sunucu yeniden sınar): anahtar alanı açık kalır, ileti gösterilir', async () => {
    const { w } = await setup('setup-required')
    await w.find('input[type="password"]').setValue('sk-quota')
    await w.find('form').trigger('submit')
    await flush(10)
    expect(w.find('[data-testid="ek-chat-setup-error"]').text()).toContain('kredi ya da kota')
    expect(w.emitted('ready')).toBeFalsy()
  })

  it('ayarlar görünümü: durum, kullanım (bilgi amaçlı), kaldır ve onayı geri al', async () => {
    const { w } = await setup('enabled', 'settings')
    const text = w.text()
    expect(text).toContain('Etkin')
    expect(text).toContain('Kullanım (bilgi amaçlı)')
    expect(text).toContain('14 istek')
    expect(text).toContain('Anahtarı kaldır')
    expect(text).toContain('Onayı geri al')
  })

  it('bileşen kapanınca yazılmış (kaydedilmemiş) anahtar bellekten silinir', async () => {
    const { w } = await setup('setup-required')
    await w.find('input[type="password"]').setValue(SECRET)
    const vm = w.vm as unknown as { $: { setupState: { apiKey: string } } }
    w.unmount()
    expect(vm.$.setupState.apiKey).toBe('')
  })
})
