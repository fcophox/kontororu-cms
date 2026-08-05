/**
 * Dimensiones de imagen leídas de la cabecera del archivo.
 *
 * Sin dependencias a propósito: `sharp` pesa ~30 MB en el bundle de servidor
 * y aquí sólo hacen falta dos enteros. Se leen los primeros bytes, que es
 * donde todos estos formatos declaran su tamaño.
 *
 * Importan porque viajan en la API: el front-end del cliente los necesita
 * para reservar el hueco de la imagen y evitar saltos de layout (CLS).
 */

export type Dimensions = { width: number; height: number } | null;

export function readImageSize(bytes: Uint8Array, mimeType: string): Dimensions {
  try {
    if (mimeType === "image/png") return png(bytes);
    if (mimeType === "image/jpeg") return jpeg(bytes);
    if (mimeType === "image/gif") return gif(bytes);
    if (mimeType === "image/webp") return webp(bytes);
    // AVIF y SVG requieren parseo real; se dejan sin dimensiones.
    return null;
  } catch {
    // Un archivo corrupto no debe impedir la subida: se guarda sin medidas.
    return null;
  }
}

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

function png(b: Uint8Array): Dimensions {
  // IHDR es siempre el primer chunk: ancho y alto en los bytes 16–23.
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const v = view(b);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function gif(b: Uint8Array): Dimensions {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49) return null;
  const v = view(b);
  return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
}

function webp(b: Uint8Array): Dimensions {
  if (b.length < 30) return null;
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
  const v = view(b);

  if (fourcc === "VP8 ") {
    return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
  }
  if (fourcc === "VP8L") {
    const bits = v.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === "VP8X") {
    const w = b[24] | (b[25] << 8) | (b[26] << 16);
    const h = b[27] | (b[28] << 8) | (b[29] << 16);
    return { width: w + 1, height: h + 1 };
  }
  return null;
}

function jpeg(b: Uint8Array): Dimensions {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const v = view(b);

  // Recorrer segmentos hasta el marcador SOF, que es el que lleva el tamaño.
  let offset = 2;
  while (offset < b.length - 9) {
    if (b[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b[offset + 1];

    // SOF0–SOF15, excluidos DHT (c4), JPGA (c8) y DAC (cc), que no son SOF.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      return { height: v.getUint16(offset + 5), width: v.getUint16(offset + 7) };
    }
    offset += 2 + v.getUint16(offset + 2);
  }
  return null;
}
