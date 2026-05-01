import type { FileStatus } from '@renderer/types'

/**
 * The internal `FileStatus` enum is fairly granular (it's used by sort
 * filters, batch progress logic, log routing, etc.) but the 6-state lifecycle
 * the user wants to *see* is much smaller:
 *
 *   Ready · Processing · Metadata ready · Review needed · Exported · Failed
 *
 * This helper collapses every internal status into one of those user-facing
 * labels and the matching color palette. Always import the badge or use
 * `displayStatus()` here when surfacing a status string in the UI; never
 * render the raw enum value to the user.
 */
type Display = { label: string; bg: string; fg: string; border: string }

const READY: Display = {
  label: 'Ready',
  bg: '#eef4ec',
  fg: '#5b7e5b',
  border: 'rgba(91,126,91,0.3)'
}
const UNSUPPORTED: Display = {
  label: 'Unsupported',
  bg: '#f7e9e7',
  fg: '#a05a4d',
  border: 'rgba(160,90,77,0.3)'
}
const DUPLICATE: Display = {
  label: 'Duplicate',
  bg: '#fbe9c8',
  fg: '#8a5a1a',
  border: 'rgba(138,90,26,0.25)'
}
const PROCESSING: Display = {
  label: 'Processing',
  bg: '#e6dcf2',
  fg: '#5a4884',
  border: 'rgba(90,72,132,0.3)'
}
const METADATA_READY: Display = {
  label: 'Metadata ready',
  bg: '#e7eef9',
  fg: '#3f5a85',
  border: 'rgba(63,90,133,0.3)'
}
const REVIEW_NEEDED: Display = {
  label: 'Review needed',
  bg: '#fbe2c2',
  fg: '#8e571a',
  border: 'rgba(142,87,26,0.35)'
}
const EXPORTED: Display = {
  label: 'Exported',
  bg: '#d8efd8',
  fg: '#2d6a3a',
  border: 'rgba(45,106,58,0.4)'
}
const FAILED: Display = {
  label: 'Failed',
  bg: '#f6d5d3',
  fg: '#8a3838',
  border: 'rgba(138,56,56,0.3)'
}
const SKIPPED: Display = {
  label: 'Skipped',
  bg: '#ece3e3',
  fg: '#6a5a5a',
  border: 'rgba(106,90,90,0.3)'
}

export function displayStatus(status: FileStatus): Display {
  switch (status) {
    case 'Waiting':
    case 'Ready':
      return READY
    case 'Unsupported':
      return UNSUPPORTED
    case 'Duplicate':
      return DUPLICATE
    case 'Processing':
      return PROCESSING
    // Generated / Saved / Approved / Renamed all mean: AI metadata exists,
    // possibly renamed, but NOT yet copied to the output folder. They map to
    // a single "Metadata ready" label so the user doesn't have to decode the
    // difference between the four internal substates.
    case 'Generated':
    case 'Saved':
    case 'Approved':
    case 'Renamed':
      return METADATA_READY
    // Edited = the user changed metadata in the editor; Need Approval = the
    // user explicitly flagged the file. Both mean: someone needs to look at
    // this before exporting.
    case 'Edited':
    case 'Need Approval':
      return REVIEW_NEEDED
    case 'Exported':
      return EXPORTED
    case 'Failed':
      return FAILED
    case 'Skipped':
      return SKIPPED
  }
}

export function StatusBadge({ status }: { status: FileStatus }) {
  const c = displayStatus(status)
  return (
    <span
      className="badge"
      style={{ background: c.bg, color: c.fg, borderColor: c.border, fontWeight: 600 }}
    >
      {c.label}
    </span>
  )
}
