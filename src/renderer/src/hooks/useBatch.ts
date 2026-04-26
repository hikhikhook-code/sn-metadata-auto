import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@renderer/store/store'
import { generateForFile, resetKeyGate } from '@renderer/services/ai/orchestrator'
import type { AppFile, AppSettings, BatchWorkerSlot } from '@renderer/types'
import type { GenerateOutcome, KeyStatusChange } from '@renderer/services/ai/orchestrator'

const STOP_SENTINEL = { __stopped: true }

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)))
}

function applyKeyStatusChanges(changes: KeyStatusChange[]): void {
  if (!changes.length) return
  const store = useAppStore.getState()
  for (const change of changes) {
    const key = store.apiKeys.find((k) => k.id === change.id)
    const slotName = key ? `${key.provider} Key ${key.priority}` : change.id
    store.updateApiKey(change.id, {
      status: change.status,
      lastError: change.lastError,
      lastChecked: new Date().toISOString(),
      cooldownUntil: change.cooldownUntil
    })
    if (change.status === 'Limit') {
      store.addLog(
        'warning',
        'COOLDOWN',
        `Rate limit detected on ${slotName}; cooldown started${
          change.cooldownUntil
            ? ` until ${new Date(change.cooldownUntil).toLocaleTimeString()}`
            : ''
        }`,
        { apiKeySlot: slotName }
      )
    } else if (change.status === 'Invalid') {
      store.addLog('error', 'API', `Key ${slotName} marked Invalid: ${change.lastError ?? ''}`, {
        apiKeySlot: slotName
      })
    }
  }
}

async function processFileOnce(
  file: AppFile,
  useMock: boolean,
  settings: AppSettings
): Promise<GenerateOutcome> {
  return generateForFile(file, useAppStore.getState().apiKeys, {
    useMock,
    keywordCount: settings.defaultKeywordCount,
    delayBetweenApiCallsMs: settings.delayBetweenApiCallsMs,
    rateLimitCooldownSec: settings.rateLimitCooldownSec,
    autoSwitchOnLimit: settings.autoSwitchOnLimit
  })
}

