const https = require('https')
const fs = require('fs')
const path = require('path')

const files = [
  {
    url: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js',
    dest: path.join(__dirname, '..', 'vendor', 'katex.min.js'),
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css',
    dest: path.join(__dirname, '..', 'vendor', 'katex.min.css'),
  },
]

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const file = fs.createWriteStream(dest)
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download ${url}: ${res.statusCode}`))
        }
        res.pipe(file)
        file.on('finish', () => {
          file.close(() => resolve(dest))
        })
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err))
      })
  })
}

;(async () => {
  try {
    for (const f of files) {
      process.stdout.write(`Downloading ${f.url} -> ${f.dest}... `)
      await download(f.url, f.dest)
      console.log('done')
    }
    console.log('All KaTeX files downloaded into vendor/.')
  } catch (e) {
    console.error('Error downloading KaTeX files:', e.message)
    process.exit(1)
  }
})()
