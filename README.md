# SN Metadata Auto

A Windows desktop application for batch microstock metadata generation using AI.

Built with **Electron + React + TypeScript + Vite**.

## Features

- **Batch metadata generation** for JPG / JPEG / PNG / WEBP / MP4 / MOV / AVI / WEBM / SVG / EPS files
- **Multi-provider AI** — Gemini, OpenAI, Groq, **KoboiLLM** (an OpenAI-compatible gateway that exposes 100+ models from OpenAI, Anthropic / Claude, Google, Groq, Meta and more under a single API key), and any other OpenAI-compatible endpoint (Custom). Up to 10 keys with priority-based rotation.
- **Direct in-card metadata editing** — title, description, keywords, category, rename preview
- **Drag & drop keyword chips** with dedupe, auto-sort, copyright-hint detection, and target counter (49/49)
- **Approve & Rename workflow** — files are never renamed automatically; you stay in control
- **Project save/load** with autosave to `userData`
- **Activity log** with search, filter, copy, and TXT/JSON export
- **Export** metadata to CSV / TXT / JSON / XLSX
- **Liquid glass UI** — soft warm gradient palette with backdrop blur, rounded corners, no blue/black backgrounds

## Workflow

```
Add files → Start batch → AI generates metadata
            → review & edit in card
            → Save (locks edits)
            → Approve & Rename (renames file on disk)
            → Export to CSV/TXT/JSON/XLSX
```

## Development

```bash
npm install
npm run dev          # launches Electron with HMR
npm run typecheck    # strict TS check, both main + renderer
npm run lint
npm run build        # bundles main + preload + renderer
npm run build:win    # produces a Windows installer
```

## Project structure

```
src/
├── main/            Electron main process
│   └── ipc/         IPC handlers (files, project, export, ai)
├── preload/         Context-bridge exposing window.api
└── renderer/        React UI
    └── src/
        ├── components/    Layout, UI primitives, metadata, keywords
        ├── pages/         Files / Review / Editor / API Keys / Logs / Export / Settings
        ├── hooks/         Batch + project hooks
        ├── services/      AI orchestrator + provider model presets
        ├── store/         zustand store (immer)
        ├── styles/        Theme tokens and global utility classes
        ├── types/         Shared domain types
        └── utils/         Filename, keywords, formatting
```

## Security notes

- API keys are stored only inside the project file. They are **never** logged in full — logs only reference the slot name (e.g. `Gemini Key 1`).
- File system access is mediated by IPC handlers; the renderer cannot touch `fs` directly.
- A custom `snfile://` protocol is used to stream image previews without base64-encoding the entire file.
