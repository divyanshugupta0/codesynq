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
        this.pollFailCount = 0;

        // Auto-detect local server
        this.checkLocalStatus();

        console.log('[ExecutionManager] Initialized');
    }

    // Compatibility getter for legacy nexuscode.js logic
    get isLocalAvailable() {
        return this.isLocalServerUp;
    }

    async checkLocalStatus() {
        // Don't poll if user explicitly wants remote only
        if (this.executionMode === 'remote') {
            this.scheduleNextCheck(10000);
            return;
        }

        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 1000); // 1s timeout

            const res = await fetch(`${this.localClient.serverUrl}/health`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(id);

            const wasUp = this.isLocalServerUp;
            this.isLocalServerUp = res.ok;
            this.pollFailCount = 0; // Reset fail count on success

            if (wasUp !== this.isLocalServerUp) {
                console.log(`[ExecutionManager] Local service is now ${this.isLocalServerUp ? 'ONLINE' : 'OFFLINE'}`);
            }
        } catch (e) {
            this.isLocalServerUp = false;
            this.pollFailCount++;
        }

        // Update UI status if function exists
        if (typeof window.updateLocalStatusUI === 'function') {
            window.updateLocalStatusUI(this.isLocalServerUp);
        }

        this.scheduleNextCheck();
    }

    scheduleNextCheck(delay) {
        // If specific delay not provided, calculate based on failures
        // Successful/idle: 5s
        // Failing: start at 5s, max at 60s
        if (!delay) {
            delay = Math.min(5000 + (this.pollFailCount * 5000), 60000);
        }

        setTimeout(() => this.checkLocalStatus(), delay);
    }

    async execute(code, language) {
        // Check if connected to peer execution host first
        if (window.peerExecution && window.peerExecution.isConnectedToHost()) {
            console.log('[ExecutionManager] Executing via Peer Connection');
            try {
                return await window.peerExecution.executeRemote(code, language);
            } catch (error) {
                console.error('[ExecutionManager] Peer execution failed:', error);
                return { success: false, error: error.message };
            }
        }

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
