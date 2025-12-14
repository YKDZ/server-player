import express from 'express'
import cors from 'cors'
import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = 3000

app.use(cors())
app.use(express.json())

app.get('/api/stream', async (req, res) => {
  try {
    const { url, quality, start } = req.query

    if (!url || typeof url !== 'string') {
      res.status(400).send('Missing or invalid url parameter')
      return
    }

    const decodedUrl = Buffer.from(url, 'base64').toString('utf-8')
    const startTime = start ? String(start) : '0'

    console.log(`Streaming: ${decodedUrl}, Quality: ${quality}, Start: ${startTime}`)

    // Basic validation of the URL to ensure it's a http/https link
    if (!decodedUrl.startsWith('http')) {
      res.status(400).send('Invalid URL protocol')
      return
    }

    // Set headers for streaming
    res.setHeader('Content-Type', quality === 'audio' ? 'audio/mpeg' : 'video/mp4')
    // We don't know the content length, so we can't set it.
    // Transfer-Encoding: chunked is automatic in Node.js when no Content-Length is set.

    const ffmpegCommand = ffmpeg()

    // Input options
    ffmpegCommand.input(decodedUrl)

    // Seek to start time
    if (startTime !== '0') {
      ffmpegCommand.inputOptions(`-ss ${startTime}`)
    }

    // Quality settings
    if (quality === 'audio') {
      ffmpegCommand.noVideo().audioCodec('libmp3lame').format('mp3')
    } else {
      const useHwAccel = process.env.HW_ACCEL === 'true' || process.env.HW_ACCEL === '1'

      if (useHwAccel) {
        console.log('Using Hardware Acceleration (VAAPI)')
        ffmpegCommand
          .inputOptions([
            '-hwaccel vaapi',
            '-hwaccel_device /dev/dri/renderD128',
            '-hwaccel_output_format vaapi',
          ])
          .videoCodec('h264_vaapi')
          .audioCodec('aac')
          .format('mp4')
          .outputOptions(['-movflags frag_keyframe+empty_moov'])

        let scaleFilter = ''
        if (quality === '1080p') scaleFilter = 'scale_vaapi=w=-2:h=1080'
        else if (quality === '720p') scaleFilter = 'scale_vaapi=w=-2:h=720'
        else if (quality === '480p') scaleFilter = 'scale_vaapi=w=-2:h=480'

        if (scaleFilter) {
          ffmpegCommand.outputOptions(`-vf ${scaleFilter}`)
        }
      } else {
        ffmpegCommand.videoCodec('libx264').audioCodec('aac').format('mp4').outputOptions([
          '-movflags frag_keyframe+empty_moov', // Essential for streaming MP4
          '-preset ultrafast', // Low latency
          '-crf 23', // Reasonable quality
        ])

        if (quality === '1080p') {
          ffmpegCommand.size('?x1080')
        } else if (quality === '720p') {
          ffmpegCommand.size('?x720')
        } else if (quality === '480p') {
          ffmpegCommand.size('?x480')
        }
        // Default or 'original' keeps original size
      }
    }

    ffmpegCommand
      .on('start', (commandLine) => {
        console.log('Spawned Ffmpeg with command: ' + commandLine)
      })
      .on('error', (err) => {
        console.error('An error occurred: ' + err.message)
        if (!res.headersSent) {
          res.status(500).send('Streaming error')
        } else {
          res.end()
        }
      })
      .on('end', () => {
        console.log('Processing finished !')
      })

    // Pipe to response
    ffmpegCommand.pipe(res, { end: true })
  } catch (error) {
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
})

// Serve static files from the frontend build
app.use(express.static(path.join(__dirname, '../dist')))

// Handle SPA routing
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})
