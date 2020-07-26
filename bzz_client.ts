import { ChunkClient } from './chunk_client.ts'
import { encodeString } from './encoding.ts'
import { Chunk, FileSplitter } from './file_splitter.ts'
import { consumeAsyncIterator } from './utils.ts'

export class BzzClient {
  #chunk: ChunkClient

  constructor(url: string) {
    this.#chunk = new ChunkClient(url)
  }

  get chunkClient(): ChunkClient {
    return this.#chunk
  }

  async downloadChunk(hash: string, timeout?: number): Promise<ArrayBuffer> {
    return this.#chunk.download(hash, timeout)
  }

  downloadChunks(hash: string): AsyncGenerator<ArrayBuffer> {
    return this.#chunk.downloadChunks(hash)
  }

  async download(hash: string, timeout?: number): Promise<ArrayBuffer> {
    const { data } = await this.#chunk.downloadContents(hash, timeout)
    return data
  }

  async uploadChunk(chunk: Chunk, timeout?: number): Promise<string> {
    return await this.#chunk.uploadChunk(chunk, timeout)
  }

  async *uploadChunksGenerator(
    iterable: AsyncIterable<Chunk>,
  ): AsyncGenerator<string> {
    for await (const chunk of iterable) {
      yield this.uploadChunk(chunk)
    }
  }

  async uploadChunks(iterable: AsyncIterable<Chunk>): Promise<void> {
    const iterator = this.uploadChunksGenerator(iterable)
    return consumeAsyncIterator(iterator)
  }

  async *uploadFileGenerator(
    file: ArrayBuffer | string,
  ): AsyncGenerator<string, string> {
    const data = typeof file === 'string' ? encodeString(file) : file
    const splitter = new FileSplitter(true).update(data)
    const hash = splitter.toString()
    for await (const chunkHash of this.uploadChunksGenerator(splitter)) {
      yield chunkHash
    }
    return hash
  }

  async uploadFile(file: ArrayBuffer | string): Promise<string> {
    const iterator = this.uploadFileGenerator(file)
    return consumeAsyncIterator(iterator)
  }

  async uploadFileIterable(
    iterable: AsyncIterable<ArrayBuffer>,
  ): Promise<string> {
    const splitter = new FileSplitter(true)
    await Promise.all([splitter.consume(iterable), this.uploadChunks(splitter)])
    return splitter.toString()
  }
}
