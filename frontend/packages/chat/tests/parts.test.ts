// §9 her Part*.vue: sentetik veriyle render, boş/sınır durumları, untrusted kırpma, resolveLink → null.
import { describe, expect, it, vi } from 'vitest'
import PartText from '../src/components/parts/PartText.vue'
import PartTable from '../src/components/parts/PartTable.vue'
import PartKpi from '../src/components/parts/PartKpi.vue'
import PartConfirm from '../src/components/parts/PartConfirm.vue'
import PartProgress from '../src/components/parts/PartProgress.vue'
import PartError from '../src/components/parts/PartError.vue'
import PartEntityLink from '../src/components/parts/PartEntityLink.vue'
import PartForm from '../src/components/parts/PartForm.vue'
import PartRenderer from '../src/components/parts/PartRenderer.vue'
import type { ConfirmPart, EntityLinkPart, FormPart, KpiPart, TablePart } from '../src/protocol/v1'
import { ORDER_COLUMNS, orderRows } from '../src/transport/mock/scenarios'
import { flush, mountWithChat, testChat } from './helpers'

const future = () => new Date(Date.now() + 5 * 60 * 1000).toISOString()
const linkHost = (open = vi.fn()) => ({ resolveLink: (l: { screen: string }) => (l.screen === 'bilinmeyen' ? null : { href: `/${l.screen}`, open }) })

describe('PartText', () => {
  it('markdown ve düz metin; akışta imleç (aria-hidden)', () => {
    const { controller } = testChat()
    const w = mountWithChat(PartText, { part: { id: 't', type: 'text', format: 'markdown', text: '**a** <b>x</b>', streaming: true } }, controller)
    expect(w.find('strong').text()).toBe('a')
    expect(w.html()).not.toContain('<b>x</b>')
    expect(w.find('.ek-chat-caret').attributes('aria-hidden')).toBe('true')
    const plain = mountWithChat(PartText, { part: { id: 't', type: 'text', format: 'plain', text: '**a**' } }, controller)
    expect(plain.text()).toContain('**a**')
    expect(plain.find('.ek-chat-caret').exists()).toBe(false)
  })
})

describe('PartTable', () => {
  const table = (over: Partial<TablePart> = {}): TablePart => ({
    id: 'tb', type: 'table', title: 'Siparişler', capabilityId: 'orders.list', columns: ORDER_COLUMNS, rowKey: 'order', rows: orderRows(0), total: 132, more: { token: 'x' }, ...over,
  })
  it('gerçek <table>: caption (başlık + sayı), scope=col, kaydırma kabı odaklanabilir + etiketli', () => {
    const { controller } = testChat()
    const w = mountWithChat(PartTable, { part: table(), messageId: 'm' }, controller)
    expect(w.find('caption').text()).toBe('Siparişler — 25 / 132 kayıt')
    expect(w.findAll('th[scope="col"]')).toHaveLength(8)
    const region = w.find('.ek-chat-grid')
    expect(region.attributes('tabindex')).toBe('0')
    expect(region.attributes('aria-label')).toContain('Siparişler')
    expect(w.findAll('tbody tr')).toHaveLength(25)
  })
  it('untrusted sütun: kırpma sınıfı + title ile tam metin; para/sayı sağa yaslı', () => {
    const { controller } = testChat()
    const w = mountWithChat(PartTable, { part: table({ rows: [{ ...orderRows(0)[0], customer: 'Uzun <b>müşteri</b> notu' }] }), messageId: 'm' }, controller)
    const clamp = w.find('.ek-chat-grid__clamp')
    expect(clamp.attributes('title')).toBe('Uzun <b>müşteri</b> notu')
    expect(clamp.find('b').exists()).toBe(false)
    expect(w.findAll('td.is-end').length).toBeGreaterThan(0)
  })
  it('boş tablo: "Kayıt bulunamadı."; more yoksa düğme yok; openIn çözülemezse "Ekranda aç" yok', () => {
    const { controller } = testChat({ host: linkHost() })
    const w = mountWithChat(PartTable, { part: table({ rows: [], total: 0, more: null, openIn: { screen: 'bilinmeyen' } }), messageId: 'm' }, controller)
    expect(w.text()).toContain('Kayıt bulunamadı.')
    expect(w.text()).not.toContain('Daha fazla göster')
    expect(w.text()).not.toContain('Ekranda aç')
  })
  it('entity hücresi: linkForEntity yoksa düz metin; varsa bağlantı', () => {
    const open = vi.fn()
    const plain = mountWithChat(PartTable, { part: table(), messageId: 'm' }, testChat().controller)
    expect(plain.find('tbody a').exists()).toBe(false)
    const linked = mountWithChat(PartTable, { part: table(), messageId: 'm' }, testChat({ host: { ...linkHost(open), linkForEntity: () => ({ screen: 'OrderListView' }) } }).controller)
    expect(linked.find('tbody a').text()).toBe('EK-240001')
  })
  it('500 satır tavanında "daha fazla" gizlenir, bilgi notu görünür', () => {
    const rows = Array.from({ length: 20 }, (_, i) => orderRows(i)).flat()
    const w = mountWithChat(PartTable, { part: { ...table(), rows: rows as never } as never, messageId: 'm' }, testChat().controller)
    expect(w.text()).not.toContain('Daha fazla göster')
    expect(w.text()).toContain('en çok 500 satır')
  })
})

