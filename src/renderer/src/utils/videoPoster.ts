/**
 * Generate a poster-frame data URL for a local video file.
 *
 * Approach: build an `snfile://` URL the renderer can fetch (range requests
 * are honored by the main-process protocol handler so we don't have to
 * download the whole file), point a `<video>` element at it, seek slightly
 * past the start to skip black-frame openings, then draw the current frame
 * to a canvas and read it back as a JPEG data URL.
 *
 * Returns `null` if the video can't be decoded (codec unsupported, file
 * truncated, fetch failed, timeout, etc.) — callers should fall back to a
 * static icon in that case.
 */

const POSTER_TIMEOUT_MS = 9000
const POSTER_QUALITY = 0.7

/**
 * Convert an absolute filesystem path into an `snfile://` URL whose pathname
 * round-trips through `decodeURIComponent` back to the same path on either
 * platform. Each segment is percent-encoded so spaces, `:`, `#`, `?`, and
 * other special characters survive the trip.
 */
function pathToSnfileUrl(filePath: string): string {
  // Normalize backslashes (Windows) and strip any leading slashes — the
  // protocol handler re-prefixes `/` on POSIX and leaves Windows paths with
  // a drive letter alone.
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const encoded = normalized.split('/').map(encodeURIComponent).join('/')
  return `snfile:///${encoded}`
}

export async function generateVideoPoster(
  filePath: string,
  maxSize: number
): Promise<string | null> {
  if (typeof document === 'undefined') return null

  const url = pathToSnfileUrl(filePath)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'
  video.playsInline = true
  // Keep the element off the document tree — we only need its decoder.
  video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;'

  return await new Promise<string | null>((resolve) => {
    let settled = false

    function cleanup(): void {
      try {
        video.pause()
      } catch {
        /* noop */
      }
      video.removeAttribute('src')
      video.load()
    }

    function done(result: string | null): void {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      cleanup()
      resolve(result)
    }

    const timer = window.setTimeout(() => done(null), POSTER_TIMEOUT_MS)

    video.addEventListener('error', () => done(null))
    video.addEventListener('stalled', () => {
      // Fires when the network is idle for too long. We let the timeout
      // catch this; logging it would just be noise.
    })

    video.addEventListener(
      'loadedmetadata',
      () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0
        // Most stock-video clips have at least a frame or two of black at the
        // very start, so seek a bit in. Cap at 1s; videos shorter than 0.2s
        // just get the first frame.
        const target = duration > 0.4 ? Math.min(1.0, duration * 0.1) : 0
        try {
          video.currentTime = target
        } catch {
          done(null)
        }
      },
      { once: true }
    )

    video.addEventListener(
      'seeked',
      () => {
        try {
          if (!video.videoWidth || !video.videoHeight) {
            done(null)
            return
          }
          const canvas = document.createElement('canvas')
          const longest = Math.max(video.videoWidth, video.videoHeight)
          const scale = Math.min(1, maxSize / longest)
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            done(null)
            return
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', POSTER_QUALITY)
          done(dataUrl.startsWith('data:image/') ? dataUrl : null)
        } catch {
          done(null)
        }
      },
      { once: true }
    )

    video.src = url
  })
}
