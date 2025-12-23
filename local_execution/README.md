# CodeSynq Local Execution Service

Run code locally on your own device for faster execution and privacy.

## Quick Setup

1. **Run Setup.hta** - Double-click to open the installer
2. **Select languages** - Choose which programming languages to install
3. **Click Install** - Everything is automatic!

## After Installation

Two desktop shortcuts will be created:

- **CodeSynq Service Manager** - Start/stop service, update settings
- **CodeSynq Execution Panel** - View execution history

## Files

| File | Description |
|------|-------------|
| `Setup.hta` | Visual installer/uninstaller |
| `ExecutionPanel.hta` | View execution history |
| `local-server.js` | Main execution service |
| `start-service.bat` | Start the service |
| `stop-service.bat` | Stop the service |

## How It Works

- Service runs on `http://127.0.0.1:3001`
- Automatically starts with Windows (optional)
- Supports: JavaScript, Python, Java, C, C++
- All executions are logged in Execution Panel

## Requirements

- Windows 7 or later
- Node.js (auto-installed if missing)
- Compilers for each language (can be installed via Setup)

## Uninstall

1. Run **Setup.hta** or the desktop shortcut
2. Click **Remove Engine**
3. Follow the prompts

---
Built for CodeSynq - Professional Collaborative Coding
