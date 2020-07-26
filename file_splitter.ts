import { BMTHasher } from './bmt_hasher.ts'
import { BRANCHES, CHUNK_SIZE, SECTION_SIZE } from './constants.ts'
import { Hasher, concatBytes } from './deps.ts'
import { toHexString } from './encoding.ts'

const SPAN_SIZES = new Array(9)
const SPAN_COUNTS = new Array(9)
SPAN_SIZES[0] = CHUNK_SIZE
SPAN_COUNTS[0] = 1
for (let i = 1; i < 9; i++) {
  SPAN_SIZES[i] = BRANCHES * SPAN_SIZES[i - 1]
  SPAN_COUNTS[i] = BRANCHES * SPAN_COUNTS[i - 1]
}

function getLevelsFromLength(length: number): number {
  if (length === 0) {
    return 0
  }
  if (length <= CHUNK_SIZE) {
    return 1
  }

  const c = (length - 1) / SECTION_SIZE
  return Math.floor(Math.log(c) / Math.log(BRANCHES)) + 1
}

export interface Chunk {
  data: Uint8Array
  index: number
  level: number
  reference: Uint8Array
  span?: Uint8Array
}

export class FileSplitter implements Hasher, AsyncIterable<Chunk> {
  static singleChunk(data: ArrayBuffer): Chunk {
    const bmt = new BMTHasher(CHUNK_SIZE)
    const hash = bmt.update(data).digest()
    return {
      data: new Uint8Array(data),
      index: 0,
      level: 0,
      reference: new Uint8Array(hash),
      span: new Uint8Array(bmt.span),
    }
  }

  static hash(data: ArrayBuffer): string {
    return new FileSplitter().update(data).toString()
  }

  #buffer: Uint8Array | null = null
  #counts = new Array(9).fill(0)
  #cursors = new Array(9).fill(0)
  #data: Uint8Array = new Uint8Array(CHUNK_SIZE * 2 * 9)
  #emitChunks: boolean
  #hash: string | null = null
  #length: number = 0
  #pullQueue: Array<(chunkResult: IteratorResult<Chunk>) => void> = []
  #pushQueue: Array<Chunk> = []

  constructor(emitChunks: boolean = false) {
    this.#emitChunks = emitChunks
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Chunk> {
    return this
  }

  next(): Promise<IteratorResult<Chunk, string>> {
    return new Promise((resolve, reject) => {
      if (!this.#emitChunks) {
        reject(new Error('FileHasher instance is not setup to emit chunks'))
      } else {
        const value = this.#pushQueue.shift()
        if (value == null) {
          if (this.#hash === null) {
            this.#pullQueue.push(resolve)
          } else {
            resolve({ value: this.#hash, done: true })
          }
        } else {
          resolve({ value, done: false })
        }
      }
    })
  }

  async consume(
    iterable: AsyncIterable<ArrayBuffer | Uint8Array>,
  ): Promise<ArrayBuffer> {
    for await (const data of iterable) {
      this.update(data)
    }
    return this.digest()
  }

  consumeSync(iterable: Iterable<ArrayBuffer | Uint8Array>): ArrayBuffer {
    for (const data of iterable) {
      this.update(data)
    }
    return this.digest()
  }

  _sum(level: number): ArrayBuffer {
    this.#counts[level]++

    const spanSize = SPAN_SIZES[level]
    const span = ((this.#length - 1) % spanSize) + 1
    const size = this.#cursors[level] - this.#cursors[level + 1]
    const data = this.#data.slice(
      this.#cursors[level + 1],
      this.#cursors[level + 1] + size,
    )

    const bmt = new BMTHasher(span)
    const hash = bmt.update(data).digest()

    if (this.#emitChunks && size > 0) {
      const chunk: Chunk = {
        data,
        index: this.#counts[level] - 1,
        level,
        reference: new Uint8Array(hash),
        span: new Uint8Array(bmt.span),
      }

      const pull = this.#pullQueue.shift()
      if (pull != null) {
        pull({ value: chunk, done: false })
      } else {
        this.#pushQueue.push(chunk)
      }
    }

    return hash
  }

  _updateLevel(level: number, data: ArrayBuffer): void {
    if (level === 0) {
      this.#length += data.byteLength
    }
    this.#data.set(new Uint8Array(data), this.#cursors[level])
    this.#cursors[level] += data.byteLength

    if (this.#cursors[level] - this.#cursors[level + 1] === CHUNK_SIZE) {
      this._updateLevel(level + 1, this._sum(level))
      this.#cursors[level] = this.#cursors[level + 1]
    }
  }

  update(data: ArrayBuffer): this {
    const dataBytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const bytes = this.#buffer
      ? concatBytes(this.#buffer, dataBytes)
      : dataBytes

    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const length = bytes.length - i
      if (length < CHUNK_SIZE) {
        this.#buffer = new Uint8Array(length)
        this.#buffer.set(bytes.slice(i, i + length))
      } else {
        this._updateLevel(0, bytes.slice(i, i + CHUNK_SIZE))
      }
    }

    return this
  }

  digest(): ArrayBuffer {
    if (this.#hash !== null) {
      throw new Error('Hash already digested')
    }

    if (this.#buffer != null && this.#buffer.byteLength !== 0) {
      this._updateLevel(0, this.#buffer)
      const hash = this._sum(0)
      this.#data.set(new Uint8Array(hash), this.#cursors[1])
      this.#cursors[1] += SECTION_SIZE
      this.#cursors[0] = this.#cursors[1]
    }

    const levels = getLevelsFromLength(this.#length)
    for (let i = 1; i < levels; i++) {
      if (this.#counts[i] > 0) {
        if (this.#counts[i - 1] - SPAN_COUNTS[levels - i - 1] <= 1) {
          this.#cursors[i + 1] = this.#cursors[i]
          this.#cursors[i] = this.#cursors[i - 1]
          continue
        }
      }

      const ref = new Uint8Array(this._sum(i))
      this.#data.set(ref, this.#cursors[i + 1])
      this.#cursors[i + 1] += ref.length
      this.#cursors[i] = this.#cursors[i + 1]
    }

    const digest = this.#data.slice(0, SECTION_SIZE)
    this.#hash = toHexString(digest)
    return digest
  }

  toString(): string {
    if (this.#hash !== null) {
      return this.#hash
    }

    this.#hash = toHexString(this.digest())
    return this.#hash
  }
}
