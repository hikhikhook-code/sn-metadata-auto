import { useEffect, useState } from 'react'
import type { AppFile } from '@renderer/types'
import { IMAGE_EXTS, VIDEO_EXTS } from '@renderer/types'
import { FileVideo2, FileImage, FileBox, FileText, FileQuestion } from 'lucide-react'

const RASTER_PREVIEWABLE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'])

function snfileUrl(filePath: string): string {
  return `snfile://preview?path=${encodeURIComponent(filePath)}`
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

  const initial = file.previewUrl ?? (previewable || isVideo ? snfileUrl(sourcePath) : null)
  const [src, setSrc] = useState<string | null>(initial ?? null)
  const [failedFor, setFailedFor] = useState<string | null>(null)

  useEffect(() => {
    const deferSetSrc = (next: string | null) => queueMicrotask(() => setSrc(next))
    if (file.previewUrl) {
      deferSetSrc(file.previewUrl)
      return
    }
    if (previewable || isVideo) {
      deferSetSrc(snfileUrl(sourcePath))
      return
    }
    deferSetSrc(null)
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
