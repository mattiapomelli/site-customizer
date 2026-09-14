// Generates the extension icons (a slider glyph) so there is nothing binary to
// commit by hand. Run with `node scripts/icons.mjs`.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, pixel) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4 + 1)
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size)
      row.set([r, g, b, a], 1 + x * 4)
    }
    rows.push(row)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Rounded square in accent blue, with two slider tracks + knobs in white. */
function icon(x, y, size) {
  const u = size / 24
  const radius = 5 * u
  const inset = 1.5 * u
  const max = size - inset

  // Rounded-rect coverage.
  const cx = Math.min(Math.max(x + 0.5, inset + radius), max - radius)
  const cy = Math.min(Math.max(y + 0.5, inset + radius), max - radius)
  const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
  const alpha = Math.round(255 * Math.min(1, Math.max(0, radius - dist + 0.5)))
  if (alpha === 0) return [0, 0, 0, 0]

  // Sliders: two horizontal tracks with a knob on each.
  const white = (() => {
    for (const [ty, knobX] of [
      [9 * u, 15 * u],
      [15 * u, 9 * u],
    ]) {
      const onTrack =
        Math.abs(y + 0.5 - ty) <= 1 * u && x + 0.5 >= 5.5 * u && x + 0.5 <= 18.5 * u
      const onKnob = Math.hypot(x + 0.5 - knobX, y + 0.5 - ty) <= 2.6 * u
      if (onKnob || onTrack) return true
    }
    return false
  })()

  return white ? [255, 255, 255, alpha] : [37, 99, 235, alpha]
}

mkdirSync('icons', { recursive: true })
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join('icons', `icon${size}.png`), png(size, icon))
}
console.log('icons written')
