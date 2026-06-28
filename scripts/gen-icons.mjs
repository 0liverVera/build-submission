// Generates app icons (PNG) with a basketball mark — no external image tools.
import zlib from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const CRC = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
const png = (size, pixel) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y)
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
      raw[o++] = a
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

function basketball(size) {
  const cx = size / 2
  const cy = size / 2
  const R = size * 0.4
  const seam = size * 0.022
  const off = R * 1.5
  const curveR = R * 1.95
  return (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const d = Math.hypot(dx, dy)
    if (d > R) return [20, 24, 43, 255] // navy background
    const onV = Math.abs(dx) < seam
    const onH = Math.abs(dy) < seam
    const arcL = Math.abs(Math.hypot(x - (cx - off), dy) - curveR) < seam
    const arcR = Math.abs(Math.hypot(x - (cx + off), dy) - curveR) < seam
    if (onV || onH || arcL || arcR) return [54, 28, 12, 255] // seams
    const k = 1 - (d / R) * 0.22 // subtle edge shading
    return [(255 * k) | 0, (138 * k) | 0, (61 * k) | 0, 255]
  }
}

mkdirSync('public', { recursive: true })
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(`public/${name}`, png(size, basketball(size)))
  console.log('wrote public/' + name)
}
