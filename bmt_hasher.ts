import { CHUNK_SIZE, SECTION_SIZE } from './constants.ts'
import { Hasher } from './deps.ts'
import { toHexString } from './encoding.ts'
import { keccak256digest } from './utils.ts'

const TWO_SECTIONS = 2 * SECTION_SIZE

export class BMTHasher implements Hasher {
  static digest(
    length: ArrayBuffer | Uint8Array | number | bigint,
    data: Uint8Array,
  ): ArrayBuffer {
    const hasher = new BMTHasher(length)
    return hasher.update(data).digest()
  }

  #data: Uint8Array
  #digested: boolean = false
  #length: number = 0
  #span: ArrayBuffer

  constructor(length: ArrayBuffer | Uint8Array | number | bigint) {
    if (length instanceof ArrayBuffer) {
      this.#span = length
    } else if (length instanceof Uint8Array) {
      this.#span = length.buffer
    } else {
      if (typeof length === 'number') {
        length = BigInt(length)
      }
      if (typeof length !== 'bigint') {
        throw new Error('Invalid length')
      }
      this.#span = new ArrayBuffer(8)
      new DataView(this.#span).setBigInt64(0, length, true)
    }
    this.#data = new Uint8Array(new ArrayBuffer(CHUNK_SIZE)).fill(0)
  }

  get span() {
    return this.#span
  }

  update(data: ArrayBuffer): this {
    const bytes = new Uint8Array(data)
    const length = this.#length + bytes.length
    if (length > CHUNK_SIZE) {
      throw new Error(`Exceeded max size: ${length}/${CHUNK_SIZE}`)
    }
    this.#data.set(bytes, this.#length)
    this.#length += bytes.length
    return this
  }

  digest(): ArrayBuffer {
    if (this.#digested) {
      throw new Error('Hash already digested')
    }
    this.#digested = true

    for (let i = CHUNK_SIZE; i > SECTION_SIZE; i /= 2) {
      for (let j = 0; j < i; j += TWO_SECTIONS) {
        const ref = keccak256digest(this.#data.slice(j, j + TWO_SECTIONS))
        this.#data.set(new Uint8Array(ref), j / 2)
      }
    }

    const ref = new ArrayBuffer(SECTION_SIZE)
    const view = new DataView(ref)
    for (let i = 0; i < SECTION_SIZE; i++) {
      view.setUint8(i, this.#data[i])
    }

    return keccak256digest(this.#span, ref)
  }

  toString(): string {
    return toHexString(this.digest())
  }
}
