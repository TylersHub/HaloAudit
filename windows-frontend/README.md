# HaloAudit Windows - Development Setup

## Prerequisites

- Node.js 18+
- npm or yarn
- Git

## Quick Start

1. **Install dependencies:**

   ```bash
   cd windows-frontend
   npm install
   ```

2. **Start development server:**

   ```bash
   npm run dev
   ```

3. **Build for production:**

   ```bash
   npm run build
   ```

4. **Create Windows installer:**
   ```bash
   npm run dist:win
   ```

## Development Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run dist` - Create distributable packages
- `npm run dist:win` - Create Windows installer
- `npm run pack` - Package without installer

## Project Structure

```
windows-frontend/
├── src/
│   ├── components/          # React components
│   │   ├── AuditorUploadView.tsx
│   │   └── AuditorFindingsView.tsx
│   ├── services/           # Business logic
│   │   ├── AuditorAPIClient.ts
│   │   ├── WebSocketManager.ts
│   │   └── AuditorViewModel.ts
│   ├── types/              # TypeScript types
│   │   └── UploadState.ts
│   ├── main.ts             # Electron main process
│   ├── preload.ts          # Electron preload script
│   ├── main.tsx            # React entry point
│   ├── App.tsx             # Main React component
│   └── index.css           # Global styles
├── dist/                   # Built files
├── release/                # Packaged apps
└── assets/                 # Icons and resources
```

## Features

- ✅ **Drag & Drop** - Native file drag and drop support
- ✅ **File Picker** - Windows file dialog integration
- ✅ **Real-time Updates** - WebSocket connection to backend
- ✅ **Progress Tracking** - Visual progress indicators
- ✅ **Findings Display** - Audit results with severity levels
- ✅ **Windows Integration** - Native Windows app behavior
- ✅ **Auto-updater** - Built-in update mechanism

## Backend Integration

The Windows app connects to the same backend as the macOS version:

- **API Endpoint**: `https://auditor-edge.evanhaque1.workers.dev`
- **WebSocket**: `wss://auditor-edge.evanhaque1.workers.dev/ws/run/{runId}`
- **Authentication**: Uses the same JWT token system

## Building for Distribution

1. **Test the app:**

   ```bash
   npm run dev
   ```

2. **Build production version:**

   ```bash
   npm run build
   ```

3. **Create Windows installer:**
   ```bash
   npm run dist:win
   ```

The installer will be created in `release/` directory.

## Troubleshooting

### Common Issues

1. **Build fails:**

   - Ensure Node.js 18+ is installed
   - Delete `node_modules` and run `npm install` again

2. **Electron won't start:**

   - Check if port 5173 is available
   - Try `npm run build` first, then `npm run dev:main`

3. **File picker doesn't work:**
   - Ensure the app has proper permissions
   - Check Windows security settings

### Development Tips

- Use `Ctrl+Shift+A` to toggle window visibility
- Check browser dev tools for renderer process debugging
- Use `Ctrl+Shift+I` to open dev tools in production

## Deployment

The Windows app can be distributed as:

- **NSIS Installer** - Standard Windows installer
- **Portable App** - No installation required
- **Auto-updater** - Automatic updates via GitHub releases

## Support

For issues and questions:

- Check the main project documentation
- Review the backend API documentation
- Test with the same backend as macOS version



