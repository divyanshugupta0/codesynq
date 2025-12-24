/**
 * CodeSynq Execution Manager
 * Orchestrates local and remote code execution logic.
 */
class ExecutionManager {
    constructor() {
        this.localClient = new LocalExecutorClient();
        this.executionMode = 'auto'; // 'auto', 'local', 'remote'
        this.isLocalServerUp = false;
        this.onExecutionOutput = null; // High-level output handler

        // Auto-detect local server
        this.checkLocalStatus();
        setInterval(() => this.checkLocalStatus(), 5000);

        console.log('[ExecutionManager] Initialized');
    }

    // Compatibility getter for legacy nexuscode.js logic
    get isLocalAvailable() {
        return this.isLocalServerUp;
    }

    async checkLocalStatus() {
        try {
            const res = await fetch(`${this.localClient.serverUrl}/health`, {
                method: 'GET',
                cache: 'no-store'
            });
            const wasUp = this.isLocalServerUp;
            this.isLocalServerUp = res.ok;

            if (wasUp !== this.isLocalServerUp) {
                console.log(`[ExecutionManager] Local service is now ${this.isLocalServerUp ? 'ONLINE' : 'OFFLINE'}`);
            }
        } catch (e) {
            this.isLocalServerUp = false;
        }

        // Update UI status if function exists
        if (typeof window.updateLocalStatusUI === 'function') {
            window.updateLocalStatusUI(this.isLocalServerUp);
        }
    }

    async execute(code, language) {
        // Determine mode
        let modeToUse = this.executionMode;
        if (modeToUse === 'local') {
            modeToUse = 'local';
        } else if (modeToUse === 'auto') {
            modeToUse = this.isLocalServerUp ? 'local' : 'remote';
        }

        console.log(`[ExecutionManager] Executing in ${modeToUse} mode. (Local Up: ${this.isLocalServerUp})`);

        if (modeToUse === 'local' && this.isLocalServerUp) {
            // Local Execution Path
            this.localClient.onOutput = (data) => {
                if (this.onExecutionOutput) this.onExecutionOutput(data);
            };
            return await this.localClient.execute(code, language);
        } else {
            // Remote Execution Path (delegates to legacy socket.io system)
            return new Promise((resolve) => {
                if (!window.socket || !window.socket.connected) {
                    return resolve({ success: false, error: 'Remote server not connected' });
                }

                const executionId = 'remote_' + Date.now();
                window.socket.emit('execute-code', {
                    code,
                    language,
                    executionId,
                    roomId: window.currentRoom || 'local'
                });

                // The actual result will arrive via 'execution-result' socket event
                // This promise acts as a placeholder for the legacy flow
                resolve({ success: true, mode: 'remote' });
            });
        }
    }

    async showLocalServiceSetup() {
        console.log('[ExecutionManager] Setup requested...');

        // If local server is already up, try to open the local setup UI
        if (this.isLocalServerUp) {
            try {
                const res = await fetch(`${this.localClient.serverUrl}/setup`);
                const data = await res.json();
                if (data.success) {
                    console.log('[ExecutionManager] Setup opened via local server');
                    if (typeof window.showNotification === 'function') {
                        showNotification('Opening Setup Interface...', 'info');
                    }
                    return; // Successfully opened locally
                }
            } catch (e) {
                console.warn('[ExecutionManager] Failed to trigger local setup, falling back to modal', e);
            }
        }

        // Fallback: Show the onboarding modal
        const modal = document.getElementById('localServiceSetupModal');
        if (modal) {
            modal.style.display = 'block';
        } else {
            console.error('Local service setup modal not found in DOM');
            alert('Setup Modal not found. Please download the service at /local_execution/CodeSynq-LocalExecution.zip');
        }
    }
}

// Global initialization
if (typeof window !== 'undefined') {
    window.executionManager = new ExecutionManager();
}
