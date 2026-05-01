import { useEffect, useRef, useState } from 'react'
import type { AppFile } from '@renderer/types'
import { IMAGE_EXTS, VIDEO_EXTS } from '@renderer/types'
import { FileVideo2, FileImage, FileBox, FileText, FileQuestion } from 'lucide-react'
import { generateVideoPoster } from '@renderer/utils/videoPoster'

const RASTER_PREVIEWABLE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'])

// Cache resolved data URLs by file path so re-renders or re-mounts of
// `FilePreview` don't trigger another IPC round-trip / disk read for the
// same file. Keyed on the resolved `currentPath || originalPath` so renames
// invalidate the cache automatically. Used for both image thumbnails and
// generated video poster frames.
const thumbnailCache = new Map<string, string>()
// Path -> in-flight poster generation promise. Several `<FilePreview>`
// instances can mount for the same file (queue + editor), so we share the
// single decode rather than spawning parallel `<video>` elements.
const videoPosterInflight = new Map<string, Promise<string | null>>()

function getVideoPoster(path: string, maxSize: number): Promise<string | null> {
  const cached = thumbnailCache.get(path)
  if (cached) return Promise.resolve(cached)
  const inflight = videoPosterInflight.get(path)
  if (inflight) return inflight
  const p = generateVideoPoster(path, maxSize).then((url) => {
    if (url) thumbnailCache.set(path, url)
    videoPosterInflight.delete(path)
    return url
  })
  videoPosterInflight.set(path, p)
  return p
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
  const [imgFailed, setImgFailed] = useState(false)
  // Track the latest path we requested so an in-flight IPC for an old path
  // doesn't overwrite the state of a newer one when scrolling rapidly through
  // a large queue.
  const requestedFor = useRef<string | null>(null)

  useEffect(() => {
    setImgFailed(false)
    if (file.previewUrl) {
      setSrc(file.previewUrl)
      return
    }
    const cached = thumbnailCache.get(sourcePath)
    if (cached) {
      setSrc(cached)
      return
    }
    if (!previewable && !isVideo) {
      setSrc(null)
      return
    }
    setSrc(null)
    requestedFor.current = sourcePath
    const targetPath = sourcePath
    const targetMax = Math.max(96, size * 2)

    if (isVideo) {
      void getVideoPoster(targetPath, targetMax)
        .then((url) => {
          if (requestedFor.current !== targetPath) return
          if (url) {
            setSrc(url)
          } else {
            setImgFailed(true)
          }
        })
        .catch(() => {
          if (requestedFor.current !== targetPath) return
          setImgFailed(true)
        })
      return
    }

    void window.api
      .readThumbnail({ path: targetPath, maxSize: targetMax })
      .then((res) => {
        if (requestedFor.current !== targetPath) return
        if (res.ok && res.dataUrl) {
          thumbnailCache.set(targetPath, res.dataUrl)
          setSrc(res.dataUrl)
        } else {
          setImgFailed(true)
        }
      })
      .catch(() => {
        if (requestedFor.current !== targetPath) return
        setImgFailed(true)
      })
  }, [sourcePath, file.previewUrl, previewable, isVideo, size])

  const showImage = !!src && (RASTER_PREVIEWABLE.has(ext) || isVideo) && !imgFailed

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
        background: 'var(--c-glass-2)'
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
