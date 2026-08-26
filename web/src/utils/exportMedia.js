// 媒体导出：WAV(合成演示音轨) / MP4(思维导图自动巡演演示视频)
// 纯前端实现，无 ffmpeg.wasm 依赖：
//   - MP4 使用浏览器 WebCodecs VideoEncoder + mp4-muxer 封装（Electron/Chromium 114+ 支持）
//   - WAV 使用 Web Audio OfflineAudioContext 合成
// mp4-muxer 改为运行时动态 import()，避免打进主包影响构建速度。

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// 把整张思维导图 PNG 做成缓慢放大 + 平移的 Ken Burns 巡演效果
function drawFrame(ctx, img, W, H, t) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  const fit = Math.min(W / img.width, H / img.height)
  const scale = fit * (1 + 0.6 * t)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = (W - dw) / 2 - W * 0.12 * t
  const dy = (H - dh) / 2 - H * 0.08 * t
  ctx.drawImage(img, dx, dy, dw, dh)
}

// ============ MP4 ============

export async function exportMP4(mindMap, name) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('当前环境不支持 WebCodecs（需要 Chromium 94+ / Electron 25+）')
  }
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const pngDataUrl = await mindMap.doExport.png(name, false, null, false)
  const img = await loadImage(pngDataUrl)
  const width = 1280
  const height = 720
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory'
  })

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error', e)
  })
  encoder.configure({
    codec: 'avc1.42001f',
    width,
    height,
    bitrate: 2000000,
    framerate: 30
  })

  const durationSec = 8
  const fps = 30
  const total = durationSec * fps
  for (let i = 0; i < total; i++) {
    drawFrame(ctx, img, width, height, i / total)
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i / fps) * 1e6),
      duration: Math.round((1 / fps) * 1e6)
    })
    encoder.encode(frame)
    frame.close()
    // 让出事件循环，避免阻塞 UI / 编码器背压
    await new Promise((r) => setTimeout(r, 0))
  }
  await encoder.flush()
  muxer.finalize()
  return new Blob([muxer.target.buffer], { type: 'video/mp4' })
}

// ============ WAV ============

function audioBufferToWavBlob(buffer) {
  const numCh = buffer.numberOfChannels
  const sr = buffer.sampleRate
  const dataLen = buffer.length * numCh * 2
  const ab = new ArrayBuffer(44 + dataLen)
  const view = new DataView(ab)
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataLen, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, sr, true)
  view.setUint32(28, sr * numCh * 2, true)
  view.setUint16(32, numCh * 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataLen, true)
  const chData = []
  for (let c = 0; c < numCh; c++) chData.push(buffer.getChannelData(c))
  let off = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chData[c][i]))
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      off += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

// 合成一段演示音轨：巡演过程中每隔 1 秒一个柔和的提示音
export async function exportWAV(mindMap, name) {
  const durationSec = 8
  const sampleRate = 44100
  const ctx = new OfflineAudioContext(1, sampleRate * durationSec, sampleRate)
  const master = ctx.createGain()
  master.gain.value = 0.35
  master.connect(ctx.destination)
  for (let t = 0; t < durationSec; t++) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = t === 0 ? 523.25 : 659.25 // C5 / E5 交替
    const g = ctx.createGain()
    const start = t + 0.1
    const dur = 0.25
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(0.6, start + 0.03)
    g.gain.linearRampToValueAtTime(0, start + dur)
    osc.connect(g)
    g.connect(master)
    osc.start(start)
    osc.stop(start + dur)
  }
  const rendered = await ctx.startRendering()
  return audioBufferToWavBlob(rendered)
}

export const EXTRA_MEDIA_TYPES = ['wav', 'mp4']
export { downloadBlob }
