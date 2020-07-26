import { concatBytes } from '../deps.ts'
import { Context, Status } from './deps.ts'

export function iteratorToReader<T extends ArrayBuffer | Uint8Array>(
  iterator: AsyncIterator<T>,
): Deno.Reader {
  let done = false
  let buffer = new Uint8Array(0)

  async function read(p: Uint8Array): Promise<number | null> {
    // No more data to pull or buffered
    if (done && buffer.length === 0) {
      return null
    }

    // Buffered data can fill the requested length
    if (buffer.length >= p.length) {
      p.set(buffer.subarray(0, p.length))
      buffer = buffer.subarray(p.length)
      return p.length
    }

    const res = await iterator.next()
    if (res.done) {
      // No more data available to pull, push data remaining in buffer
      done = true
      const length = buffer.length
      if (length === 0) {
        return null
      }
      p.set(buffer)
      buffer = new Uint8Array(0)
      return length
    }

    // Add pulled data to buffer and push as many bytes as possible
    buffer = concatBytes(buffer, new Uint8Array(res.value))
    const length = Math.min(p.length, buffer.length)
    p.set(buffer.subarray(0, length))
    buffer = buffer.subarray(length)
    return length
  }

  return { read }
}

export function json(ctx: Context, body = {}, status = Status.OK) {
  ctx.response.body = body
  ctx.response.status = status
  ctx.response.type = 'json'
}
