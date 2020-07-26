import { BzzClient } from './bzz_client.ts'
import {
  decodeJSON,
  decodeString,
  encodeJSON,
  encodeString,
} from './encoding.ts'
import { IndexedTopic } from './feed_topics.ts'
import { IndexedFeedReader, IndexedFeedWriter } from './indexed_feed.ts'
import { PrivateSigner, PublicSigner } from './signer.ts'

class DataList<T = any> {
  _client: BzzClient
  _feed: T

  constructor(client: BzzClient, feed: T) {
    this._client = client
    this._feed = feed
  }
}

export class DataListReader<T = any> extends DataList<IndexedFeedReader> {
  constructor(
    client: BzzClient,
    owner: PublicSigner | Uint8Array,
    topic?: IndexedTopic,
  ) {
    super(client, new IndexedFeedReader(client.chunkClient, owner, topic))
  }

  async at(index: bigint | number, timeout?: number): Promise<T> {
    const feedChunk = await this._feed.chunkAt(index)
    const dataHash = decodeString(feedChunk.data)
    const data = await this._client.download(dataHash, timeout)
    return decodeJSON<T>(data)
  }

  createIterator(
    initialIndex: bigint | number = 0,
    timeout?: number,
  ): AsyncIterableIterator<T> {
    let index =
      typeof initialIndex === 'number' ? BigInt(initialIndex) : initialIndex
    const next = async (): Promise<IteratorResult<T>> => {
      const value = await this.at(index, timeout)
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

export class DataListWriter<T = any> extends DataList<IndexedFeedWriter> {
  constructor(
    client: BzzClient,
    owner: PrivateSigner | Uint8Array,
    topic?: IndexedTopic,
  ) {
    super(client, new IndexedFeedWriter(client.chunkClient, owner, topic))
  }

  async write(input: T): Promise<string> {
    const bytes = encodeJSON(input)
    const dataHash = await this._client.uploadFile(bytes)
    const toWrite = encodeString(dataHash)
    return await this._feed.write(toWrite)
  }
}
