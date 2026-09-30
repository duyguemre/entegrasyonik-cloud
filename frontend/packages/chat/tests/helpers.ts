import { mount, type MountingOptions } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { defineComponent, h, type Component } from 'vue'
import { CHAT_CONTROLLER_KEY, createChatController, type ChatController } from '../src/state/useChat'
import { NULL_HOST, type ChatHost } from '../src/host'
import { createMockTransport, type MockTransportOptions } from '../src/transport/mock'

export function vuetify() {
  return createVuetify({ components, directives })
}

export function testChat(options: MockTransportOptions & { host?: Partial<ChatHost> } = {}) {
  const transport = createMockTransport({ speed: 0, ...options })
  const host: ChatHost = { ...NULL_HOST, ...options.host }
  const controller = createChatController({ transport, host })
  return { controller, transport, host }
}

/** Bileşeni denetleyici sağlanmış olarak bağlar. */
export function mountWithChat<T extends Component>(component: T, props: Record<string, unknown>, controller: ChatController, options: MountingOptions<any> = {}) {
  return mount(component as any, {
    props,
    attachTo: document.body,
    ...options,
    global: {
      plugins: [vuetify()],
      provide: { [CHAT_CONTROLLER_KEY as symbol]: controller },
      ...(options.global ?? {}),
    },
  })
}

export async function flush(times = 5) {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0))
}

export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const x of iter) out.push(x)
  return out
}

export const Wrapper = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
