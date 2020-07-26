import { createHash } from './deps.ts'

export async function consumeAsyncIterator<T = any, TReturn = any>(
  iterator: AsyncIterator<T, TReturn>,
): Promise<TReturn> {
  let res = await iterator.next()
  while (!res.done) {
    res = await iterator.next()
  }
  return res.value
}

export function createKeccak256Hash() {
  return createHash('keccak256')
}

export function keccak256digest(...args: Array<ArrayBuffer>): ArrayBuffer {
  const hash = createKeccak256Hash()
  for (const data of args) {
    hash.update(data)
  }
  return hash.digest()
}
