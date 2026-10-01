/**
 * Stub karakterizasyon testleri için ortak axios taklidi. Gerçek ağ isteği YOK.
 * Kullanım: her test dosyasında `jest.mock('axios', () => require('./_axiosMock').axiosModuleFactory())`
 * (jest.mock hoist edildiğinden factory require ile alınır).
 */
import { jest } from '@jest/globals';

export const http: Record<string, any> = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  request: jest.fn(),
};

export function axiosModuleFactory(): any {
  const instance = http; // axios.create() da aynı taklit nesneyi döndürür (N11 RestService)
  const create = jest.fn(() => instance);
  return { __esModule: true, default: { ...http, create }, ...http, create };
}

export function resetHttp(): void {
  for (const k of Object.keys(http)) (http[k] as any).mockReset();
}

/** Ağ katmanına HİÇ çağrı yapılmadığını doğrulamak için toplam çağrı sayısı. */
export function httpCallCount(): number {
  return Object.values(http).reduce((n: number, fn: any) => n + fn.mock.calls.length, 0);
}