describe('PartKpi', () => {
  const kpi: KpiPart = {
    id: 'k', type: 'kpi', title: 'Son 7 gün',
    items: [
      { key: 'r', label: 'Ciro', value: 1000, format: 'money', currency: 'TRY', delta: { value: 0.1, direction: 'up', good: true } },
      { key: 'x', label: 'İade', value: 0.03, format: 'percent', delta: { value: 0.01, direction: 'down', good: false } },
      { key: 'n', label: 'Boş', value: null, format: 'number' },
    ],
  }
  it('değer biçimi + yön METİNLE (renk tek başına değil); null → —', () => {
    const w = mountWithChat(PartKpi, { part: kpi }, testChat().controller)
    const text = w.text()
    expect(text).toContain('₺1.000,00')
    expect(text).toContain('artış · olumlu')
    expect(text).toContain('düşüş · olumsuz')
    expect(text).toContain('—')
    expect(w.find('.is-good').exists() && w.find('.is-bad').exists()).toBe(true)
  })
})

describe('PartConfirm', () => {
  const card = (over: Partial<ConfirmPart> = {}): ConfirmPart => ({
    id: 'c', type: 'confirm', pendingActionId: 'pa', capabilityId: 'orders.approve', title: '3 siparişi onayla', summary: '3 sipariş onaylanacak.',
    effect: 'write', risk: 'medium', external: true, affected: { count: 13, sample: [{ type: 'order', id: '1', label: 'EK-1' }] },
    changes: [{ label: 'Durum', from: 'Bekliyor', to: 'Onaylandı' }], confirmMode: 'confirm', expiresAt: future(), state: 'pending', ...over,
  })
  it('role=group + aria-labelledby başlık; düğme eylemi söyler; dış sistem satırı; fazla kayıt notu', () => {
    const w = mountWithChat(PartConfirm, { part: card(), messageId: 'm' }, testChat().controller)
    const group = w.find('[role="group"]')
    const title = w.find(`#${group.attributes('aria-labelledby')}`)
    expect(title.text()).toBe('3 siparişi onayla')
    expect(title.attributes('tabindex')).toBe('-1')
    expect(w.text()).toContain('Pazaryerine / dış sisteme gönderilir')
    expect(w.text()).toContain('ve 12 kayıt daha')
    expect(w.findAll('button').map((b) => b.text())).toEqual(expect.arrayContaining(['Reddet', '3 siparişi onayla']))
    expect(w.find('.ek-chat-confirm__timer').exists()).toBe(true)
  })
  it('typed: eşleşmeden onay pasif ve nedeni describedby', async () => {
    const w = mountWithChat(PartConfirm, { part: card({ effect: 'destructive', risk: 'high', confirmMode: 'typed', typedPhrase: 'SİL 2', title: '2 ürünü sil' }), messageId: 'm' }, testChat().controller)
    const approve = w.findAll('button').find((b) => b.text() === '2 ürünü sil')!
    expect(approve.attributes('disabled')).toBeDefined()
    const describedby = approve.attributes('aria-describedby')!
    expect(w.find(`#${describedby}`).text()).toContain('SİL 2')
    await w.find('input').setValue('sil 2')
    expect(approve.attributes('aria-describedby')).toBe(describedby)
    await w.find('input').setValue('SİL 2')
    // İfade eşleşti: neden bağlantısı kalkar (düğme, makine awaiting-confirm'de değilken yine pasif — bu testte loading).
    expect(approve.attributes('aria-describedby')).toBeUndefined()
  })
  it('durum görünümleri: done (sonuç + aç), rejected, expired, executing', () => {
    const host = linkHost()
    for (const [state, text] of [['done', 'Tamamlandı'], ['rejected', 'İşlem reddedildi.'], ['expired', 'Süre doldu, yeniden isteyin.'], ['executing', 'Uygulanıyor…']] as const) {
      const w = mountWithChat(PartConfirm, { part: card({ state, result: state === 'done' ? { message: '3 sipariş onaylandı.', openIn: { screen: 'OrderListView' } } : undefined }), messageId: 'm' }, testChat({ host }).controller)
      expect(w.text(), state).toContain(text)
      expect(w.findAll('button').some((b) => b.text() === 'Reddet'), state).toBe(false)
      if (state === 'done') expect(w.text()).toContain('Sonucu aç')
    }
  })
})

