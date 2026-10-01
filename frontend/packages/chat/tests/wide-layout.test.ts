// BO2-P3 (bo-r2b): isteğe bağlı geniş yerleşim. Varsayılan (web) DEĞİŞMEZ: `is-wide` yalnız `wide` verilince; dar-kap kart
// satırları yalnız `.ek-chat.is-wide` altında. Hücreler sütun etiketini `data-label` ile taşır (kart satırın etiketi).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import ChatPanel from '../src/components/ChatPanel.vue'
import PartTable from '../src/components/parts/PartTable.vue'
import type { TablePart } from '../src/protocol/v1'
import { ORDER_COLUMNS, orderRows } from '../src/transport/mock/scenarios'
import { mountWithChat, testChat } from './helpers'

const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'chat.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('geniş yerleşim (wide)', () => {
  it('ChatPanel: varsayılan is-wide YOK; wide verilince sınıf eklenir', () => {
    const { controller } = testChat()
    const plain = mount(ChatPanel, { props: { controller, autofocus: false }, global: { plugins: [createVuetify()] } })
    expect(plain.find('.ek-chat').classes()).not.toContain('is-wide')
    const wide = mount(ChatPanel, { props: { controller, autofocus: false, mode: 'page', wide: true }, global: { plugins: [createVuetify()] } })
    expect(wide.find('.ek-chat').classes()).toEqual(expect.arrayContaining(['is-page', 'is-wide']))
  })

  it('tablo hücreleri sütun etiketini data-label ile taşır', () => {
    const part: TablePart = { id: 'tb', type: 'table', title: 'Siparişler', capabilityId: 'orders.list', columns: ORDER_COLUMNS, rowKey: 'order', rows: orderRows(0), total: 25, more: null }
    const w = mountWithChat(PartTable, { part, messageId: 'm' }, testChat().controller)
    const labels = w.find('tbody tr').findAll('td').map((td) => td.attributes('data-label'))
    expect(labels).toEqual(ORDER_COLUMNS.map((c) => c.label))
  })

  it('geniş kurallar yalnız .ek-chat.is-wide kapsamında (varsayılan yerleşime sızmaz)', () => {
    const start = css.indexOf('.ek-chat.is-wide {')
    expect(start).toBeGreaterThan(-1)
    const block = css.slice(start, css.indexOf('.ek-chat-state {'))
    const selectors = [...block.matchAll(/(^|\n)\s*([^@{}\n][^{}]*?)\s*\{/g)].map((m) => m[2].trim()).filter((s) => !s.startsWith('@'))
    expect(selectors.length).toBeGreaterThan(5)
    for (const sel of selectors) for (const part of sel.split(',')) expect(part.trim(), sel).toMatch(/^\.ek-chat\.is-wide\b/)
  })
})
