import { useEffect, useState } from 'react'
import type { AppFile } from '@renderer/types'
import { IMAGE_EXTS, VIDEO_EXTS } from '@renderer/types'
import { FileVideo2, FileImage, FileBox, FileText, FileQuestion } from 'lucide-react'

const RASTER_PREVIEWABLE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'])

export function previewSrc(file: AppFile): string | null {
  if (file.previewUrl) return file.previewUrl
  const ext = String(file.fileType).toLowerCase()
  if ((IMAGE_EXTS as readonly string[]).includes(ext) || ext === 'svg') {
    // Use the snfile:// protocol so we don't have to base64-encode large files.
    // Encode each path segment so spaces, '#', '?', and other URL-significant
    // characters don't break the protocol handler's URL parsing. The drive
    // letter on Windows (e.g. "C:") is left as-is so it survives parsing.
    const p = file.currentPath || file.originalPath
    const encoded = p
      .replace(/\\/g, '/')
      .split('/')
      .map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s)))
      .join('/')
    return `snfile:///${encoded}`
  }
  return null
}

interface Props {
  file: AppFile
  size?: number
  rounded?: number
}

export function FilePreview({ file, size = 96, rounded = 14 }: Props) {
  const src = previewSrc(file)
  const ext = String(file.fileType).toLowerCase()
  const isVideo = (VIDEO_EXTS as readonly string[]).includes(ext)
  const isVector = ext === 'svg' || ext === 'eps'

  const [imgFailed, setImgFailed] = useState(false)
  // Reset error state when the underlying file/preview source changes so a
  // newly added file always re-attempts the load instead of staying broken.
  useEffect(() => {
    setImgFailed(false)
  }, [src])

  const showImage = !!src && RASTER_PREVIEWABLE.has(ext) && !imgFailed

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
          onError={() => setImgFailed(true)}
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
