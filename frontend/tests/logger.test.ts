// ADR-0017 Karar 1.8 — `logger.ts`'in `error`/`warn` seviyelerini `clientLogTransport.sendClientLog`'a
// devrettiğini, `debug`/`info`'yu ASLA devretmediğini doğrular (gerçek ağ çağrısı YOK — modül
// mock'lanır; gerçek nakliye davranışı `clientLogTransport.test.ts`'te ayrıca test edilir).
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/composables/clientLogTransport', () => ({ sendClientLog: vi.fn() }))

import logger from '../src/composables/logger'
import { sendClientLog } from '../src/composables/clientLogTransport'

describe('logger → clientLogTransport devri (ADR-0017 Karar 1.8)', () => {
  beforeEach(() => {
    vi.mocked(sendClientLog).mockClear()
  })

  it('error: konsola yazar VE sendClientLog("error", …) çağırır', () => {
    logger.error('bir şey patladı', { module: 'x' })
    expect(sendClientLog).toHaveBeenCalledTimes(1)
    expect(sendClientLog).toHaveBeenCalledWith('error', 'bir şey patladı', { module: 'x' })
  })

  it('warn: sendClientLog("warn", …) çağırır', () => {
    logger.warn('dikkat', { module: 'x' })
    expect(sendClientLog).toHaveBeenCalledTimes(1)
    expect(sendClientLog).toHaveBeenCalledWith('warn', 'dikkat', { module: 'x' })
  })

  it('debug: sendClientLog ASLA çağrılmaz', () => {
    logger.debug('teşhis bilgisi')
    expect(sendClientLog).not.toHaveBeenCalled()
  })

  it('info: sendClientLog ASLA çağrılmaz', () => {
    logger.info('bilgi')
    expect(sendClientLog).not.toHaveBeenCalled()
  })
})
