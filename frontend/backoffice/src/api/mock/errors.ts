import type { ApiErrorBody } from '../contract'

/** Sahte API hata yanıtı: ERROR_CODES.md zarfı `{ error, code, fields? }` (+ sunucu requestId ekler). */
export class MockHttpError extends Error {
  readonly body: ApiErrorBody
  constructor(
    readonly status: number,
    code: string,
    message: string,
    fields?: ApiErrorBody['fields'],
  ) {
    super(message)
    this.body = { error: message, code, ...(fields ? { fields } : {}) }
  }
}
