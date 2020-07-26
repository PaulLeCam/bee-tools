import { BzzClient } from '../mod.ts'

import { Router, RouterContext, Status } from './deps.ts'
import { iteratorToReader, json } from './utils.ts'

const bzzClient = new BzzClient('http://localhost:8080')

export const fileRouter = new Router()

fileRouter.post('/', async (ctx: RouterContext) => {
  const body = ctx.request.body({ type: 'reader' })
  const chunks = Deno.iter(body.value)
  const hash = await bzzClient.uploadFileIterable(chunks)
  json(ctx, { hash })
})

fileRouter.get('/:hash', async (ctx: RouterContext<{ hash: string }>) => {
  const hash = ctx.params?.hash
  try {
    await bzzClient.downloadChunk(hash)
    ctx.response.status = Status.OK
    ctx.response.type = 'application/octet-stream'
    ctx.response.body = iteratorToReader(bzzClient.downloadChunks(hash))
  } catch (err) {
    ctx.response.status = err.status ?? Status.BadGateway
  }
})
