import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { BottomBar } from './BottomBar'
import { useAppStore } from '@renderer/store/store'
import { FilesQueuePage } from '@renderer/pages/FilesQueuePage'
import { MetadataReviewPage } from '@renderer/pages/MetadataReviewPage'
import { MetadataEditorPage } from '@renderer/pages/MetadataEditorPage'
import { ApiKeysPage } from '@renderer/pages/ApiKeysPage'
import { LogsPage } from '@renderer/pages/LogsPage'
import { ExportPage } from '@renderer/pages/ExportPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { Toast } from '../ui/Toast'
import { useAutoSave, useCooldownTicker } from '@renderer/hooks/useBatch'
import { useProjectActions } from '@renderer/hooks/useProject'

export function AppShell() {
  const active = useAppStore((s) => s.ui.activePage)
  const { restoreLastSession } = useProjectActions()
  useAutoSave()
  useCooldownTicker()

  useEffect(() => {
    void restoreLastSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <TopBar />

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 0 }}>
        <Sidebar />
        <main
          style={{
            flex: 1,
            minWidth: 0,
            margin: '6px 12px 6px 6px',
            padding: 18,
            position: 'relative',
            overflow: 'hidden'
          }}
          className="glass"
        >
          {active === 'files' && <FilesQueuePage />}
          {active === 'review' && <MetadataReviewPage />}
          {active === 'editor' && <MetadataEditorPage />}
          {active === 'apikeys' && <ApiKeysPage />}
          {active === 'logs' && <LogsPage />}
          {active === 'export' && <ExportPage />}
          {active === 'settings' && <SettingsPage />}
        </main>
      </div>

      <BottomBar />
      <Toast />
    </div>
  )
}
