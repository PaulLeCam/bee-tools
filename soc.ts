import { BMTHasher } from './bmt_hasher.ts'
import {
  CHUNK_SIZE,
  SOC_ID_LENGTH,
  SOC_SIGNATURE_LENGTH,
  SPAN_SIZE,
} from './constants.ts'
import { equalBytes } from './deps.ts'
import { Chunk } from './file_splitter.ts'
import { PrivateSigner, PublicSigner, fromDER, toDER } from './signer.ts'
import { keccak256digest } from './utils.ts'

const HEADER_LENGTH = SOC_ID_LENGTH + SOC_SIGNATURE_LENGTH + SPAN_SIZE

export function getAddress(
  id: Uint8Array,
  ownerAddress: ArrayBuffer,
): Uint8Array {
  return new Uint8Array(keccak256digest(id, ownerAddress))
}

export class SOCReader {
  static fromBuffer(input: ArrayBuffer): SOCReader | undefined {
    const buffer = new Uint8Array(input)
    let cursor = 0

    const id = buffer.slice(cursor, cursor + SOC_ID_LENGTH)
    cursor += SOC_ID_LENGTH

    const recovery = buffer[cursor] - 31
    cursor++

    const signature = toDER(
      buffer.slice(cursor, cursor + SOC_SIGNATURE_LENGTH - 1),
    )
    cursor += SOC_SIGNATURE_LENGTH - 1

    const span = buffer.slice(cursor, cursor + SPAN_SIZE)
    cursor += SPAN_SIZE

    const data = buffer.slice(cursor)
    const reference = new Uint8Array(BMTHasher.digest(span, data))
    const digest = new Uint8Array(keccak256digest(id, reference))
    const owner = PublicSigner.fromRecovery(digest, signature, recovery)

    if (owner != null) {
      const chunk = { level: 0, index: 0, span, reference, data }
      return new SOCReader(id, chunk, owner)
    }
  }

  static validateFromBuffer(
    buffer: ArrayBuffer,
    owner: ArrayBuffer | Uint8Array | PublicSigner,
  ): Chunk {
    const soc = SOCReader.fromBuffer(buffer)
    if (soc == null) {
      throw new Error('Could not parse Single-Owner Chunk')
    }
    if (!soc.validate(owner)) {
      throw new Error('Chunk owner verification failed')
    }
    return soc.chunk
  }

  _id: Uint8Array
  _owner: PublicSigner

  chunk: Chunk

  constructor(id: Uint8Array, chunk: Chunk, owner: PublicSigner) {
    this._id = id
    this._owner = owner
    this.chunk = chunk
  }

  get owner(): PublicSigner {
    return this._owner
  }

  getAddress(): Uint8Array {
    return getAddress(this._id, this._owner.address)
  }

  validate(owner: ArrayBuffer | Uint8Array | PublicSigner): boolean {
    const address = owner instanceof PublicSigner ? owner.address : owner
    return equalBytes(
      new Uint8Array(address),
      new Uint8Array(this._owner.address),
    )
  }
}

export class SOCWriter extends SOCReader {
  static async toOwnerChunk(
    id: Uint8Array,
    chunk: Chunk,
    owner: PrivateSigner,
  ): Promise<Chunk> {
    const writer = new SOCWriter(id, chunk, owner)
    return await writer.toOwnerChunk()
  }

  _owner: PrivateSigner

  constructor(id: Uint8Array, chunk: Chunk, owner: PrivateSigner) {
    super(id, chunk, owner)
    this._owner = owner
  }

  get owner(): PrivateSigner {
    return this._owner
  }

  async toOwnerChunk(): Promise<Chunk> {
    const length = HEADER_LENGTH + this.chunk.data.length
    if (length > CHUNK_SIZE) {
      throw new Error(`Chunk size exceeds max size of ${CHUNK_SIZE} bytes`)
    }

    const digest = keccak256digest(this._id, this.chunk.reference)
    const [signature, recovery] = await this._owner.sign(new Uint8Array(digest))

    const buffer = new Uint8Array(length)
    let cursor = 0
    // ID
    buffer.set(this._id, cursor)
    cursor += SOC_ID_LENGTH
    // Signature recovery
    buffer.set(Uint8Array.of(recovery + 31), cursor)
    cursor++
    // Signature
    buffer.set(fromDER(signature), cursor)
    cursor += SOC_SIGNATURE_LENGTH - 1
    // Span
    buffer.set(this.chunk.span ?? Uint8Array.of(0), cursor)
    cursor += SPAN_SIZE
    // Data
    buffer.set(this.chunk.data, cursor)

    return {
      level: 0,
      index: 0,
      reference: this.getAddress(),
      data: buffer,
    }
  }
}