export function useBatchControls() {
  const cancelRef = useRef(false)

  const startBatch = useCallback(async (onlyIds?: string[]) => {
    const store = useAppStore.getState()
    if (store.batch.isRunning) return
    cancelRef.current = false
    resetKeyGate()

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

    const settings = store.settings
    const workerCount = Math.max(1, Math.min(50, settings.workerCount || 1))
    const initialWorkers: BatchWorkerSlot[] = Array.from({ length: workerCount }, (_, i) => ({
      id: i + 1,
      fileId: null,
      fileName: null,
      apiKeySlot: null
    }))

    const startedAt = new Date().toISOString()
    store.setBatch({
      isRunning: true,
      isPaused: false,
      successCount: 0,
      failedCount: 0,
      totalCount: queue.length,
      startedAt,
      currentFileId: null,
      workers: initialWorkers,
      consecutiveFailures: 0
    })

    store.addLog(
      'info',
      'BATCH',
      `Batch started — ${queue.length} file(s) · ${workerCount} worker${workerCount === 1 ? '' : 's'}`
    )

    const useMock = useAppStore.getState().apiKeys.filter((k) => k.enabled && k.apiKey).length === 0

    let queueIdx = 0
    let stoppedByThreshold = false

    const setWorker = (slotId: number, partial: Partial<BatchWorkerSlot>): void => {
      const cur = useAppStore.getState().batch.workers
      const next = cur.map((w) => (w.id === slotId ? { ...w, ...partial } : w))
      useAppStore.getState().setBatch({ workers: next })
    }

    const worker = async (slotId: number): Promise<void> => {
      let firstFile = true
      while (true) {
        if (cancelRef.current || stoppedByThreshold) return
        const myIdx = queueIdx++
        if (myIdx >= queue.length) return
        const file = queue[myIdx]
        const fresh = useAppStore.getState().files.find((f) => f.id === file.id)
        if (!fresh) continue
        if (
          (fresh.status === 'Renamed' ||
            fresh.status === 'Approved' ||
            fresh.status === 'Saved' ||
            fresh.status === 'Generated' ||
            fresh.status === 'Edited') &&
          !onlyIds
        ) {
          continue
        }

        if (!firstFile && settings.delayBetweenFilesMs > 0) {
          useAppStore
            .getState()
            .addLog(
              'info',
              'DELAY',
              `Worker #${slotId} waiting ${settings.delayBetweenFilesMs}ms before next file`
            )
          await sleep(settings.delayBetweenFilesMs)
        }
        firstFile = false
        if (cancelRef.current || stoppedByThreshold) return

        setWorker(slotId, {
          fileId: fresh.id,
          fileName: fresh.originalFilename,
          apiKeySlot: null
        })
        useAppStore.getState().setBatch({ currentFileId: fresh.id })
        useAppStore.getState().setFileStatus(fresh.id, 'Processing')
        useAppStore
          .getState()
          .addLog('info', 'WORKER', `Worker #${slotId} started ${fresh.originalFilename}`, {
            fileId: fresh.id
          })

        const maxAttempts = Math.max(1, (settings.maxRetryAttempts ?? 0) + 1)
        let attempt = 0
        let outcome: GenerateOutcome | null = null
        while (attempt < maxAttempts) {
          attempt++
          if (cancelRef.current || stoppedByThreshold) return
          if (attempt > 1) {
            useAppStore
              .getState()
              .addLog(
                'info',
                'RETRY',
                `Retry attempt ${attempt - 1}/${maxAttempts - 1} for ${fresh.originalFilename} after ${settings.retryDelayMs}ms`,
                { fileId: fresh.id }
              )
            await sleep(settings.retryDelayMs)
            if (cancelRef.current || stoppedByThreshold) return
          }
          outcome = await processFileOnce(fresh, useMock, settings)
          if (outcome.keyStatusChanges?.length) {
            applyKeyStatusChanges(outcome.keyStatusChanges)
          }
          if (outcome.ok) break
          if (outcome.rateLimitedAll) {
            // No more keys to try; stop attempting this file in this loop
            break
          }
          // Otherwise loop to retry (if attempts remain)
        }

        if (outcome?.ok && outcome.metadata) {
          useAppStore
            .getState()
            .applyAiMetadata(
              fresh.id,
              outcome.metadata,
              outcome.apiProvider ?? '—',
              outcome.apiKeySlot ?? '—'
            )
          useAppStore
            .getState()
            .addLog('success', 'SUCCESS', `Metadata generated for ${fresh.originalFilename}`, {
              fileId: fresh.id,
              apiKeySlot: outcome.apiKeySlot
            })
          useAppStore.getState().setBatch({
            successCount: useAppStore.getState().batch.successCount + 1,
            consecutiveFailures: 0
          })
          setWorker(slotId, {
            fileId: null,
            fileName: null,
            apiKeySlot: outcome.apiKeySlot ?? null
          })
        } else {
          const err = outcome?.error ?? 'Unknown error'
          useAppStore.getState().setFileStatus(fresh.id, 'Failed', err)
          useAppStore.getState().addLog('error', 'FAILED', `${fresh.originalFilename} — ${err}`, {
            fileId: fresh.id
          })
          const cur = useAppStore.getState().batch
          useAppStore.getState().setBatch({
            failedCount: cur.failedCount + 1,
            consecutiveFailures: cur.consecutiveFailures + 1
          })
          setWorker(slotId, { fileId: null, fileName: null })

          if (
            settings.stopOnTooManyFailures &&
            useAppStore.getState().batch.consecutiveFailures >= (settings.failureThreshold || 0)
          ) {
            stoppedByThreshold = true
            useAppStore
              .getState()
              .addLog(
                'warning',
                'STOP',
                `Stop on Too Many Failures triggered (${useAppStore.getState().batch.consecutiveFailures} consecutive failures)`
              )
            useAppStore.getState().setBatch({ isPaused: true })
            useAppStore
              .getState()
              .showToast('error', 'Batch paused — too many consecutive failures')
            return
          }
        }
      }
    }

    const workerPromises = Array.from({ length: workerCount }, (_, i) => worker(i + 1))
    await Promise.all(workerPromises)

    if (cancelRef.current) {
      useAppStore.getState().addLog('warning', 'STOP', `Batch stopped by user`)
      useAppStore
        .getState()
        .setBatch({ isRunning: false, isPaused: true, currentFileId: null, workers: [] })
      return STOP_SENTINEL
    }

    useAppStore.getState().setBatch({
      isRunning: false,
      isPaused: stoppedByThreshold,
      currentFileId: null,
      workers: []
    })
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
    useAppStore.getState().addLog('info', 'RESUME', `Queue resumed`)
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

/**
 * Cooldown ticker — every second, recovers any API key whose cooldownUntil has elapsed.
 * Mounted once at AppShell level.
 */
export function useCooldownTicker(): void {
  useEffect(() => {
    const id = setInterval(() => {
      const state = useAppStore.getState()
      const now = Date.now()
      for (const k of state.apiKeys) {
        if (k.cooldownUntil && new Date(k.cooldownUntil).getTime() <= now) {
          const slot = `${k.provider} Key ${k.priority}`
          state.updateApiKey(k.id, {
            cooldownUntil: undefined,
            status: k.status === 'Limit' ? 'Valid' : k.status
          })
          state.addLog('info', 'COOLDOWN', `Cooldown ended for ${slot}; key restored`, {
            apiKeySlot: slot
          })
        }
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])
}
