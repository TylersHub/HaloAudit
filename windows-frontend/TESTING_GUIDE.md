# HaloAudit Windows - Testing Guide

## 🧪 Complete Integration Test

This guide will help you test the complete Windows port integration with your existing backend.

---

## 📋 Prerequisites

1. **Backend Running** - Your Cloudflare Workers API should be deployed
2. **Agent Running** - Python agent should be processing jobs
3. **Windows App Built** - Electron app should be ready

---

## 🚀 Step-by-Step Testing

### 1. Start the Backend Agent

```bash
cd agent
source venv/bin/activate
python -m src.main
```

**Expected output:**

```
INFO: Configuration loaded successfully
INFO: Pipeline runner initialized
INFO: Health server listening on port 8080
INFO: Starting edge job pull loop
INFO: Pulled 0 jobs from edge queue
```

### 2. Start the Windows App

```bash
cd windows-frontend
npm run dev
```

**Expected behavior:**

- Electron window opens
- Shows HaloAudit interface
- Glass morphism effect visible
- Upload zone ready for files

### 3. Test File Upload

**Option A: Drag & Drop**

1. Drag a PDF file from Windows Explorer
2. Drop it onto the upload zone
3. Watch the upload progress

**Option B: File Picker**

1. Click "Choose File" button
2. Select a PDF file in the Windows dialog
3. Click "Open"

**Expected flow:**

1. **Creating upload...** (0%)
2. **Uploading file...** (30%)
3. **Queuing for processing...** (60%)
4. **Processing started...** (WebSocket connects)
5. **Real-time updates** from agent
6. **Processing complete!** (100%)

### 4. Verify Backend Integration

**Check agent logs for:**

```
INFO: Pulled 1 jobs from edge queue
INFO: Processing job job_...
INFO: [run_123] Starting ingest phase
INFO: [run_123] Starting extract phase
INFO: [run_123] Starting chunk phase
...
INFO: [run_123] Pipeline completed successfully
```

**Check WebSocket connection:**

- Green "Live" indicator should appear
- Progress updates should stream in real-time
- Phase changes should be visible

### 5. Test Findings Display

**Expected results:**

- Findings appear when processing completes
- Severity badges show correct colors
- Finding details display properly
- Empty state shows if no issues found

---

## 🔍 Detailed Test Cases

### Test Case 1: Basic Upload Flow

1. **Start**: App in idle state
2. **Action**: Upload a PDF file
3. **Expected**: Complete flow from upload to findings

**Success Criteria:**

- [ ] File uploads successfully
- [ ] Job appears in backend queue
- [ ] Agent picks up job within 1 second
- [ ] WebSocket connects and shows progress
- [ ] Processing completes with findings

### Test Case 2: Error Handling

1. **Start**: App in idle state
2. **Action**: Upload an invalid file type
3. **Expected**: Error message displayed

**Success Criteria:**

- [ ] Invalid file rejected
- [ ] Error message shown
- [ ] App returns to idle state
- [ ] Retry button works

### Test Case 3: WebSocket Connection

1. **Start**: Upload a file
2. **Action**: Watch real-time updates
3. **Expected**: Live progress updates

**Success Criteria:**

- [ ] WebSocket connects successfully
- [ ] Progress updates stream in real-time
- [ ] Phase changes are visible
- [ ] Connection indicator shows "Live"

### Test Case 4: Window Management

1. **Start**: App window visible
2. **Action**: Test window controls
3. **Expected**: Proper window behavior

**Success Criteria:**

- [ ] `Ctrl+Shift+A` toggles window
- [ ] Close button hides window
- [ ] Minimize button works
- [ ] Window stays on top

---

## 🐛 Troubleshooting

### Common Issues

1. **WebSocket won't connect:**

   - Check if backend is running
   - Verify WebSocket URL in code
   - Check Windows Firewall settings

2. **File upload fails:**

   - Check backend API endpoint
   - Verify R2 credentials
   - Check file size limits

3. **Agent not processing:**

   - Check agent logs for errors
   - Verify environment variables
   - Check job queue status

4. **UI not updating:**
   - Check React dev tools
   - Verify state management
   - Check WebSocket message format

### Debug Commands

```bash
# Check backend health
curl https://auditor-edge.evanhaque1.workers.dev/

# Check job queue
curl https://auditor-edge.evanhaque1.workers.dev/jobs/stats \
  -H "Authorization: Bearer cyZwlCFe8WIwvip6Lf5SMcb1eIYh7nqz9WUryMa5CtM"

# Check agent health
curl http://localhost:8080/healthz
```

---

## ✅ Success Criteria

The Windows port is working correctly if:

- [ ] **File Upload**: PDF/CSV files upload successfully
- [ ] **Backend Integration**: Jobs appear in backend queue
- [ ] **Agent Processing**: Agent picks up and processes jobs
- [ ] **Real-time Updates**: WebSocket shows live progress
- [ ] **Findings Display**: Audit results show correctly
- [ ] **Error Handling**: Errors are handled gracefully
- [ ] **Window Management**: Window controls work properly
- [ ] **UI/UX**: Interface looks and feels native

---

## 🎉 Integration Complete!

If all tests pass, you have successfully created a **complete Windows port** of HaloAudit that:

- ✅ **Functions identically** to the macOS version
- ✅ **Integrates seamlessly** with your existing backend
- ✅ **Provides native Windows experience**
- ✅ **Maintains real-time updates** via WebSocket
- ✅ **Handles errors gracefully**

**Your Windows port is ready for production use!** 🚀



