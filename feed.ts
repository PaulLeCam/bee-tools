import { ChunkClient } from './chunk_client.ts'
import { encodeString } from './encoding.ts'
import { FeedTopic } from './feed_topics.ts'
import { Chunk, FileSplitter } from './file_splitter.ts'
import { PrivateSigner, PublicSigner } from './signer.ts'
import { SOCReader, SOCWriter } from './soc.ts'

export class FeedReader {
  _client: ChunkClient
  _owner: PublicSigner
  _topic: FeedTopic

  constructor(
    client: ChunkClient,
    owner: PublicSigner | Uint8Array,
    topic: FeedTopic,
  ) {
    this._client = client
    this._owner =
      owner instanceof PublicSigner ? owner : new PublicSigner(owner)
    this._topic = topic
  }

  get owner(): PublicSigner {
    return this._owner
  }

  get topic(): ArrayBuffer {
    return this._topic.topic
  }

  async load(hash: string): Promise<Chunk> {
    const buffer = await this._client.download(hash)
    const soc = SOCReader.fromBuffer(buffer)
    if (soc == null) {
      throw new Error('Could not parse Single-Owner Chunk')
    }
    if (!soc.validate(this.owner)) {
      throw new Error('Chunk owner verification failed')
    }
    return soc.chunk
  }
}

export class FeedWriter extends FeedReader {
  _owner: PrivateSigner

  constructor(
    client: ChunkClient,
    owner: PrivateSigner | Uint8Array,
    topic: FeedTopic,
  ) {
    super(client, owner, topic)
    this._owner =
      owner instanceof PrivateSigner ? owner : new PrivateSigner(owner)
  }

  get owner(): PrivateSigner {
    return this._owner
  }

  async nextChunk(chunk: Chunk): Promise<Chunk> {
    return await SOCWriter.toOwnerChunk(this._topic.next(), chunk, this._owner)
  }

  async next(input: string | ArrayBuffer): Promise<Chunk> {
    const data = typeof input === 'string' ? encodeString(input) : input
    const chunk = FileSplitter.singleChunk(data)
    return await this.nextChunk(chunk)
  }
}
