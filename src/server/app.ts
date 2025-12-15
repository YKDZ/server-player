import { Hono } from 'hono'
import { spawn } from 'node:child_process'
import { decodeBase64Url } from './utils/decode'
import { runFFprobe } from './utils/ffmpeg'
import { compress } from 'hono/compress'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFileSync } from 'node:fs'
import { vite } from './vite'
import path from 'node:path'

const app = new Hono()

app.use(compress())
app.use(cors())

app.get('/api/metadata', async (c) => {
  const url = c.req.query('url')

  if (!url) return c.text('Missing url parameter', 400)

  const decodedUrl = decodeBase64Url(url)

  if (!decodedUrl.startsWith('http')) {
    return c.text('Invalid URL protocol', 400)
  }

  try {
    const metadata = await runFFprobe(decodedUrl)
    return c.json(metadata)
  } catch (err) {
    console.error('ffprobe error:', err)
    return c.text('Error fetching metadata', 500)
  }
})

app.get('/api/stream', async (c) => {
  const url = c.req.query('url')
  const quality = c.req.query('quality')
  const start = c.req.query('start') ?? '0'

  if (!url) return c.text('Missing url parameter', 400)

  const decodedUrl = decodeBase64Url(url)

  if (!decodedUrl.startsWith('http')) {
    return c.text('Invalid URL protocol', 400)
  }

  console.log(`Streaming: ${decodedUrl}, quality=${quality}, start=${start}`)

  const headers: Record<string, string> = {
    'Content-Type': quality === 'audio' ? 'audio/mpeg' : 'video/mp4',
    'Cache-Control': 'no-cache',
  }

  const useHwAccel = process.env.HW_ACCEL === 'true' || process.env.HW_ACCEL === '1'

  const args: string[] = ['-loglevel', 'error']

  if (start !== '0') {
    args.push('-ss', start)
  }

  if (decodedUrl.startsWith('http')) {
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5')
  }

  args.push('-i', decodedUrl)

  if (quality === 'audio') {
    args.push('-vn', '-c:a', 'libmp3lame', '-f', 'mp3', 'pipe:1')
  } else if (useHwAccel) {
    args.push(
      '-hwaccel',
      'vaapi',
      '-hwaccel_device',
      '/dev/dri/renderD128',
      '-hwaccel_output_format',
      'vaapi',
      '-c:v',
      'h264_vaapi',
      '-c:a',
      'aac',
      '-movflags',
      'frag_keyframe+empty_moov',
    )

    if (quality === '1080p') args.push('-vf', 'scale_vaapi=w=-2:h=1080')
    if (quality === '720p') args.push('-vf', 'scale_vaapi=w=-2:h=720')
    if (quality === '480p') args.push('-vf', 'scale_vaapi=w=-2:h=480')

    args.push('-f', 'mp4', 'pipe:1')
  } else {
    args.push(
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-preset',
      'ultrafast',
      '-crf',
      '23',
      '-movflags',
      'frag_keyframe+empty_moov',
    )

    if (quality === '1080p') args.push('-vf', 'scale=-2:1080')
    if (quality === '720p') args.push('-vf', 'scale=-2:720')
    if (quality === '480p') args.push('-vf', 'scale=-2:480')

    args.push('-f', 'mp4', 'pipe:1')
  }

  console.log('ffmpeg', args.join(' '))

  const ffmpeg = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  ffmpeg.stderr.on('data', (d) => {
    console.error('[ffmpeg]', d.toString())
  })

  ffmpeg.on('close', (code) => {
    console.log('ffmpeg exited with', code)
  })

  return new Response(ffmpeg.stdout, { headers })
})

if (import.meta?.env?.PROD) {
  app.use('*', serveStatic({ root: './dist/client' }))
} else {
  app.get('/', async (c) => {
    const indexHtmlPath = path.resolve(import.meta.dirname, '../client/index.html')
    let html = readFileSync(indexHtmlPath, 'utf-8')
    html = (await vite?.transformIndexHtml('/', html)) ?? ''
    return c.html(html)
  })
}

export default app
