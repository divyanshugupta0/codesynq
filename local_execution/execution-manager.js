/**
 * CodeSynq Execution Manager
 * Manages code execution - switches between local execution service and remote server.
 * This module integrates with the main CodeSynq app.
 */

class ExecutionManager {
    constructor() {
        this.localClient = null;
        this.isLocalAvailable = false;
        this.executionMode = 'auto'; // 'auto', 'local', 'remote'
        this.statusIndicator = null;
        this.onExecutionStart = null;
        this.onExecutionOutput = null;
        this.onExecutionComplete = null;
        this.onExecutionError = null;

        this.init();
    }

    async init() {
        // Check if device is mobile/tablet - local execution only works on desktop
        this.isMobileDevice = this.checkIfMobileDevice();

        if (this.isMobileDevice) {
            // Hide local execution UI elements on mobile
            this.hideLocalExecutionUI();
            console.log('[ExecutionManager] Mobile device detected - local execution disabled');
            return;
        }

        // Initialize local executor client (desktop only)
        if (typeof LocalExecutorClient !== 'undefined') {
            this.localClient = new LocalExecutorClient({
                onStatusChange: (status) => this.handleLocalStatusChange(status),
                onOutput: (data) => this.handleOutput(data)
            });
        }

        // Create UI elements
        this.createStatusUI();

        // Setup settings dropdown integration
        this.setupSettingsIntegration();

        // Initial status check
        await this.checkLocalService();
    }

    // Check if device is mobile or tablet
    checkIfMobileDevice() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;

        // Check for mobile/tablet user agents
        const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;

        // Also check screen size (tablets and phones typically < 1024px width)
        const isSmallScreen = window.innerWidth < 1024;

        // Check for touch-only device (no mouse)
        const isTouchDevice = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

