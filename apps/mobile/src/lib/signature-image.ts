/** Decode a data:image/png;base64,... URL to bytes (React Native fetch(dataUrl) is unreliable). */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const match = /^data:[^;]+;base64,(.+)$/i.exec(dataUrl.trim());
  if (!match?.[1]) {
    throw new Error('Invalid signature image');
  }
  return base64ToUint8Array(match[1]);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padding);

  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const outputLength = (padded.length * 3) / 4 - (padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(outputLength);
  let byteIndex = 0;

  for (let i = 0; i < padded.length; i += 4) {
    const enc1 = alphabet.indexOf(padded[i]);
    const enc2 = alphabet.indexOf(padded[i + 1]);
    const enc3 = alphabet.indexOf(padded[i + 2]);
    const enc4 = alphabet.indexOf(padded[i + 3]);
    if (enc1 < 0 || enc2 < 0) break;

    bytes[byteIndex++] = (enc1 << 2) | (enc2 >> 4);
    if (enc3 >= 0 && padded[i + 2] !== '=') {
      bytes[byteIndex++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    }
    if (enc4 >= 0 && padded[i + 3] !== '=') {
      bytes[byteIndex++] = ((enc3 & 3) << 6) | enc4;
    }
  }

  return bytes.subarray(0, byteIndex);
}
