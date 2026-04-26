import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@renderer/store/store'
import { generateForFile } from '@renderer/services/ai/orchestrator'

const STOP_SENTINEL = { __stopped: true }

export function useBatchControls() {
  const cancelRef = useRef(false)

  const startBatch = useCallback(async (onlyIds?: string[]) => {
    const store = useAppStore.getState()
    if (store.batch.isRunning) return
    cancelRef.current = false

    const queue = (
      onlyIds ? store.files.filter((f) => onlyIds.includes(f.id)) : store.files
    ).filter(
      (f) =>
        f.status === 'Ready' ||
        f.status === 'Waiting' ||
        f.status === 'Failed' ||
        (onlyIds && onlyIds.includes(f.id))
    )

    if (queue.length === 0) {
      store.showToast('warning', 'Nothing to process — no Ready/Failed files in queue')
      return
    }

    const startedAt = new Date().toISOString()
    store.setBatch({
      isRunning: true,
      isPaused: false,
      successCount: 0,
      failedCount: 0,
      totalCount: queue.length,
      startedAt,
      currentFileId: null
    })

    store.addLog('info', 'BATCH', `Batch started — ${queue.length} file(s)`)

    const useMock = store.apiKeys.filter((k) => k.enabled && k.apiKey).length === 0

    for (const file of queue) {
      if (cancelRef.current) {
        useAppStore
          .getState()
          .addLog('warning', 'STOP', `Batch stopped at ${file.originalFilename}`)
        useAppStore.getState().setBatch({ isRunning: false, isPaused: true })
        return STOP_SENTINEL
      }
      const fresh = useAppStore.getState().files.find((f) => f.id === file.id)
      if (!fresh) continue
      // skip if already completed
      if (
        fresh.status === 'Renamed' ||
        fresh.status === 'Approved' ||
        fresh.status === 'Saved' ||
        fresh.status === 'Generated' ||
        fresh.status === 'Edited'
      ) {
        if (!onlyIds) continue
      }

      useAppStore.getState().setBatch({ currentFileId: fresh.id })
      useAppStore.getState().setFileStatus(fresh.id, 'Processing')
      const slot = `${useMock ? 'Mock' : 'Auto'}`
      useAppStore
        .getState()
        .addLog('info', 'PROCESSING', `${fresh.originalFilename} — using ${slot}`, {
          fileId: fresh.id
        })

      try {
        const out = await generateForFile(fresh, useAppStore.getState().apiKeys, {
          useMock,
          keywordCount: useAppStore.getState().settings.defaultKeywordCount
        })

        if (out.keyStatusChange) {
          useAppStore.getState().updateApiKey(out.keyStatusChange.id, {
            status: out.keyStatusChange.status,
            lastError: out.keyStatusChange.lastError,
            lastChecked: new Date().toISOString()
          })
          useAppStore
            .getState()
            .addLog(
              'warning',
              'API',
              `Key issue (${out.keyStatusChange.status}). Switched to next available key.`
            )
        }

        if (out.ok && out.metadata) {
          useAppStore
            .getState()
            .applyAiMetadata(fresh.id, out.metadata, out.apiProvider ?? '—', out.apiKeySlot ?? '—')
          useAppStore
            .getState()
            .addLog('success', 'SUCCESS', `Metadata generated for ${fresh.originalFilename}`, {
              fileId: fresh.id,
              apiKeySlot: out.apiKeySlot
            })
          useAppStore
            .getState()
            .setBatch({ successCount: useAppStore.getState().batch.successCount + 1 })
        } else {
          useAppStore.getState().setFileStatus(fresh.id, 'Failed', out.error)
          useAppStore
            .getState()
            .addLog('error', 'FAILED', `${fresh.originalFilename} — ${out.error}`, {
              fileId: fresh.id
            })
          useAppStore
            .getState()
            .setBatch({ failedCount: useAppStore.getState().batch.failedCount + 1 })
        }
      } catch (e) {
        useAppStore.getState().setFileStatus(fresh.id, 'Failed', (e as Error).message)
        useAppStore
          .getState()
          .addLog('error', 'FAILED', `${fresh.originalFilename} — ${(e as Error).message}`)
        useAppStore
          .getState()
          .setBatch({ failedCount: useAppStore.getState().batch.failedCount + 1 })
      }
    }

    useAppStore.getState().setBatch({ isRunning: false, isPaused: false, currentFileId: null })
    useAppStore
      .getState()
      .addLog(
        'info',
        'BATCH',
        `Batch finished — ${useAppStore.getState().batch.successCount} success, ${useAppStore.getState().batch.failedCount} failed`
      )
    return null
  }, [])

  const stopBatch = useCallback(() => {
    cancelRef.current = true
  }, [])

  const resumeBatch = useCallback(async () => {
    cancelRef.current = false
    return startBatch()
  }, [startBatch])

  const regenerateOne = useCallback(
    async (id: string) => {
      return startBatch([id])
    },
    [startBatch]
  )

  const regenerateFailed = useCallback(async () => {
    const ids = useAppStore
      .getState()
      .files.filter((f) => f.status === 'Failed')
      .map((f) => f.id)
    if (ids.length === 0) {
      useAppStore.getState().showToast('warning', 'No failed files to regenerate')
      return
    }
    return startBatch(ids)
  }, [startBatch])

  return { startBatch, stopBatch, resumeBatch, regenerateOne, regenerateFailed }
}

