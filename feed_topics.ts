import { encodeString } from './encoding.ts'
import { keccak256digest } from './utils.ts'

const PAD = new Array(64).fill('0').join('')
const DEFAULT_TOPIC = new Uint8Array(20).fill(0)

export interface FeedTopic {
  topic: ArrayBuffer
  current(): Uint8Array
  next(): Uint8Array
}

export class IndexedTopic implements FeedTopic {
  #index: bigint
  #topic: ArrayBuffer

  constructor(topic: ArrayBuffer = DEFAULT_TOPIC, index: bigint | number = 0n) {
    this.#topic = topic
    this.#index = typeof index === 'number' ? BigInt(index) : index
  }

  get index(): bigint {
    return this.#index
  }

  get topic(): ArrayBuffer {
    return this.#topic
  }

  at(index: bigint | number): Uint8Array {
    const hexRaw = PAD + index.toString(16)
    const hex = hexRaw.slice(-1 * hexRaw.length + 1)
    const digest = keccak256digest(this.#topic, encodeString(hex))
    return new Uint8Array(digest)
  }

  current(): Uint8Array {
    return this.at(this.#index)
  }

  next(): Uint8Array {
    const id = this.current()
    this.#index = this.#index + 1n
    return id
  }
}