        return mobileRegex.test(userAgent) || (isSmallScreen && isTouchDevice);
    }

    // Hide local execution UI elements on mobile
    hideLocalExecutionUI() {
        // Hide the execution section in settings dropdown
        const executionSection = document.querySelector('#executionModeSelect')?.closest('.settings-section');
        if (executionSection) {
            executionSection.style.display = 'none';
        }

        // Hide individual elements if section approach doesn't work
        const elementsToHide = [
            '#executionModeSelect',
            '#localServiceStatus',
            '#setupLocalServiceBtn'
        ];

        elementsToHide.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                const parent = el.closest('.setting-item') || el.closest('.settings-section');
                if (parent) parent.style.display = 'none';
            }
        });
    }

    // Setup integration with settings dropdown
    setupSettingsIntegration() {
        // Execution mode select in settings
        const modeSelect = document.getElementById('executionModeSelect');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                this.setExecutionMode(e.target.value);
            });
        }

        // Setup hover effect for the setup button
        const setupBtn = document.getElementById('setupLocalServiceBtn');
        if (setupBtn) {
            setupBtn.addEventListener('mouseenter', () => {
                setupBtn.style.background = 'var(--bg-tertiary, #2d2d30)';
            });
            setupBtn.addEventListener('mouseleave', () => {
                setupBtn.style.background = 'transparent';
            });
        }
    }

    // Update settings dropdown UI
    updateSettingsUI() {
        // Update execution mode select
        const modeSelect = document.getElementById('executionModeSelect');
        if (modeSelect && modeSelect.value !== this.executionMode) {
            modeSelect.value = this.executionMode;
        }

        // Update local service indicator
        const indicator = document.getElementById('localServiceIndicator');
        const statusText = document.getElementById('localServiceText');

        if (indicator && statusText) {
            if (this.isLocalAvailable) {
                indicator.style.background = '#4ec9b0'; // Green
                statusText.textContent = 'Local Service: Online';
                statusText.style.color = '#4ec9b0';
            } else {
                indicator.style.background = '#f14c4c'; // Red
                statusText.textContent = 'Local Service: Offline';
                statusText.style.color = '#f14c4c';
            }
        }
    }

    // Check if local service is available
    async checkLocalService() {
        if (!this.localClient) {
            this.isLocalAvailable = false;
            return false;
        }

        const result = await this.localClient.checkConnection();
        this.isLocalAvailable = result.connected;
        this.updateStatusUI();
        return result.connected;
    }

    // Handle status changes from local client
    handleLocalStatusChange(status) {
        this.isLocalAvailable = status.connected;
        this.updateStatusUI();

        if (status.connected) {
            console.log('[ExecutionManager] Local service connected:', status.serviceInfo);
        } else {
            console.log('[ExecutionManager] Local service disconnected');
        }
    }

    // Handle output from execution
    handleOutput(data) {
        if (this.onExecutionOutput) {
            this.onExecutionOutput(data);
        }

        // Also send to terminal if available
        if (typeof writeToTerminal === 'function') {
            const text = data.data || '';
            if (data.type === 'stderr') {
                writeToTerminal('\x1b[31m' + text + '\x1b[0m'); // Red for errors
            } else if (data.type === 'info') {
                writeToTerminal('\x1b[36m' + text + '\x1b[0m'); // Cyan for info
            } else {
                writeToTerminal(text);
            }
        }
    }

    // Create status UI in the status bar
    createStatusUI() {
        // Find status bar
        const statusBar = document.querySelector('.status-left');
        if (!statusBar) return;

        // Create execution status indicator
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.className = 'status-item execution-status';
        this.statusIndicator.id = 'executionStatus';
        this.statusIndicator.innerHTML = `
            <i class="fas fa-microchip"></i>
            <span class="exec-status-text">Checking...</span>
        `;
        this.statusIndicator.title = 'Click to change execution mode';
        this.statusIndicator.style.cursor = 'pointer';
        this.statusIndicator.onclick = () => this.showExecutionModeMenu();

        // Insert after server status
        const serverStatus = document.getElementById('serverStatus');
        if (serverStatus && serverStatus.nextSibling) {
            statusBar.insertBefore(this.statusIndicator, serverStatus.nextSibling);
        } else {
            statusBar.appendChild(this.statusIndicator);
        }

        // Create dropdown menu
        this.createModeMenu();

        this.updateStatusUI();
    }

    // Create execution mode menu
    createModeMenu() {
        const menu = document.createElement('div');
        menu.id = 'executionModeMenu';
        menu.className = 'dropdown-menu execution-mode-menu';
        menu.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 10px;
            background: var(--bg-secondary, #252526);
            border: 1px solid var(--border-color, #3e3e42);
            border-radius: 6px;
            padding: 8px 0;
            min-width: 200px;
            z-index: 10000;
            display: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;

        menu.innerHTML = `
            <div class="exec-menu-header" style="padding: 8px 12px; font-size: 11px; color: var(--text-secondary, #858585); border-bottom: 1px solid var(--border-color, #3e3e42);">
                Execution Mode
            </div>
            <div class="exec-menu-option" data-mode="auto" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-magic" style="width: 16px;"></i>
                <div>
                    <div style="font-weight: 500;">Auto</div>
                    <div style="font-size: 11px; color: var(--text-secondary, #858585);">Use local if available</div>
                </div>
            </div>
            <div class="exec-menu-option" data-mode="local" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-desktop" style="width: 16px;"></i>
                <div>
                    <div style="font-weight: 500;">Local Only</div>
                    <div style="font-size: 11px; color: var(--text-secondary, #858585);">Execute on your device</div>
                </div>
            </div>
            <div class="exec-menu-option" data-mode="remote" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-cloud" style="width: 16px;"></i>
                <div>
                    <div style="font-weight: 500;">Remote Only</div>
                    <div style="font-size: 11px; color: var(--text-secondary, #858585);">Execute on server</div>
                </div>
            </div>
            <div style="border-top: 1px solid var(--border-color, #3e3e42); margin-top: 8px; padding-top: 8px;">
                <div class="exec-menu-option" id="localServiceAction" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-download" style="width: 16px;"></i>
                    <div>
                        <div style="font-weight: 500;">Setup Local Service</div>
                        <div style="font-size: 11px; color: var(--text-secondary, #858585);">Download and install</div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(menu);

        // Add hover effects
        const options = menu.querySelectorAll('.exec-menu-option');
        options.forEach(opt => {
            opt.addEventListener('mouseenter', () => {
                opt.style.background = 'var(--bg-tertiary, #2d2d30)';
            });
            opt.addEventListener('mouseleave', () => {
                opt.style.background = 'transparent';
            });

            if (opt.dataset.mode) {
                opt.addEventListener('click', () => {
                    this.setExecutionMode(opt.dataset.mode);
                    menu.style.display = 'none';
                });
            }
        });

        // Setup local service action
        document.getElementById('localServiceAction').addEventListener('click', () => {
            this.showLocalServiceSetup();
            menu.style.display = 'none';
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== this.statusIndicator && !this.statusIndicator.contains(e.target)) {
                menu.style.display = 'none';
            }
        });
    }

    // Show execution mode menu
    showExecutionModeMenu() {
        const menu = document.getElementById('executionModeMenu');
        if (menu) {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';

            // Update active state
            const options = menu.querySelectorAll('.exec-menu-option[data-mode]');
            options.forEach(opt => {
                const checkmark = opt.querySelector('.checkmark');
                if (checkmark) checkmark.remove();

                if (opt.dataset.mode === this.executionMode) {
                    const check = document.createElement('i');
                    check.className = 'fas fa-check checkmark';
                    check.style.cssText = 'margin-left: auto; color: var(--accent-primary, #0078d4);';
                    opt.appendChild(check);
                }
            });
        }
    }

    // Show local service setup instructions
    showLocalServiceSetup() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'localServiceSetupModal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 550px;">
                <h2 style="margin-bottom: 16px;"><i class="fas fa-desktop" style="margin-right: 8px; color: #4ec9b0;"></i>Setup Local Execution</h2>
                <p style="margin-bottom: 16px; color: var(--text-secondary);">
                    Run code on your own device for faster execution and privacy. <strong>One-click setup - no manual steps needed!</strong>
                </p>
                
                <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 20px; border-radius: 12px; margin-bottom: 16px; border: 1px solid #3d7ab8;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                        <i class="fas fa-magic" style="font-size: 24px; color: #4ec9b0;"></i>
                        <div>
                            <h4 style="margin: 0; color: #fff;">One-Click Auto Setup</h4>
                            <span style="font-size: 12px; color: #a0c4e8;">Everything is automatic - just download and run!</span>
                        </div>
                    </div>
                    <ol style="margin: 0; padding-left: 20px; line-height: 2; color: #e0e0e0;">
                        <li>Click <strong style="color: #4ec9b0;">Download & Install</strong> button below</li>
                        <li>Extract the ZIP and run <strong style="color: #4ec9b0;">INSTALL.bat</strong></li>
                        <li>Done! Service starts automatically with Windows</li>
                    </ol>
                </div>
                
                <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <h4 style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="margin-right: 8px; color: #4ec9b0;"></i>What Gets Installed</h4>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.6; font-size: 13px; color: var(--text-secondary);">
                        <li>Local execution server on port 3001</li>
                        <li>Auto-starts with Windows (can be disabled)</li>
                        <li>Desktop shortcut for manual control</li>
                        <li>Node.js (if not already installed)</li>
                    </ul>
                </div>
                
                <div style="background: var(--bg-tertiary); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-info-circle" style="color: #569cd6;"></i>
                    <span style="font-size: 12px; color: var(--text-secondary);">
                        Supports: Python, JavaScript, Java, C, C++ (compilers must be installed separately)
                    </span>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn-secondary" onclick="document.getElementById('localServiceSetupModal').remove()">Cancel</button>
                    <button class="btn-primary" onclick="window.executionManager.downloadLocalService()" style="background: linear-gradient(135deg, #0078d4, #00a86b); border: none;">
                        <i class="fas fa-download" style="margin-right: 6px;"></i>Download & Install
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    // Download local service package
    downloadLocalService() {
        // Create a downloadable ZIP of the local_execution folder
        const files = {
            'local-server.js': this.getServerCode(),
            'local-executor-client.js': this.getClientCode(),
            'start-service.bat': this.getStartBat(),
            'stop-service.bat': this.getStopBat(),
            'OneClickSetup.bat': this.getOneClickBat(),
            'setup.ps1': this.getSetupPs1(),
            'auto-setup.bat': this.getAutoSetupBat(),
            'package.json': this.getPackageJson(),
            'README.txt': this.getReadme()
        };

        // Create and download the package
        this.createAndDownloadZip(files);

        if (typeof showNotification === 'function') {
            showNotification('Download started! Extract the ZIP and run OneClickSetup.bat', 'success');
        }

        const modal = document.getElementById('localServiceSetupModal');
        if (modal) modal.remove();
    }

    // Create ZIP file and trigger download
    async createAndDownloadZip(files) {
        // For browsers without JSZip, we'll create a simple download page
        // that fetches files from the server

        // Try to download from server first
        const serverUrl = window.location.origin;
        const downloadUrl = `${serverUrl}/local_execution/CodeSynq-LocalExecution.zip`;

        // Create download link
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'CodeSynq-LocalExecution.zip';

        // Fallback: create a data URL with instructions
        try {
            const response = await fetch(downloadUrl);
            if (response.ok) {
                const blob = await response.blob();
                link.href = URL.createObjectURL(blob);
            } else {
                throw new Error('ZIP not found');
            }
        } catch (e) {
            // Fallback: direct folder path for local development
            if (typeof showNotification === 'function') {
                showNotification('Local service files are in the "local_execution" folder. Run OneClickSetup.bat to install.', 'info');
            }

            // Try opening the folder location
            const folderPath = 'local_execution/';
            window.open(folderPath, '_blank');
            return;
        }

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // File content getters for creating downloadable package
    getServerCode() {
        return `// CodeSynq Local Server - See local-server.js`;
    }

    getClientCode() {
        return `// CodeSynq Local Client - See local-executor-client.js`;
    }

    getStartBat() {
        return `@echo off
title CodeSynq Local Execution Service
echo Starting CodeSynq Local Execution Service...
cd /d "%~dp0"
node local-server.js
pause`;
    }

    getStopBat() {
        return `@echo off
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /PID %%a /F
echo Service stopped.`;
    }

    getOneClickBat() {
        return `@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if %ERRORLEVEL% NEQ 0 call "%~dp0auto-setup.bat"`;
    }

    getSetupPs1() {
        return `# PowerShell Auto-Setup - See setup.ps1`;
    }

    getAutoSetupBat() {
        return `# Batch Auto-Setup - See auto-setup.bat`;
    }

    getPackageJson() {
        return JSON.stringify({
            name: "codesynq-local-execution",
            version: "1.0.0",
            main: "local-server.js",
            scripts: { start: "node local-server.js" }
        }, null, 2);
    }

    getReadme() {
        return `CodeSynq Local Execution Service
=================================

QUICK START:
1. Run OneClickSetup.bat (double-click)
2. Everything installs automatically
3. Service starts with Windows

MANUAL START:
- Run start-service.bat

STOP SERVICE:
- Run stop-service.bat

The service runs on http://127.0.0.1:3001`;
    }

    // Update status UI
    updateStatusUI() {
        if (!this.statusIndicator) return;

        const textSpan = this.statusIndicator.querySelector('.exec-status-text');
        const icon = this.statusIndicator.querySelector('i');

        let statusText = '';
        let iconClass = 'fas fa-microchip';
        let color = '';

        switch (this.executionMode) {
            case 'local':
                if (this.isLocalAvailable) {
                    statusText = 'Local';
                    iconClass = 'fas fa-desktop';
                    color = '#4ec9b0'; // Green
                } else {
                    statusText = 'Local (Offline)';
                    iconClass = 'fas fa-exclamation-triangle';
                    color = '#f14c4c'; // Red
                }
                break;
            case 'remote':
                statusText = 'Remote';
                iconClass = 'fas fa-cloud';
                color = '#569cd6'; // Blue
                break;
            case 'auto':
            default:
                if (this.isLocalAvailable) {
                    statusText = 'Local';
                    iconClass = 'fas fa-desktop';
                    color = '#4ec9b0'; // Green
                } else {
                    statusText = 'Remote';
                    iconClass = 'fas fa-cloud';
                    color = '#569cd6'; // Blue
                }
                break;
        }

        if (textSpan) textSpan.textContent = statusText;
        if (icon) {
            icon.className = iconClass;
            icon.style.color = color;
        }

        this.statusIndicator.title = `Execution: ${statusText}\nMode: ${this.executionMode}\nClick to change`;

        // Also update settings dropdown
        this.updateSettingsUI();
    }

    // Set execution mode
    setExecutionMode(mode) {
        this.executionMode = mode;
        this.updateStatusUI();

        // Save preference
        try {
            localStorage.setItem('codesynq_execution_mode', mode);
        } catch (e) { }

        if (typeof showNotification === 'function') {
            const modeNames = {
                'auto': 'Auto (uses local if available)',
                'local': 'Local execution only',
                'remote': 'Remote server only'
            };
            showNotification(`Execution mode: ${modeNames[mode]}`, 'info');
        }
    }

    // Execute code - main entry point
    async execute(code, language, options = {}) {
        const { roomId, socket } = options;

        // Determine execution target
        let useLocal = false;

        switch (this.executionMode) {
            case 'local':
                useLocal = true;
                break;
            case 'remote':
                useLocal = false;
                break;
            case 'auto':
            default:
                useLocal = this.isLocalAvailable;
                break;
        }

        if (this.onExecutionStart) {
            this.onExecutionStart({ mode: useLocal ? 'local' : 'remote', language });
        }

        // Clear terminal if available
        if (typeof clearTerminalContent === 'function') {
            clearTerminalContent();
        }

        try {
            if (useLocal) {
                return await this.executeLocal(code, language);
            } else {
                return await this.executeRemote(code, language, roomId, socket);
            }
        } catch (error) {
            if (this.onExecutionError) {
                this.onExecutionError(error);
            }
            return {
                success: false,
                error: error.message,
                exitCode: -1
            };
        }
    }

    // Execute code locally
    async executeLocal(code, language) {
        if (!this.localClient) {
            throw new Error('Local executor client not available');
        }

        if (!this.isLocalAvailable) {
            throw new Error('Local execution service is not running');
        }

        // Write info to terminal
        if (typeof writeToTerminal === 'function') {
            writeToTerminal('\x1b[36m[Local] Executing ' + language + ' code...\x1b[0m\r\n');
        }

        const result = await this.localClient.execute(code, language);

        if (this.onExecutionComplete) {
            this.onExecutionComplete(result);
        }

        // Show final status
        if (typeof writeToTerminal === 'function') {
            if (result.success) {
                writeToTerminal('\r\n\x1b[32m[Local] Process exited with code 0\x1b[0m\r\n');
            } else if (result.error) {
                writeToTerminal('\r\n\x1b[31m' + result.error + '\x1b[0m\r\n');
            }
        }

        return result;
    }

    // Execute code on remote server
    async executeRemote(code, language, roomId, socket) {
        // Use existing socket-based execution
        if (socket && roomId) {
            return new Promise((resolve) => {
                if (typeof writeToTerminal === 'function') {
                    writeToTerminal('\x1b[36m[Remote] Executing ' + language + ' code...\x1b[0m\r\n');
                }

                socket.emit('execute-code', {
                    roomId: roomId,
                    code: code,
                    language: language
                });

                // The result will come through socket events
                resolve({ pending: true, mode: 'remote' });
            });
        }

        // Fallback to HTTP execution if no socket
        throw new Error('Remote execution requires socket connection');
    }

    // Stop currently running execution
    async stop() {
        if (this.isLocalAvailable && this.localClient) {
            return await this.localClient.stop();
        }
        return { stopped: false, error: 'No active execution' };
    }

    // Send input to running process
    async sendInput(input) {
        if (this.isLocalAvailable && this.localClient) {
            return await this.localClient.sendInput(input);
        }
        return { sent: false, error: 'No active execution' };
    }

    // Load saved preferences
    loadPreferences() {
        try {
            const savedMode = localStorage.getItem('codesynq_execution_mode');
            if (savedMode && ['auto', 'local', 'remote'].includes(savedMode)) {
                this.executionMode = savedMode;
                this.updateStatusUI();
            }
        } catch (e) { }
    }
}

// Auto-initialize when script loads
let executionManager = null;

document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for other scripts to load
    setTimeout(() => {
        executionManager = new ExecutionManager();
        window.executionManager = executionManager;
        executionManager.loadPreferences();
    }, 1000);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ExecutionManager };
}
