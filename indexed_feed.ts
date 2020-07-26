import { ChunkClient } from './chunk_client.ts'
import { toHexString } from './encoding.ts'
import { FeedReader, FeedWriter } from './feed.ts'
import { IndexedTopic } from './feed_topics.ts'
import { Chunk } from './file_splitter.ts'
import { PrivateSigner, PublicSigner } from './signer.ts'
import { SOCReader, getAddress } from './soc.ts'

export class IndexedFeedReader extends FeedReader {
  _topic: IndexedTopic

  constructor(
    client: ChunkClient,
    owner: PublicSigner | Uint8Array,
    topic?: IndexedTopic,
  ) {
    topic || (topic = new IndexedTopic())
    super(client, owner, topic)
    this._topic = topic
  }

  async chunkAt(index: bigint | number): Promise<Chunk> {
    const id = this._topic.at(index)
    const hash = getAddress(id, this._owner.address)
    const buffer = await this._client.download(toHexString(hash))
    return SOCReader.validateFromBuffer(buffer, this._owner)
  }

  createIterator(
    initialIndex: bigint | number = 0,
  ): AsyncIterableIterator<Chunk> {
    let index =
      typeof initialIndex === 'number' ? BigInt(initialIndex) : initialIndex
    const next = async (): Promise<IteratorResult<Chunk>> => {
      const value = await this.chunkAt(index)
      index++
      return { done: false, value }
    }
    return {
      [Symbol.asyncIterator]() {
        return this
      },
      next,
    }
  }
}

export class IndexedFeedWriter extends FeedWriter {
  _topic: IndexedTopic

  constructor(
    client: ChunkClient,
    owner: PrivateSigner | Uint8Array,
    topic?: IndexedTopic,
  ) {
    topic || (topic = new IndexedTopic())
    super(client, owner, topic)
    this._topic = topic
  }

  get index(): bigint {
    return this._topic.index
  }

  async write(input: string | ArrayBuffer): Promise<string> {
    const chunk = await this.next(input)
    return await this._client.uploadChunk(chunk)
  }
}
