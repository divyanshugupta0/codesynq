/**
 * CodeSynq Local Execution Client
 * Handles NDJSON streaming from the local server.
 */
class LocalExecutorClient {
    constructor(serverUrl = 'http://127.0.0.1:3001') {
        this.serverUrl = serverUrl;
        this.clientId = null;
        this.onOutput = null; // Callback for streaming data
        this.active = false;
    }

    async execute(code, language) {
        this.active = true;
        this.clientId = null;

        try {
            const response = await fetch(`${this.serverUrl}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language })
            });

            if (!response.ok) throw new Error(`Server failed with status ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalResult = null;

            while (this.active) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep partial line

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;
                    try {
                        const message = JSON.parse(trimmedLine);

                        // Internal message routing
                        if (message.type === 'start') {
                            this.clientId = message.clientId;
                            console.log('[Local] Started with ID:', this.clientId);
                        } else if (message.type === 'output') {
                            if (this.onOutput) this.onOutput(message.data);
                        } else if (message.type === 'result' || (typeof message.success !== 'undefined')) {
                            // Support result chunk even if type property is missing (older server fallback)
                            finalResult = message;
                        }
                    } catch (e) {
                        console.warn('[Local] NDJSON Parse Warning:', trimmedLine, e);
                    }
                }
            }

            // Important: Process any remaining data in the buffer after the stream ends
            const finalBuffer = buffer.trim();
            if (finalBuffer) {
                try {
                    const message = JSON.parse(finalBuffer);
                    if (message.type === 'result' || (typeof message.success !== 'undefined')) {
                        finalResult = message;
                    } else if (message.type === 'output' && this.onOutput) {
                        this.onOutput(message.data);
                    }
                } catch (e) {
                    console.warn('[Local] Final buffer parse failed:', finalBuffer);
                }
            }

            this.active = false;
            if (finalResult) return finalResult;

            console.error('[Local] Stream ended without receiving a result chunk.');
            return {
                success: false,
                error: 'The local engine disconnected before reporting the final result. Please ensure your local service is updated and running.'
            };

        } catch (error) {
            this.active = false;
            console.error('[Local] Execution failed:', error);
            return { success: false, error: `Connection failed: ${error.message}` };
        }
    }

    async sendInput(input) {
        if (!this.clientId) return { success: false, error: 'No active session' };

        try {
            const response = await fetch(`${this.serverUrl}/input`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: this.clientId, input })
            });
            return await response.json();
        } catch (e) {
            console.error('[Local] Input failed:', e);
            return { success: false, error: e.message };
        }
    }

    stop() {
        this.active = false;
        this.clientId = null;
    }
}

if (typeof window !== 'undefined') {
    window.LocalExecutorClient = LocalExecutorClient;
}
