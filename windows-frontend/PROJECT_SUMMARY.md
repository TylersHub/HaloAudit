# Windows Frontend - HaloAudit

This directory contains the Windows port of HaloAudit built with Electron and React.

## 🚀 Quick Start

```bash
cd windows-frontend
npm install
npm run dev
```

## 📁 Project Structure

- `src/main.ts` - Electron main process
- `src/preload.ts` - Electron preload script
- `src/App.tsx` - Main React component
- `src/components/` - React UI components
- `src/services/` - Business logic and API clients
- `src/types/` - TypeScript type definitions

## 🎯 Features

✅ **Identical to macOS version:**

- Drag & drop file upload
- Real-time WebSocket progress
- Same backend API integration
- Identical UI/UX design

✅ **Windows-specific:**

- Native Windows file dialogs
- Windows installer (NSIS)
- System tray integration
- Global hotkeys (Ctrl+Shift+A)

## 🔧 Development

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Create Windows installer
npm run dist:win
```

## 🌐 Backend Integration

Uses the same backend as macOS:

- **API**: `https://auditor-edge.evanhaque1.workers.dev`
- **WebSocket**: Real-time progress updates
- **Authentication**: Same JWT system

## 📦 Distribution

The app builds to:

- `release/` - Windows installer and portable app
- `dist/` - Built application files

## 🎨 UI Design

Replicates the macOS notch design with:

- Glass morphism effects
- Rounded corners and shadows
- Drag & drop zones
- Progress indicators
- Findings display with severity badges

## 🔗 Integration

This Windows app works seamlessly with your existing:

- Backend API (Cloudflare Workers)
- Python agent (LangGraph pipeline)
- Database (D1, R2, Vectorize)

No backend changes needed - it's a pure frontend port!



