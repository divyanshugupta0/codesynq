# CodeSynq Local Execution Service

Execute code locally on your own device instead of sending it to a remote server.

## 🚀 Quick Start

**Just run `INSTALL.bat` - everything is automatic!**

The installer will:
- ✅ Install Node.js (required) - **Auto-downloads if missing**
- ✅ Offer to install Python - **Auto-downloads if you choose Y**
- ✅ Offer to install Java - **Auto-downloads if you choose Y**
- ✅ Offer to install GCC/G++ - **Auto-downloads if you choose Y**
- ✅ Set up the service
- ✅ Add to Windows startup
- ✅ Create a desktop shortcut with icon
- ✅ Start the service immediately

## 📦 What's in the ZIP

| File | What to do |
|------|------------|
| **`INSTALL.bat`** | 🚀 **Run this!** One-click installer |
| **`Uninstall.bat`** | 🗑️ Run to completely remove |
| `codesynq.ico` | App icon for shortcut |
| `start-service.bat` | Manual start (if needed) |
| `stop-service.bat` | Stop the service |
| Other files | Don't touch - used internally |

## 🌐 Supported Languages

| Language | Auto-Install | Notes |
|----------|--------------|-------|
| JavaScript | ✅ Always | Node.js is required and auto-installed |
| Python | ✅ Optional | Installer asks if you want to install |
| Java | ✅ Optional | Installer asks if you want to install |
| C/C++ | ✅ Optional | Installer asks if you want to install MinGW |

## 🗑️ Uninstall

Just run `Uninstall.bat` to completely remove:
- Stops the service
- Removes from Windows startup
- Deletes all installed files
- Removes desktop shortcut

## 🔧 Troubleshooting

### Language not working after install
- Restart your computer to refresh PATH
- Or open a new Command Prompt and run the service again

### Service not connecting
1. Make sure you ran `INSTALL.bat`
2. Check the desktop shortcut - double-click to start
3. Look for port 3001 being used

### Manual installation of compilers
If auto-install doesn't work:
- **Python**: https://www.python.org/downloads/
- **Java**: https://adoptium.net/
- **GCC/MinGW**: https://winlibs.com/

## 📡 Technical Details

- **Port**: 3001
- **Address**: http://127.0.0.1:3001
- **Install Location**: %LOCALAPPDATA%\CodeSynq\LocalExecution

## 📄 License

MIT License - Feel free to modify and distribute.
