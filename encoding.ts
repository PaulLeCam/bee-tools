import { hex } from './deps.ts'

export function toHexString(src: ArrayBuffer): string {
  const input = src instanceof ArrayBuffer ? new Uint8Array(src) : src
  return hex.encodeToString(input)
}

export function decodeString(input: ArrayBuffer): string {
  return new TextDecoder().decode(input)
}

export function encodeString(input: string): Uint8Array {
  return new TextEncoder().encode(input)
}

export function decodeJSON<T = any>(input: ArrayBuffer): T {
  return JSON.parse(decodeString(input))
}

export function encodeJSON(input: any): Uint8Array {
  return encodeString(JSON.stringify(input))
}
