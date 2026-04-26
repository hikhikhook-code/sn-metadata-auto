import type { FileStatus } from '@renderer/types'

const COLORS: Record<FileStatus, { bg: string; fg: string; border: string }> = {
  Waiting: { bg: '#f4eef5', fg: '#7c6080', border: 'rgba(124,96,128,0.25)' },
  Ready: { bg: '#eef4ec', fg: '#5b7e5b', border: 'rgba(91,126,91,0.3)' },
  Unsupported: { bg: '#f7e9e7', fg: '#a05a4d', border: 'rgba(160,90,77,0.3)' },
  Duplicate: { bg: '#fbe9c8', fg: '#8a5a1a', border: 'rgba(138,90,26,0.25)' },
  Processing: { bg: '#e6dcf2', fg: '#5a4884', border: 'rgba(90,72,132,0.3)' },
  Generated: { bg: '#e7eef9', fg: '#3f5a85', border: 'rgba(63,90,133,0.25)' },
  Edited: { bg: '#fbe9c8', fg: '#8a5a1a', border: 'rgba(138,90,26,0.3)' },
  Saved: { bg: '#e1efe2', fg: '#3f7d4d', border: 'rgba(63,125,77,0.3)' },
  'Need Approval': { bg: '#fbe2c2', fg: '#8e571a', border: 'rgba(142,87,26,0.3)' },
  Approved: { bg: '#d8efd8', fg: '#2d6a3a', border: 'rgba(45,106,58,0.35)' },
  Renamed: { bg: '#cae8d3', fg: '#26603a', border: 'rgba(38,96,58,0.4)' },
  Exported: { bg: '#d8e5f5', fg: '#2f5688', border: 'rgba(47,86,136,0.35)' },
  Failed: { bg: '#f6d5d3', fg: '#8a3838', border: 'rgba(138,56,56,0.3)' },
  Skipped: { bg: '#ece3e3', fg: '#6a5a5a', border: 'rgba(106,90,90,0.3)' }
}

export function StatusBadge({ status }: { status: FileStatus }) {
  const c = COLORS[status] ?? COLORS.Waiting
  return (
    <span
      className="badge"
      style={{ background: c.bg, color: c.fg, borderColor: c.border, fontWeight: 600 }}
    >
      {status}
    </span>
  )
}
