import { secp } from './deps.ts'
import { keccak256digest } from './utils.ts'

const DER_HEADER_BYTES = Uint8Array.from([48, 68])
const DER_LENGTH_BYTES = Uint8Array.from([2, 32])
const PART_LENGTH = 32
const SIGNATURE_LENGTH = PART_LENGTH * 2

export function publicKeyToAddress(publicKey: ArrayBuffer): ArrayBuffer {
  const key = publicKey.byteLength === 65 ? publicKey.slice(1) : publicKey
  return keccak256digest(key).slice(-20)
}

export function fromDER(input: Uint8Array): Uint8Array {
  const output = new Uint8Array(SIGNATURE_LENGTH)
  const rLength = input[DER_HEADER_BYTES.length + 1]
  const rOffset =
    DER_HEADER_BYTES.length + DER_LENGTH_BYTES.length + rLength - PART_LENGTH
  output.set(input.slice(rOffset, rOffset + PART_LENGTH))
  const sLength = input[rOffset + PART_LENGTH + 1]
  const sOffset = rOffset + sLength + 2
  output.set(input.slice(sOffset), PART_LENGTH)
  return output
}

export function toDER(input: Uint8Array): Uint8Array {
  const output = new Uint8Array(70)
  let cursor = 0
  output.set(DER_HEADER_BYTES, cursor)
  cursor += DER_HEADER_BYTES.length
  output.set(DER_LENGTH_BYTES, cursor)
  cursor += DER_HEADER_BYTES.length
  output.set(input.slice(0, PART_LENGTH), cursor)
  cursor += PART_LENGTH
  output.set(DER_LENGTH_BYTES, cursor)
  cursor += DER_LENGTH_BYTES.length
  output.set(input.slice(32), cursor)
  return output
}

export class PublicSigner {
  static fromRecovery(
    messageHash: Uint8Array,
    signature: Uint8Array,
    recovery: number,
  ): PublicSigner | undefined {
    const publicKey = secp.recoverPublicKey(messageHash, signature, recovery)
    if (publicKey != null) {
      return new PublicSigner(publicKey)
    }
  }

  #publicKey: Uint8Array
  #address: ArrayBuffer | undefined

  constructor(publicKey: Uint8Array) {
    this.#publicKey = publicKey
  }

  get publicKey(): Uint8Array {
    return this.#publicKey
  }

  get address(): ArrayBuffer {
    if (this.#address == null) {
      this.#address = publicKeyToAddress(this.#publicKey)
    }
    return this.#address
  }

  verify(signature: Uint8Array, messageHash: Uint8Array): boolean {
    return secp.verify(signature, messageHash, this.#publicKey)
  }
}

export class PrivateSigner extends PublicSigner {
  static create(): PrivateSigner {
    return new PrivateSigner(secp.utils.randomPrivateKey())
  }

  #privateKey: Uint8Array

  constructor(privateKey: Uint8Array, publicKey?: Uint8Array) {
    super(publicKey ?? secp.getPublicKey(privateKey))
    this.#privateKey = privateKey
  }

  getSharedSecret(other: Uint8Array | PublicSigner): Uint8Array {
    const pubKey = other instanceof PublicSigner ? other.publicKey : other
    return secp.getSharedSecret(this.#privateKey, pubKey) as Uint8Array
  }

  async sign(messageHash: Uint8Array): Promise<[Uint8Array, number]> {
    return await secp.sign(messageHash, this.#privateKey, {
      canonical: true,
      recovered: true,
    })
  }
}