/** Renames an approved file via main process. */
export function useRename() {
  return useCallback(async (fileId: string) => {
    const file = useAppStore.getState().files.find((f) => f.id === fileId)
    if (!file) return
    const meta = file.editedMetadata ?? file.aiMetadata
    if (!meta || !meta.title.trim()) {
      useAppStore.getState().showToast('warning', 'Cannot rename — title is empty')
      return
    }
    const settings = useAppStore.getState().settings
    const target = file.renamePreview || file.currentFilename

    useAppStore.getState().approveMetadata(fileId)
    useAppStore
      .getState()
      .addLog('success', 'APPROVED', `Approved ${file.originalFilename}`, { fileId })

    if (!settings.autoRenameAfterApprove) {
      return
    }

    const res = await window.api.renameFile({
      fromPath: file.currentPath,
      toFilename: target,
      backup: settings.keepOriginalBackup,
      addNumberIfDuplicate: settings.addNumberIfDuplicate
    })

    if (res.ok && res.newPath && res.newFilename) {
      useAppStore.getState().applyRenameResult(fileId, res.newPath, res.newFilename)
      useAppStore
        .getState()
        .addLog('success', 'RENAMED', `${file.originalFilename} → ${res.newFilename}`, { fileId })
      useAppStore.getState().showToast('success', `Renamed → ${res.newFilename}`)
    } else {
      useAppStore
        .getState()
        .addLog('error', 'FAILED', `Rename failed: ${res.error ?? 'unknown error'}`, { fileId })
      useAppStore.getState().showToast('error', `Rename failed: ${res.error ?? 'unknown error'}`)
    }
  }, [])
}

/**
 * Auto-save the project to userData on every important change. We debounce.
 */
export function useAutoSave() {
  const enabled = useAppStore((s) => s.settings.autosaveProject)
  const watchedSnapshot = useAppStore(
    (s) => `${s.files.length}|${s.logs.length}|${s.apiKeys.length}|${s.project.lastSavedAt}`
  )
  const fired = useRef(0)

  useEffect(() => {
    if (!enabled) return
    fired.current++
    const my = fired.current
    const t = setTimeout(() => {
      if (my !== fired.current) return
      const project = useAppStore.getState().serialize()
      void window.api.autoSaveProject(project)
    }, 1500)
    return () => clearTimeout(t)
  }, [enabled, watchedSnapshot])
}
