import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import * as path from 'path'

// `@resvg/resvg-js` ships native bindings per-platform. We import the high-level
// `Resvg` class only — the binding loader at the package root resolves the
// correct prebuilt for the runtime platform automatically.
import { Resvg } from '@resvg/resvg-js'

interface RenderResult {
  ok: boolean
  previewPath?: string
  mimeType?: 'image/png'
  error?: string
}

/**
 * Resolve a stable directory under `userData` for cached SVG-to-PNG previews.
 * Putting them inside `userData` (rather than the OS temp dir) means they
 * survive across app restarts and can be reused on the next batch run, but
 * we still wipe everything older than the current session at app launch via
 * `cleanupVectorPreviewCache()` to avoid the directory growing unbounded.
 */
function previewCacheDir(): string {
  return path.join(app.getPath('userData'), 'svg-previews')
}

/**
 * Build a deterministic preview filename so repeated rasterizations of the
 * same source SVG (same path, same mtime, same byte length) reuse the same
 * cached PNG instead of producing a new file every batch run. Including the
 * file's mtime in the hash invalidates the cache automatically the moment
 * the user edits the SVG on disk.
 */
async function previewKey(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath)
  const hash = createHash('sha1')
  hash.update(filePath)
  hash.update('|')
  hash.update(String(stat.mtimeMs))
  hash.update('|')
  hash.update(String(stat.size))
  return hash.digest('hex')
}

/**
 * Render an SVG file on disk to a PNG file on disk and return its path. The
 * returned path is suitable for handing back to the existing AI pipeline,
 * which already knows how to read raster bytes via `files:read-base64` and
 * serve them to vision providers as `image/png` inline data.
 *
 * The caller's responsibility is purely the routing decision (only call this
 * for SVGs); we don't validate the extension here so the same helper can be
 * reused for thumbnail rendering of vector files in the renderer.
 */
export async function renderSvgToPngPreview(
  filePath: string,
  options: { width?: number } = {}
): Promise<RenderResult> {
  try {
    const dir = previewCacheDir()
    await fs.mkdir(dir, { recursive: true })
    const key = await previewKey(filePath)
    const previewPath = path.join(dir, `${key}.png`)

    // Reuse a cached preview when present. SVG rasterization is fast enough
    // that this is mostly a defense against the occasional huge SVG, but it
    // also keeps the AI batch deterministic when re-running on the same files.
    try {
      await fs.access(previewPath)
      return { ok: true, previewPath, mimeType: 'image/png' }
    } catch {
      // cache miss; fall through to render
    }

    const svgBytes = await fs.readFile(filePath)
    const targetWidth = Math.max(256, Math.min(2048, options.width ?? 1024))

    // `fitTo` tells resvg to scale the canvas so the SVG's longest edge maps
    // to `targetWidth`. We use the `width` strategy and let the height be
    // derived from the SVG's aspect ratio, which preserves the original
    // composition for the vision model.
    const resvg = new Resvg(svgBytes, {
      fitTo: { mode: 'width', value: targetWidth },
      background: 'rgba(255,255,255,1)'
    })
    const rendered = resvg.render()
    const pngBytes = rendered.asPng()
    await fs.writeFile(previewPath, pngBytes)

    return { ok: true, previewPath, mimeType: 'image/png' }
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message || 'SVG render failed'
    }
  }
}

/**
 * Best-effort cleanup of stale preview files at app startup. We don't track
 * which previews are still in use across sessions, so we simply prune anything
 * older than 24 hours so the cache directory stays bounded in size while still
 * letting the user re-run yesterday's batch without re-rendering everything.
 */
export async function cleanupVectorPreviewCache(): Promise<void> {
  try {
    const dir = previewCacheDir()
    let entries: import('fs').Dirent[] = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map(async (e) => {
          const full = path.join(dir, e.name)
          try {
            const stat = await fs.stat(full)
            if (stat.mtimeMs < cutoff) await fs.unlink(full)
          } catch {
            // ignore individual failures
          }
        })
    )
  } catch {
    // ignore cleanup failures so they never block app startup
  }
}

/**
 * Wire the renderer-facing IPC. Renderer asks for a PNG preview of a vector
 * file and gets either a usable `previewPath` (which the AI pipeline can
 * read like any raster) or a clear error string. We do not throw — the
 * orchestrator must continue processing the rest of the queue.
 */
export function registerVectorPreviewIpc(): void {
  ipcMain.handle(
    'media:render-svg-preview',
    async (_e, req: { filePath: string; width?: number }): Promise<RenderResult> => {
      if (!req?.filePath) return { ok: false, error: 'filePath is required' }
      return renderSvgToPngPreview(req.filePath, { width: req.width })
    }
  )
}
