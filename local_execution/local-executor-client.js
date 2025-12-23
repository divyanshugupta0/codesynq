/**
 * CodeSynq Local Executor Client
 * This module provides the client-side interface for the local execution service.
 * It connects to the local server running on the user's device and handles code execution.
 */

class LocalExecutorClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://127.0.0.1:3001';
        this.clientId = this.generateClientId();
        this.isConnected = false;
        this.connectionCheckInterval = null;
        this.onStatusChange = options.onStatusChange || (() => { });
        this.onOutput = options.onOutput || (() => { });
        this.retryAttempts = 0;
        this.maxRetries = 3;

        // Start connection monitoring
        this.startConnectionMonitor();
    }

    // Generate unique client ID
    generateClientId() {
        return 'client_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    // Check if local service is running
    async checkConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(2000) // 2 second timeout
            });

            if (response.ok) {
                const data = await response.json();
                this.isConnected = true;
                this.retryAttempts = 0;
                this.onStatusChange({
                    connected: true,
                    status: 'online',
                    serviceInfo: data
                });
                return { connected: true, info: data };
            }
        } catch (error) {
            this.isConnected = false;
            this.onStatusChange({
                connected: false,
                status: 'offline',
                error: error.message
            });
        }
        return { connected: false };
    }

    // Start monitoring connection
    startConnectionMonitor() {
        // Initial check
        this.checkConnection();

        // Check every 5 seconds
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();
        }, 5000);
    }

    // Stop monitoring
    stopConnectionMonitor() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }

    // Execute code locally
    async execute(code, language) {
        if (!this.isConnected) {
            const check = await this.checkConnection();
            if (!check.connected) {
                return {
                    success: false,
                    error: 'Local execution service is not running. Please start the CodeSynq Local Service.',
                    serviceNotRunning: true
                };
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Client-ID': this.clientId
                },
                body: JSON.stringify({
                    code: code,
                    language: language,
                    clientId: this.clientId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Execution failed',
                    exitCode: -1
                };
            }

            const result = await response.json();

            // Process stream output
            if (result.streamOutput && result.streamOutput.length > 0) {
                result.streamOutput.forEach(item => {
                    this.onOutput(item);
                });
            }

            return result;

        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                return {
                    success: false,
                    error: 'Cannot connect to local execution service. Please make sure the service is running.',
                    serviceNotRunning: true
                };
            }
            return {
                success: false,
                error: error.message,
                exitCode: -1
            };
        }
    }

    // Stop currently running process
    async stop() {
        if (!this.isConnected) {
            return { stopped: false, error: 'Service not connected' };
        }

        try {
            const response = await fetch(`${this.baseUrl}/stop`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Client-ID': this.clientId
                },
                body: JSON.stringify({
                    clientId: this.clientId
                })
            });

            return await response.json();

        } catch (error) {
            return { stopped: false, error: error.message };
        }
    }

    // Send input to running process
    async sendInput(input) {
        if (!this.isConnected) {
            return { sent: false, error: 'Service not connected' };
        }

        try {
            const response = await fetch(`${this.baseUrl}/input`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Client-ID': this.clientId
                },
                body: JSON.stringify({
                    clientId: this.clientId,
                    input: input
                })
            });

            return await response.json();

        } catch (error) {
            return { sent: false, error: error.message };
        }
    }

    // Get service status
    async getStatus() {
        try {
            const response = await fetch(`${this.baseUrl}/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(2000)
            });

            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            return { online: false, error: error.message };
        }
        return { online: false };
    }

    // Cleanup
    destroy() {
        this.stopConnectionMonitor();
    }
}

// Export for browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LocalExecutorClient };
} else if (typeof window !== 'undefined') {
    window.LocalExecutorClient = LocalExecutorClient;
}