describe('PartProgress / PartError / PartEntityLink / PartForm / PartUnknown', () => {
  it('progress: durum metinle (çalışıyor/tamamlandı) + ayrıntı', () => {
    const w = mountWithChat(PartProgress, { part: { id: 'p', type: 'progress', label: 'Siparişler getiriliyor', state: 'done', detail: '25 kayıt' } }, testChat().controller)
    expect(w.text()).toContain('Siparişler getiriliyor')
    expect(w.text()).toContain('Tamamlandı · 25 kayıt')
  })
  it('error: ileti + destek kodu; setup eylemi "Kurulumu aç"; open çözülemezse düğme yok', () => {
    const { controller } = testChat({ host: linkHost() })
    const w = mountWithChat(PartError, { part: { id: 'e', type: 'error', code: 'LLM_KEY_INVALID', message: 'Anahtar geçersiz.', retryable: false, supportCode: 'EK-9', action: { kind: 'setup' } }, messageId: 'm' }, controller)
    expect(w.text()).toContain('Anahtar geçersiz.')
    expect(w.text()).toContain('Destek kodu: EK-9')
    expect(w.text()).toContain('Kurulumu aç')
    const x = mountWithChat(PartError, { part: { id: 'e', type: 'error', code: 'FORBIDDEN', message: 'Yetki yok.', retryable: false, action: { kind: 'open', link: { screen: 'bilinmeyen' }, label: 'Yetkiler' } }, messageId: 'm' }, controller)
    expect(x.text()).not.toContain('Yetkiler')
  })
  it('entity-link: resolveLink null → tıklanamaz metin; çözülünce "Aç" + tıklama host.open', async () => {
    const part: EntityLinkPart = { id: 'e', type: 'entity-link', entity: { type: 'product', id: 'p1', label: 'Demo Tişört' }, link: { screen: 'bilinmeyen' }, fields: [{ label: 'Fiyat', value: '349.9', type: 'money' }] }
    const none = mountWithChat(PartEntityLink, { part }, testChat({ host: linkHost() }).controller)
    expect(none.find('a').exists()).toBe(false)
    expect(none.text()).toContain('₺349,90')
    const open = vi.fn()
    const linked = mountWithChat(PartEntityLink, { part: { ...part, link: { screen: 'ProductListView' } } }, testChat({ host: linkHost(open) }).controller)
    await linked.find('a').trigger('click')
    expect(open).toHaveBeenCalledOnce()
  })
  it('form: zorunlu alan boşsa gönderilmez; kapalı durumda salt-okunur ileti', async () => {
    const { controller } = testChat()
    await controller.ensureLoaded()
    await flush()
    const part: FormPart = { id: 'f', type: 'form', formId: 'price-update', capabilityId: 'x', title: 'Fiyat', fields: [{ name: 'price', label: 'Yeni fiyat', required: true, kind: 'money', currency: 'TRY' }], submitLabel: 'Önizle', state: 'open', expiresAt: future() }
    const spy = vi.spyOn(controller, 'submitForm')
    const w = mountWithChat(PartForm, { part, messageId: 'm' }, controller)
    await w.find('form').trigger('submit')
    expect(spy).not.toHaveBeenCalled()
    expect(w.text()).toContain('Lütfen zorunlu alanları doldurun.')
    const closed = mountWithChat(PartForm, { part: { ...part, state: 'cancelled' }, messageId: 'm' }, controller)
    expect(closed.text()).toContain('Form kapatıldı.')
    expect(closed.text()).not.toContain('Önizle')
  })
  it('bilinmeyen tür → PartUnknown (içerik çizilmez)', () => {
    const w = mountWithChat(PartRenderer, { part: { id: 'x', type: 'chart', secret: '<script>' }, messageId: 'm' }, testChat().controller)
    expect(w.text()).toContain('Bu içerik bu sürümde gösterilemiyor')
    expect(w.html()).not.toContain('script')
  })
})
