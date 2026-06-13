export function base64Encode(bytes: Uint8Array) {
  // Works in React Native + web.
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  // eslint-disable-next-line no-undef
  return globalThis.btoa(binary);
}

