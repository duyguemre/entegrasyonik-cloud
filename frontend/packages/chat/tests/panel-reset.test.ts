// BO-WDG: "Yeni sohbet" onayı ve kurulum yuvası — ikisi de isteğe bağlı. Varsayılan (web uygulaması) DEĞİŞMEZ:
// onaysız sıfırlama, kurulum durumunda paket formu.
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import ChatPanel from '../src/components/ChatPanel.vue'
import { flush, testChat, vuetify } from './helpers'

// happy-dom `visualViewport` vermez; Vuetify diyalog konumlandırması onu dinler (yalnız test ortamı yaması).
const g = globalThis as { visualViewport?: unknown }
g.visualViewport ??= { width: 1024, height: 768, addEventListener() {}, removeEventListener() {} }

async function mountPanel(props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}, config?: 'setup-required') {
  const chat = testChat(config ? { config } : {})
  const w = mount(ChatPanel, { props: { controller: chat.controller, autofocus: false, ...props }, slots, attachTo: document.body, global: { plugins: [vuetify()] } })
  await chat.controller.ensureLoaded()
  await flush()
  return { ...chat, w }
}

async function withMessages(props: Record<string, unknown> = {}) {
  const m = await mountPanel(props)
  m.controller.send('satış')
  await flush(10)
  expect(m.controller.messages.value.length).toBeGreaterThan(0)
  return m
}

describe('ChatPanel "Yeni sohbet"', () => {
  it('varsayılan (confirmReset yok): tıklama onaysız sıfırlar, diyalog çizilmez', async () => {
    const { controller, w } = await withMessages()
    const reset = vi.spyOn(controller, 'reset')
    await w.find('[data-testid="ek-chat-new"]').trigger('click')
    await flush()
    expect(reset).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    w.unmount()
  })

  it('confirmReset: önce onay sorar (mesaj sayısı + geri alınamaz); Vazgeç sıfırlamaz, onay sıfırlar', async () => {
    const { controller, w } = await withMessages({ confirmReset: true })
    const reset = vi.spyOn(controller, 'reset')
    const count = controller.messages.value.length
    await w.find('[data-testid="ek-chat-new"]').trigger('click')
    await flush()
    expect(reset).not.toHaveBeenCalled()
    const dialog = document.body.querySelector('[role="alertdialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('Yeni sohbet başlatılsın mı?')
    expect(dialog!.textContent).toContain(`${count} mesaj silinir`)
    expect(dialog!.textContent).toContain('geri alınamaz')

    const buttons = [...dialog!.querySelectorAll('button')]
    buttons.find((b) => b.textContent?.trim() === 'Vazgeç')!.click()
    await flush()
    expect(reset).not.toHaveBeenCalled()

    await w.find('[data-testid="ek-chat-new"]').trigger('click')
    await flush()
    const again = document.body.querySelector('[role="alertdialog"]')!
    ;[...again.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Konuşmayı sil')!.click()
    await flush()
    expect(reset).toHaveBeenCalledTimes(1)
    w.unmount()
  })
})

describe('ChatPanel #setup yuvası', () => {
  it('yuva verilmezse kurulum durumunda paket formu çizilir (web değişmez)', async () => {
    const { w } = await mountPanel({}, {}, 'setup-required')
    expect(w.find('.ek-chat-setup, [data-view]').exists()).toBe(true)
    expect(w.find('[data-testid="host-setup"]').exists()).toBe(false)
    w.unmount()
  })

  it('yuva verilirse kurulum formu yerine host içeriği çizilir', async () => {
    const { w } = await mountPanel({}, { setup: () => h('p', { 'data-testid': 'host-setup' }, 'Ayar sayfasına gidin') }, 'setup-required')
    expect(w.find('[data-testid="host-setup"]').exists()).toBe(true)
    expect(w.find('.ek-chat-setup').exists()).toBe(false)
    w.unmount()
  })
})
