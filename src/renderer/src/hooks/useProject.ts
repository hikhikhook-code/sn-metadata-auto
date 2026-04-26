import { useCallback } from 'react'
import { useAppStore } from '@renderer/store/store'
import type { SerializedProject } from '@renderer/types'

export function useProjectActions() {
  const saveProject = useCallback(async (forceDialog: boolean) => {
    const store = useAppStore.getState()
    const data = store.serialize()
    const path = forceDialog ? null : store.project.filePath
    const res = await window.api.saveProject(data, path)
    if (res.ok && res.path) {
      store.setProjectPath(res.path)
      store.markProjectSaved()
      store.pushRecentProject(res.path)
      store.addLog('success', 'PROJECT', `Project saved → ${res.path}`)
      store.showToast('success', `Project saved`)
      return true
    }
    if (res.error) {
      store.addLog('error', 'PROJECT', `Save failed: ${res.error}`)
      store.showToast('error', `Save failed: ${res.error}`)
    }
    return false
  }, [])

  const openProject = useCallback(async () => {
    const store = useAppStore.getState()
    const res = await window.api.loadProject()
    if (!res.ok || !res.project) {
      if (res.error) store.showToast('error', `Open failed: ${res.error}`)
      return false
    }
    store.hydrate(res.project as SerializedProject)
    if (res.path) {
      store.setProjectPath(res.path)
      store.pushRecentProject(res.path)
    }
    store.addLog('success', 'PROJECT', `Project loaded${res.path ? ` from ${res.path}` : ''}`)
    store.showToast('success', `Project loaded`)
    return true
  }, [])

  const restoreLastSession = useCallback(async () => {
    const res = await window.api.loadAutoSave()
    if (res.ok && res.project) {
      const store = useAppStore.getState()
      store.hydrate(res.project as SerializedProject)
      store.addLog('info', 'PROJECT', 'Restored last session from autosave')
    }
  }, [])

  return { saveProject, openProject, restoreLastSession }
}
