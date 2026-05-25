import { useEffect, useRef, useState } from 'react'
import type { AppFile } from '@renderer/types'
import { IMAGE_EXTS, VIDEO_EXTS } from '@renderer/types'
import { FileVideo2, FileImage, FileBox, FileText, FileQuestion } from 'lucide-react'

const RASTER_PREVIEWABLE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'])

// Cache resolved data URLs by file path so re-renders or re-mounts of
// `FilePreview` don't trigger another IPC round-trip / disk read for the
// same file. Keyed on the resolved `currentPath || originalPath` so renames
// invalidate the cache automatically.
const thumbnailCache = new Map<string, string>()

function snfileUrl(filePath: string): string {
  return `snfile:///${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}

interface Props {
  file: AppFile
  size?: number
  rounded?: number
}

export function FilePreview({ file, size = 96, rounded = 14 }: Props) {
  const ext = String(file.fileType).toLowerCase()
  const isVideo = (VIDEO_EXTS as readonly string[]).includes(ext)
  const isVector = ext === 'svg' || ext === 'eps'
  const previewable = (IMAGE_EXTS as readonly string[]).includes(ext) || ext === 'svg'
  const sourcePath = file.currentPath || file.originalPath

  // Use the explicit `previewUrl` if the file already carries one (e.g. from
  // an external thumbnail service), otherwise we resolve a base64 data URL via
  // the main process. We do this through the IPC layer rather than exposing a
  // protocol like `snfile://` because protocol handlers have proven flaky in
  // production builds across Windows path encodings, while `nativeImage` +
  // raw fs.readFile is identical in dev and packaged binaries.
  const initial = file.previewUrl ?? (previewable ? thumbnailCache.get(sourcePath) ?? null : null)
  const [src, setSrc] = useState<string | null>(initial ?? null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  // Track the latest path we requested so an in-flight IPC for an old path
  // doesn't overwrite the state of a newer one when scrolling rapidly through
  // a large queue.
  const requestedFor = useRef<string | null>(null)

  useEffect(() => {
    const deferSetSrc = (next: string | null) => queueMicrotask(() => setSrc(next))
    if (file.previewUrl) {
      deferSetSrc(file.previewUrl)
      return
    }
    if (isVideo) {
      deferSetSrc(snfileUrl(sourcePath))
      return
    }
    if (!previewable) {
      deferSetSrc(null)
      return
    }
    const cached = thumbnailCache.get(sourcePath)
    if (cached) {
      deferSetSrc(cached)
      return
    }
    deferSetSrc(null)
    requestedFor.current = sourcePath
    const targetPath = sourcePath
    const targetMax = Math.max(96, size * 2)
    void window.api
      .readThumbnail({ path: targetPath, maxSize: targetMax })
      .then((res) => {
        if (requestedFor.current !== targetPath) return
        if (res.ok && res.dataUrl) {
          thumbnailCache.set(targetPath, res.dataUrl)
          setSrc(res.dataUrl)
        } else {
          setSrc(snfileUrl(targetPath))
        }
      })
      .catch(() => {
        if (requestedFor.current !== targetPath) return
        setSrc(snfileUrl(targetPath))
      })
  }, [sourcePath, file.previewUrl, previewable, isVideo, size])

  const failedCurrent = failedFor === sourcePath
  const showImage = !!src && RASTER_PREVIEWABLE.has(ext) && !failedCurrent
  const showVideo = !!src && isVideo && !failedCurrent

  const placeholderIcon = isVideo ? (
    <FileVideo2 size={Math.round(size * 0.42)} />
  ) : ext === 'eps' ? (
    <FileBox size={Math.round(size * 0.42)} />
  ) : isVector ? (
    <FileImage size={Math.round(size * 0.42)} />
  ) : RASTER_PREVIEWABLE.has(ext) ? (
    <FileImage size={Math.round(size * 0.42)} />
  ) : ext ? (
    <FileText size={Math.round(size * 0.42)} />
  ) : (
    <FileQuestion size={Math.round(size * 0.42)} />
  )

  return (
    <div
      className="glass-soft"
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
        background: 'rgba(255,255,255,0.55)'
      }}
    >
      {showImage ? (
        <img
          src={src!}
          alt={file.originalFilename}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
          onError={() => setFailedFor(sourcePath)}
        />
      ) : showVideo ? (
        <video
          src={src!}
          muted
          preload="metadata"
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
          onError={() => setFailedFor(sourcePath)}
        />
      ) : (
        <div
          style={{
            color: 'var(--c-text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4
          }}
        >
          {placeholderIcon}
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>
            {ext.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  )
}
