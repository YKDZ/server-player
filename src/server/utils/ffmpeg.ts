import { spawn } from 'node:child_process'

export function runFFprobe(url: string): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', url]

    const proc = spawn('ffprobe', args)

    let output = ''
    let error = ''

    proc.stdout.on('data', (d) => (output += d))
    proc.stderr.on('data', (d) => (error += d))

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(error || `ffprobe exited with ${code}`))
        return
      }
      const json = JSON.parse(output)
      resolve({ duration: Number(json.format.duration) })
    })
  })
}
