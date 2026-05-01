import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'
import { ExifTool, type WriteTags } from 'exiftool-vendored'

/**
 * Per-file embed input. `filePath` must be an absolute path on the user's
 * machine; metadata fields are optional but at least one of them must be
 * non-empty for the write to be useful.
 */
export interface EmbedFileInput {
  filePath: string
  fileType: string
  /**
   * Optional override for the output filename in `copy` mode. When set, the
   * output file in the embedded subdirectory uses this basename instead of
   * the original filename. Ignored in `in-place` mode (which never renames).
   */
  outputBasename?: string
  metadata: {
    title?: string
    description?: string
    keywords?: string[]
  }
}

export interface EmbedRequest {
  files: EmbedFileInput[]
  /**
   * - `copy` (default): copy each input file to `<inputDir>/<outputDirName>/`
   *   and write metadata to the copy. The original is left untouched.
   * - `in-place`: write metadata directly to the original file. If `backup`
   *   is true a one-time `<original>.bak` snapshot is created first (it will
   *   not be overwritten by subsequent embeds).
   */
  mode: 'in-place' | 'copy'
  backup: boolean
  outputDirName?: string
}

export interface EmbedFileResult {
  filePath: string
  ok: boolean
  outputPath?: string
  error?: string
}

export interface EmbedResponse {
  ok: boolean
  results: EmbedFileResult[]
}

let _et: ExifTool | null = null

function getExifTool(): ExifTool {
  if (!_et) {
    _et = new ExifTool({ taskTimeoutMillis: 60000, maxProcs: 1 })
  }
  return _et
}

export async function shutdownExifTool(): Promise<void> {
  if (_et) {
    const et = _et
    _et = null
    try {
      await et.end()
    } catch {
      // already exited
    }
  }
}

/**
 * Build the WriteTags map. We write the same logical fields across XMP, IPTC,
 * and EXIF so that whichever standard the consuming microstock platform parses
 * is satisfied (Adobe Stock prefers XMP, Shutterstock/Freepik also accept
 * IPTC, and traditional EXIF readers see ImageDescription).
 */
function buildWriteTags(metadata: EmbedFileInput['metadata']): WriteTags {
  const tags: WriteTags = {}
  const title = metadata.title?.trim()
  const description = metadata.description?.trim()
  const keywords = (metadata.keywords ?? []).map((k) => k.trim()).filter((k) => k.length > 0)

  if (title) {
    // Cast: WriteTags is a structural map keyed by tag name. The XMP-/IPTC-
    // prefixed names are valid exiftool tag identifiers but not present in
    // the inferred TS keys, hence the indexed assignment.
    ;(tags as Record<string, unknown>)['XMP-dc:Title'] = title
    ;(tags as Record<string, unknown>)['IPTC:ObjectName'] = title
    ;(tags as Record<string, unknown>)['EXIF:ImageDescription'] = title
  }
  if (description) {
    ;(tags as Record<string, unknown>)['XMP-dc:Description'] = description
    ;(tags as Record<string, unknown>)['IPTC:Caption-Abstract'] = description
    ;(tags as Record<string, unknown>)['EXIF:UserComment'] = description
  }
  if (keywords.length > 0) {
    ;(tags as Record<string, unknown>)['XMP-dc:Subject'] = keywords
    ;(tags as Record<string, unknown>)['IPTC:Keywords'] = keywords
  }
  return tags
}

async function ensureBackup(filePath: string): Promise<void> {
  const bak = filePath + '.bak'
  try {
    await fs.access(bak)
    return // already exists, don't overwrite an earlier snapshot
  } catch {
    // fall through
  }
  await fs.copyFile(filePath, bak)
}

async function prepareTarget(file: EmbedFileInput, req: EmbedRequest): Promise<string> {
  if (req.mode === 'copy') {
    const dir = path.dirname(file.filePath)
    const subdir = req.outputDirName && req.outputDirName.length > 0 ? req.outputDirName : 'embedded'
    const outDir = path.join(dir, subdir)
    await fs.mkdir(outDir, { recursive: true })
    const basename =
      file.outputBasename && file.outputBasename.length > 0
        ? file.outputBasename
        : path.basename(file.filePath)
    const target = path.join(outDir, basename)
    await fs.copyFile(file.filePath, target)
    return target
  }
  if (req.backup) await ensureBackup(file.filePath)
  return file.filePath
}

export function registerEmbedIpc(): void {
  ipcMain.handle('metadata:embed', async (_e, req: EmbedRequest): Promise<EmbedResponse> => {
    const et = getExifTool()
    const results: EmbedFileResult[] = []
    for (const file of req.files) {
      try {
        const target = await prepareTarget(file, req)
        const tags = buildWriteTags(file.metadata)
        // `-overwrite_original` skips exiftool's default `<file>_original`
        // sidecar — we already manage backups via the .bak / copy mode above.
        await et.write(target, tags, { writeArgs: ['-overwrite_original'] })
        results.push({ filePath: file.filePath, ok: true, outputPath: target })
      } catch (err) {
        results.push({
          filePath: file.filePath,
          ok: false,
          error: (err as Error).message
        })
      }
    }
    return { ok: results.every((r) => r.ok), results }
  })
}
