/**
 * Test yardımcıları (`@entegrasyonik/chat/testing`): mock taşıyıcı + boş host ile denetleyici; uygulama/Playwright
 * testleri ve vitrinler bunu kullanır. Üretim kodu içe aktarmaz.
 */
import { NULL_HOST, type ChatHost } from './host'
import { createChatController, type ChatController } from './state/useChat'
import { createMockTransport, type MockTransport, type MockTransportOptions } from './transport/mock'

export function createTestChat(options: MockTransportOptions & { host?: Partial<ChatHost> } = {}): { controller: ChatController; transport: MockTransport } {
  const transport = createMockTransport({ speed: 0, ...options })
  const controller = createChatController({ transport, host: { ...NULL_HOST, ...options.host } })
  return { controller, transport }
}

export { createMockTransport, MOCK_CONFIG_IDS, type MockConfigId, type MockTransport } from './transport/mock'
