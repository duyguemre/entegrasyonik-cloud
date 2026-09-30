/**
 * @entegrasyonik/chat — genel API (CHAT_UI_CONTRACT.md §1). Taşıyıcılar ayrı girişlerdedir:
 * `@entegrasyonik/chat/transports/sse`, `@entegrasyonik/chat/transports/mock`; protokol `@entegrasyonik/chat/protocol`.
 */
export { CHAT_PRODUCT, type ChatProduct } from './brand'
export { provideChatHost, useChatHost, NULL_HOST, CHAT_HOST_KEY, type ChatHost, type ChatTelemetryEvent, type LocalToolBridge } from './host'
export { createChatController, provideChat, useChat, CHAT_CONTROLLER_KEY, INFO_TTL_MS, type ChatController, type ChatControllerOptions } from './state/useChat'
export { transition, initialMachineState, canCompose, SETUP_ERROR_CODES, type ChatStatus, type MachineState, type MachineEvent, type MachineEffect } from './state/machine'
export type { ChatTransport, ChatSetupApi } from './transport/types'
export { ChatTransportError } from './transport/types'
export { createTranslator, CHAT_MESSAGES, type Translate, type ChatMessageKey } from './i18n'
export { CHAT_ICON } from './components/icons'

export { default as ChatPanel } from './components/ChatPanel.vue'
export { default as ChatThread } from './components/ChatThread.vue'
export { default as ChatMessage } from './components/ChatMessage.vue'
export { default as ChatComposer } from './components/ChatComposer.vue'
export { default as ChatContextChip } from './components/ChatContextChip.vue'
export { default as ChatEmptyState } from './components/ChatEmptyState.vue'
export { default as ChatUnavailable } from './components/ChatUnavailable.vue'
export { default as ChatProviderSetup } from './components/ChatProviderSetup.vue'
