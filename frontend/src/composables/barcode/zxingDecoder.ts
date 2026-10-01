/**
 * frontend/src/composables/barcode/zxingDecoder.ts
 *
 * MOB-03 — yerel `BarcodeDetector` olmayan tarayıcılar (iOS Safari, masaüstü Linux/Windows Chrome, Firefox) için
 * JS 1B barkod okuyucu. `@zxing/library` 0.23 (Apache-2.0), saf JS — WASM yok, CSP değişmez. Paketin kökünden
 * (barrel) DEĞİL derin yollardan alınır: kök içe aktarma QR/DataMatrix/PDF417/Aztec + tarayıcı kodu dahil
 * ~458 KB getiriyordu; yalnız 1B okuyucularla ~137 KB (≈ 32 KB gzip).
 *
 * BU DOSYA YALNIZ DİNAMİK `import()` İLE YÜKLENİR (useBarcodeScanner) — ana pakete girmez
 * (tests/mob-03-barcode.test.ts statik olarak korur).
 */
import MultiFormatOneDReader from '@zxing/library/esm/core/oned/MultiFormatOneDReader'
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap'
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer'
import RGBLuminanceSource from '@zxing/library/esm/core/RGBLuminanceSource'
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType'
import BarcodeFormat from '@zxing/library/esm/core/BarcodeFormat'

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
  ]],
  [DecodeHintType.TRY_HARDER, true],
])
const reader = new MultiFormatOneDReader(hints)

/** Gri tonlu kareden (rgbaToLuma) tek barkod okur; bulunamazsa null. */
export function decodeLuma(luma: Uint8ClampedArray, width: number, height: number): string | null {
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luma, width, height)))
    return reader.decode(bitmap, hints).getText()
  } catch {
    return null // NotFound / Checksum / Format — bu karede barkod yok
  } finally {
    reader.reset()
  }
}
