import { Application } from './deps.ts'

import { fileRouter } from './file_router.ts'

const port = 8000
const app = new Application()

app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  const rt = `${ms}ms`
  ctx.response.headers.set('X-Response-Time', rt)
  console.log(
    `${ctx.request.method} ${ctx.request.url} - ${ctx.response.status} / ${rt}`,
  )
})

app.use(fileRouter.routes())
app.use(fileRouter.allowedMethods())

app.addEventListener('listen', () => {
  console.log(`Listening on port ${port}`)
})

await app.listen({ port })
