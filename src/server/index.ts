import { getRequestListener } from '@hono/node-server'
import { createServer } from 'node:http'
import base from './app'
import { vite } from './vite'

const port = Number(process.env.PORT) || 3000

const requestListener = getRequestListener(base.fetch)

const server = createServer((req, res) => {
  if (vite) {
    vite.middlewares(req, res, () => {
      requestListener(req, res)
    })
  } else {
    requestListener(req, res)
  }
})

server.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`)
})
