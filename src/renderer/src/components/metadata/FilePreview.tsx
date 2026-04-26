import type { AppFile } from '@renderer/types'
import { IMAGE_EXTS, VIDEO_EXTS } from '@renderer/types'
import { FileVideo2, FileImage, FileBox, FileText, FileQuestion } from 'lucide-react'

export function previewSrc(file: AppFile): string | null {
  if (file.previewUrl) return file.previewUrl
  const ext = String(file.fileType).toLowerCase()
  if ((IMAGE_EXTS as readonly string[]).includes(ext) || ext === 'svg') {
    // Use the snfile:// protocol so we don't have to base64-encode large files.
    const p = file.currentPath || file.originalPath
    return `snfile:///${p.replace(/\\/g, '/')}`
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

  const placeholderIcon = isVideo ? (
    <FileVideo2 size={Math.round(size * 0.42)} />
  ) : ext === 'eps' ? (
    <FileBox size={Math.round(size * 0.42)} />
  ) : isVector ? (
    <FileImage size={Math.round(size * 0.42)} />
  ) : src ? null : ext ? (
    <FileText size={Math.round(size * 0.42)} />
  ) : (
    <FileQuestion size={Math.round(size * 0.42)} />
  )

  const showImage =
    src && (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp' || ext === 'svg')

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
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
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
