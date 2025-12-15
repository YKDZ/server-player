export function decodeBase64Url(encoded: string) {
  return Buffer.from(encoded, 'base64').toString('utf-8')
}
