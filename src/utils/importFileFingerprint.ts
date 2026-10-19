/** SHA-256 identifies an exact uploaded file without removing identical rows. */
export async function fingerprintImportFile(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Trình duyệt cần kết nối HTTPS hoặc localhost để kiểm tra tệp nhập an toàn.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
