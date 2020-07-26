import { CHUNK_SIZE, SECTION_SIZE } from './constants.ts'
import { concatBytes } from './deps.ts'
import { toHexString } from './encoding.ts'
import { Chunk } from './file_splitter.ts'
import { request } from './request.ts'

export interface ChunkContents {
  data: ArrayBuffer
  size: number
}

export interface ChunkMeta extends ChunkContents {
  hash: string
  level: number
  offset: number
}

export function getChunkContents(chunk: ArrayBuffer): ChunkContents {
  return {
    data: chunk.slice(8),
    size: new DataView(chunk).getUint32(0, true),
  }
}

export function getChunkHash(chunk: Chunk): string {
  return toHexString(chunk.reference)
}

export class ChunkClient {
  #url: string
  #timeout: number | undefined

  constructor(url: string, timeout?: number) {
    this.#url = `${url}/chunks/`
    this.#timeout = timeout
  }

  fetch(
    hash: string,
    init?: RequestInit,
    reqTimeout?: number,
  ): Promise<Response> {
    const req = request(`${this.#url}${hash}`, init)
    const timeout = reqTimeout ?? this.#timeout ?? 0

    if (timeout === 0) {
      // No timeout
      return req
    }

    return new Promise((resolve, reject) => {
      const timeoutID = setTimeout(() => {
        reject(new Error('Timeout'))
      }, timeout)
      req.then((res) => {
        clearTimeout(timeoutID)
        resolve(res)
      })
    })
  }

  async upload(
    hash: string,
    body: Uint8Array,
    timeout?: number,
  ): Promise<string> {
    await this.fetch(
      hash,
      {
        method: 'POST',
        headers: { 'Content-Type': 'binary/octet-stream' },
        body,
      },
      timeout,
    )
    return hash
  }

  async uploadChunk(chunk: Chunk, timeout?: number): Promise<string> {
    const body = chunk.span ? concatBytes(chunk.span, chunk.data) : chunk.data
    return await this.upload(getChunkHash(chunk), body, timeout)
  }

  async download(hash: string, timeout?: number): Promise<ArrayBuffer> {
    const res = await this.fetch(hash, undefined, timeout)
    return await res.arrayBuffer()
  }

  async downloadContents(
    hash: string,
    timeout?: number,
  ): Promise<ChunkContents> {
    const chunk = await this.download(hash, timeout)
    return getChunkContents(chunk)
  }

  async *downloadChunkMeta(
    chunk: ChunkMeta,
  ): AsyncGenerator<ChunkMeta, number> {
    if (chunk.size <= CHUNK_SIZE) {
      yield chunk
      return chunk.size
    }

    let offset = chunk.offset
    for (let i = 0; i < chunk.data.byteLength; i += SECTION_SIZE) {
      const hash = toHexString(chunk.data.slice(i, i + SECTION_SIZE))
      const data = await this.downloadContents(hash)
      const iterator = this.downloadChunkMeta({
        ...data,
        level: chunk.level + 1,
        hash,
        offset: chunk.offset,
      })
      let res = await iterator.next()
      while (!res.done) {
        yield res.value
        res = await iterator.next()
      }
      offset += res.value
    }
    return offset
  }

  async *downloadChunks(hash: string): AsyncGenerator<ArrayBuffer> {
    const rootChunk = await this.downloadContents(hash)
    const iterator = this.downloadChunkMeta({
      ...rootChunk,
      hash,
      level: 0,
      offset: 0,
    })
    for await (const chunk of iterator) {
      yield chunk.data
    }
  }
}
