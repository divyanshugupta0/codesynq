/**
 * CodeSynq Peer Execution Sharing
 * Allows users to share their local execution environment with others via WebRTC/Firebase
 * Works from the live deployed site - no local network discovery needed
 */

class PeerExecutionManager {
    constructor() {
        // Sharing state
        this.isSharing = false;
        this.connectionCode = null;
        this.connectedPeers = new Map();
        this.hostConnection = null;

        // Firebase Relay state
        this.useFirebaseRelay = false;
        this.relayRef = null;

        // Firebase references
        this.sharingRef = null;
        this.offersRef = null;

        // Local executor
        this.localExecutor = null;

        // UI
        this.modalId = 'peerExecutionModal';

        // Initialize
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    // =========================================================================
    // FIREBASE RELAY FALLBACK
    // =========================================================================

    enableFirebaseRelay(connectionCode, role, peerId) {
        console.log(`[PeerExec] Using Firebase Relay (${role})`);
        this.useFirebaseRelay = true;
        this.connectionCode = connectionCode;

        const path = `execution_sharing/${connectionCode}/relay`;
        this.relayRef = window.database.ref(path);

        let listenPath = '';
        if (role === 'host') {
            listenPath = `${path}/to_host/${peerId}`;
        } else {
            listenPath = `${path}/to_client/${peerId}`;
        }

        window.database.ref(listenPath).on('child_added', (snapshot) => {
            const msg = snapshot.val();
            if (!msg) return;

            if (msg.timestamp < Date.now() - 10000) return;

            this.handleRelayMessage(msg.data, role === 'host' ? peerId : 'host');

            // Auto-delete message after processing
            snapshot.ref.remove();
        });

        if (role === 'client') {
            this.updateStatusBarButton(true, this.hostConnection?.hostName || 'Host (Relay)');
            document.getElementById('connectNotConnected').style.display = 'none';
            document.getElementById('connectIsConnected').style.display = 'block';
            document.getElementById('connectedHostName').textContent = (this.hostConnection?.hostName || 'Host') + ' (Relay)';
            
            if (typeof switchTab === 'function') {
                switchTab('terminal');
            }
            
            const terminal = this.ensureTerminalReady();
            if (terminal) {
                terminal.writeln('\r\n\x1b[33m[Relay] Connected via Firebase\x1b[0m');
                terminal.writeln('\x1b[33mReady to execute code...\x1b[0m\r\n');
            }
            
            this.showNotification('Connected via Firebase Relay!', 'success');
        }
    }

    handleRelayMessage(data, fromId) {
        const message = JSON.parse(data);
        console.log('[PeerExec] Relay message:', message.type);

        if (this.hostConnection) {
            // I am CLIENT
            if (message.type === 'output') {
                console.log('[PeerExec] Client received output:', message.data);
                const terminal = this.ensureTerminalReady();
                
                if (!terminal) {
                    console.error('[PeerExec] No terminal available for output!');
                    return;
                }

                let output = message.data;
                if (typeof output !== 'string') {
                    output = String(output || '');
                }

                if (output.includes('{"type":')) {
                    try {
                        const fixedJson = '[' + output.replace(/\}\{/g, '},{') + ']';
                        const msgs = JSON.parse(fixedJson);

                        if (Array.isArray(msgs)) {
                            msgs.forEach(msg => {
                                if (msg.type === 'control' && msg.action === 'clear-terminal') {
                                    terminal.clear();
                                } else if (msg.data) {
                                    terminal.write(msg.data);
                                }
                            });
                            return;
                        }
                    } catch (e) {
                        console.warn('[PeerExec] Failed to parse structured output, using raw:', e);
                    }
                }

                if (output) {
                    terminal.write(output);
                }
            } else if (message.type === 'result') {
                console.log('[PeerExec] Client received result:', message);
                const terminal = this.ensureTerminalReady();

                if (terminal) {
                    if (message.error) {
                        terminal.writeln(`\r\n\x1b[31mError: ${message.error}\x1b[0m`);
                    }
                    if (typeof message.exitCode !== 'undefined') {
                        terminal.writeln(`\r\n\x1b[32m...Program finished (exit code ${message.exitCode})\x1b[0m`);
                    }
                }

                // Clean up relay data after successful result
                this.cleanupRelayData();

                if (this.pendingRelayResolve) {
                    this.pendingRelayResolve(message);
                    this.pendingRelayResolve = null;
                    this.pendingRelayReject = null;
                }

                if (typeof resetRunButton === 'function') resetRunButton();
            }
        } else {
            // I am HOST
            if (message.type === 'execute') {
                console.log('[PeerExec] Host executing for peer:', message.language);
                this.executeLocally(message.code, message.language, (output) => {
                    console.log('[PeerExec] Host sending output chunk:', output);
                    this.sendRelayData(JSON.stringify({ type: 'output', data: output }), fromId, 'host');
                }).then(result => {
                    console.log('[PeerExec] Host execution finished:', result);
                    this.sendRelayData(JSON.stringify({ type: 'result', ...result }), fromId, 'host');
                    
                    // Clean up relay data after sending result
                    setTimeout(() => this.cleanupRelayData(), 2000);
                }).catch(error => {
                    console.error('[PeerExec] Host execution error:', error);
                    this.sendRelayData(JSON.stringify({ type: 'result', success: false, error: error.message }), fromId, 'host');
                    
                    // Clean up relay data after error
                    setTimeout(() => this.cleanupRelayData(), 2000);
                });
            } else if (message.type === 'input' && this.localExecutor) {
                this.localExecutor.sendInput(message.input);
            }
        }
    }

    sendRelayData(data, targetId, fromRole) {
        if (!this.relayRef) return;

        let path = '';
        // If I am sending AS host, I send TO client
        if (fromRole === 'host') {
            path = `execution_sharing/${this.connectionCode}/relay/to_client/${targetId}`;
        } else {
            // I am sending AS client, I send TO host
            // targetId here for client->host is just my own ID so host knows who sent it
            path = `execution_sharing/${this.connectionCode}/relay/to_host/${window.currentUser.uid}`;
        }

        window.database.ref(path).push({
            data: data,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    init() {
        console.log('🔗 PeerExecutionManager Initialized');
        this.injectStyles();
        this.injectModal();

        // Get local executor if available
        if (window.executionManager) {
            this.localExecutor = window.executionManager.localClient;
        }
    }

    // =========================================================================
    // STYLES
    // =========================================================================

    injectStyles() {
        if (document.getElementById('peer-exec-styles')) return;

        const style = document.createElement('style');
        style.id = 'peer-exec-styles';
        style.textContent = `
            .peer-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(8px);
                z-index: 10000;
                display: none;
                justify-content: center;
                align-items: center;
            }
            
            .peer-modal-overlay.active {
                display: flex;
            }
            
            .peer-modal {
                background: linear-gradient(145deg, #1a1a2e, #16213e);
                border-radius: 16px;
                padding: 24px;
                width: 90%;
                max-width: 440px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
            }
            
            .peer-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .peer-header h2 {
                margin: 0;
                font-size: 18px;
                color: #fff;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .peer-header h2 i { color: #00d4ff; }
            
            .peer-close {
                background: none;
                border: none;
                color: #888;
                font-size: 20px;
                cursor: pointer;
            }
            
            .peer-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 20px;
            }
            
            .peer-tab {
                flex: 1;
                padding: 12px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #888;
                font-size: 13px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            }
            
            .peer-tab.active {
                background: linear-gradient(135deg, #00d4ff20, #7c3aed20);
                border-color: #00d4ff;
                color: #00d4ff;
            }
            
            .peer-panel { display: none; }
            .peer-panel.active { display: block; }
            
            .peer-section {
                text-align: center;
                padding: 20px 0;
            }
            
            .peer-icon {
                font-size: 40px;
                margin-bottom: 16px;
                color: #888;
            }
            
            .peer-icon.active {
                color: #00d4ff;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
            }
            
            .peer-status { color: #aaa; font-size: 14px; margin-bottom: 16px; }
            
            .peer-btn {
                padding: 14px 28px;
                font-size: 15px;
                font-weight: 600;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .peer-btn-primary {
                background: linear-gradient(135deg, #00d4ff, #7c3aed);
                color: white;
            }
            
            .peer-btn-danger {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: white;
            }
            
            .peer-code-display {
                margin: 20px 0;
                padding: 20px;
                background: rgba(0, 212, 255, 0.1);
                border-radius: 12px;
                border: 1px solid rgba(0, 212, 255, 0.3);
            }
            
            .peer-code-label {
                font-size: 11px;
                color: #888;
                margin-bottom: 8px;
            }
            
            .peer-code-value {
                font-size: 32px;
                font-weight: 700;
                letter-spacing: 6px;
                color: #00d4ff;
                font-family: 'Monaco', 'Consolas', monospace;
            }
            
            .peer-input-group {
                display: flex;
                gap: 8px;
                margin-bottom: 16px;
            }
            
            .peer-input {
                flex: 1;
                padding: 14px 16px;
                font-size: 18px;
                letter-spacing: 4px;
                text-align: center;
                background: rgba(255, 255, 255, 0.05);
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                color: #fff;
                outline: none;
                text-transform: uppercase;
            }
            
            .peer-input:focus {
                border-color: #00d4ff;
            }
            
            .peer-info {
                margin-top: 16px;
                padding: 12px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                font-size: 12px;
                color: #888;
            }
            
            .peer-info i {
                color: #22c55a;
                margin-right: 6px;
            }
            
            .peer-connected {
                padding: 20px;
                text-align: center;
            }
            
            .peer-connected-icon {
                font-size: 48px;
                color: #22c55a;
                margin-bottom: 16px;
            }
            
            .peer-connected-text {
                color: #fff;
                font-size: 16px;
            }
            
            .peer-connected-host {
                color: #00d4ff;
                font-weight: 600;
            }
            
            .peer-clients {
                margin-top: 20px;
                padding-top: 16px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .peer-clients-title {
                font-size: 12px;
                color: #888;
                margin-bottom: 10px;
            }
            
            .peer-client-item {
                display: flex;
                align-items: center;
                padding: 10px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                margin-bottom: 6px;
            }
            
            .peer-client-name {
                flex: 1;
                color: #fff;
                font-size: 13px;
            }
            
            .peer-client-status {
                font-size: 11px;
                color: #22c55a;
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================================================
    // MODAL
    // =========================================================================

    injectModal() {
        if (document.getElementById(this.modalId)) return;

        const modal = document.createElement('div');
        modal.id = this.modalId;
        modal.className = 'peer-modal-overlay';
        modal.innerHTML = `
            <div class="peer-modal">
                <div class="peer-header">
                    <h2><i class="fas fa-network-wired"></i> Share Execution</h2>
                    <button class="peer-close" onclick="peerExecution.closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="peer-tabs">
                    <button class="peer-tab active" data-tab="share" onclick="peerExecution.switchTab('share')">
                        <i class="fas fa-broadcast-tower"></i> Share
                    </button>
                    <button class="peer-tab" data-tab="connect" onclick="peerExecution.switchTab('connect')">
                        <i class="fas fa-plug"></i> Connect
                    </button>
                </div>
                
                <div id="peerSharePanel" class="peer-panel active">
                    <div class="peer-section" id="shareNotSharing">
                        <div class="peer-icon">
                            <i class="fas fa-server"></i>
                        </div>
                        <p class="peer-status">Share your local execution with others</p>
                        <p class="peer-info" style="margin-bottom: 16px;">
                            <i class="fas fa-info-circle"></i>
                            Requires local execution service running on your device
                        </p>
                        <button class="peer-btn peer-btn-primary" onclick="peerExecution.startSharing()">
                            <i class="fas fa-share-alt"></i> Start Sharing
                        </button>
                    </div>
                    
                    <div class="peer-section" id="shareIsSharing" style="display: none;">
                        <div class="peer-icon active">
                            <i class="fas fa-broadcast-tower"></i>
                        </div>
                        <p class="peer-status">Your execution environment is being shared</p>
                        
                        <div class="peer-code-display">
                            <div class="peer-code-label">Share this code with others</div>
                            <div class="peer-code-value" id="shareCodeDisplay">-----</div>
                        </div>
                        
                        <button class="peer-btn peer-btn-danger" onclick="peerExecution.stopSharing()">
                            <i class="fas fa-stop"></i> Stop Sharing
                        </button>
                        
                        <div class="peer-clients" id="connectedClients">
                            <div class="peer-clients-title">Connected Users</div>
                            <div id="clientsList"></div>
                        </div>
                    </div>
                </div>
                
                <div id="peerConnectPanel" class="peer-panel">
                    <div class="peer-section" id="connectNotConnected">
                        <div class="peer-icon">
                            <i class="fas fa-plug"></i>
                        </div>
                        <p class="peer-status">Enter the 5-digit code from the host</p>
                        
                        <div class="peer-input-group">
                            <input type="text" class="peer-input" id="connectionCodeInput" 
                                   maxlength="5" placeholder="XXXXX" autocomplete="off">
                        </div>
                        
                        <button class="peer-btn peer-btn-primary" onclick="peerExecution.connectToHost()">
                            <i class="fas fa-link"></i> Connect
                        </button>
                        
                        <div class="peer-info">
                            <i class="fas fa-info-circle"></i>
                            You'll use the host's execution environment for running code
                        </div>
                    </div>
                    
                    <div class="peer-section" id="connectIsConnected" style="display: none;">
                        <div class="peer-connected">
                            <div class="peer-connected-icon">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <div class="peer-connected-text">
                                Connected to <span class="peer-connected-host" id="connectedHostName">Host</span>
                            </div>
                            <p class="peer-info">
                                <i class="fas fa-server"></i>
                                Code execution is running on the host's device
                            </p>
                            <button class="peer-btn peer-btn-danger" style="margin-top: 20px;" onclick="peerExecution.disconnect()">
                                <i class="fas fa-unlink"></i> Disconnect
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });
    }

    openModal() {
        document.getElementById(this.modalId)?.classList.add('active');
    }

    closeModal() {
        document.getElementById(this.modalId)?.classList.remove('active');
    }

    switchTab(tab) {
        document.querySelectorAll('.peer-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        document.getElementById('peerSharePanel').classList.toggle('active', tab === 'share');
        document.getElementById('peerConnectPanel').classList.toggle('active', tab === 'connect');
    }

    // =========================================================================
    // SHARING (HOST MODE)
    // =========================================================================

    generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async startSharing() {
        // Check if local execution is available
        if (!window.executionManager?.isLocalAvailable) {
            this.showNotification('Local execution service not running. Please start it first.', 'error');
            if (window.executionManager) {
                window.executionManager.showLocalServiceSetup();
            }
            return;
        }

        this.connectionCode = this.generateCode();
        this.isSharing = true;

        // Register in Firebase
        if (window.database && window.currentUser) {
            try {
                this.sharingRef = window.database.ref(`execution_sharing/${this.connectionCode}`);
                await this.sharingRef.set({
                    hostId: window.currentUser.uid,
                    hostName: window.currentUser.displayName || window.currentUser.username || 'Host',
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    active: true
                });

                // Listen for connection requests
                this.offersRef = this.sharingRef.child('offers');
                this.offersRef.on('child_added', (snapshot) => {
                    this.handleConnectionRequest(snapshot.key, snapshot.val());
                });

                // Update UI
                document.getElementById('shareNotSharing').style.display = 'none';
                document.getElementById('shareIsSharing').style.display = 'block';
                document.getElementById('shareCodeDisplay').textContent = this.connectionCode;

                this.showNotification('Sharing started! Share the code with others.', 'success');
            } catch (error) {
                console.error('Failed to start sharing:', error);
                this.showNotification('Failed to start sharing: ' + error.message, 'error');
            }
        } else {
            this.showNotification('Please login to share execution', 'error');
        }
    }

    async stopSharing() {
        this.isSharing = false;

        // Clean up relay data
        this.cleanupRelayData();

        // Remove from Firebase
        if (this.sharingRef) {
            await this.sharingRef.remove();
            this.sharingRef = null;
        }

        if (this.offersRef) {
            this.offersRef.off();
            this.offersRef = null;
        }

        // Clear connected peers
        this.connectedPeers.clear();

        // Update UI
        document.getElementById('shareNotSharing').style.display = 'block';
        document.getElementById('shareIsSharing').style.display = 'none';

        this.showNotification('Sharing stopped', 'info');
    }

    async handleConnectionRequest(clientId, offer) {
        console.log('[PeerExec] Connection request from:', clientId);
        
        // Skip P2P setup, go directly to Firebase Relay
        this.enableFirebaseRelay(this.connectionCode, 'host', clientId);
        
        // Add client to connected peers list
        this.connectedPeers.set(clientId, {
            name: offer.clientName || 'User',
            isRelay: true
        });
        
        this.updateClientsList();
    }

    async executeLocally(code, language, onOutput) {
        if (!this.localExecutor) {
            this.localExecutor = window.executionManager?.localClient;
        }

        if (!this.localExecutor) {
            throw new Error('Local executor not available');
        }

        this.localExecutor.onOutput = onOutput;
        return await this.localExecutor.execute(code, language);
    }

    updateClientsList() {
        const list = document.getElementById('clientsList');
        if (!list) return;

        if (this.connectedPeers.size === 0) {
            list.innerHTML = '<div style="color: #666; font-size: 12px; padding: 8px;">No users connected yet</div>';
            return;
        }

        list.innerHTML = Array.from(this.connectedPeers.entries()).map(([id, peer]) => `
            <div class="peer-client-item">
                <span class="peer-client-name">${peer.name}</span>
                <span class="peer-client-status"><i class="fas fa-circle"></i> Online</span>
            </div>
        `).join('');
    }

    // =========================================================================
    // CONNECTING (CLIENT MODE)
    // =========================================================================

    async connectToHost() {
        const code = document.getElementById('connectionCodeInput').value.toUpperCase().trim();
        if (code.length !== 5) {
            this.showNotification('Please enter a valid 5-digit code', 'error');
            return;
        }

        if (!window.database || !window.currentUser) {
            this.showNotification('Please login to connect', 'error');
            return;
        }

        try {
            // Find the sharing session
            const sharingRef = window.database.ref(`execution_sharing/${code}`);
            const snapshot = await sharingRef.once('value');

            if (!snapshot.exists() || !snapshot.val().active) {
                this.showNotification('Invalid or expired code', 'error');
                return;
            }

            const hostData = snapshot.val();
            console.log('[PeerExec] Connecting to host via Firebase Relay:', hostData.hostName);

            // Set hostConnection for relay mode
            this.hostConnection = {
                code,
                hostName: hostData.hostName || 'Host'
            };

            // Enable Firebase Relay directly (skip P2P)
            this.enableFirebaseRelay(code, 'client', window.currentUser.uid);

            // Update UI
            document.getElementById('connectNotConnected').style.display = 'none';
            document.getElementById('connectIsConnected').style.display = 'block';
            document.getElementById('connectedHostName').textContent = this.hostConnection.hostName + ' (Relay)';

        } catch (error) {
            console.error('[PeerExec] Connection failed:', error);
            this.showNotification('Failed to connect: ' + error.message, 'error');
        }
    }

    cleanupRelayData() {
        if (this.relayRef && this.connectionCode) {
            console.log('[PeerExec] Cleaning up relay data for code:', this.connectionCode);
            this.relayRef.remove().then(() => {
                console.log('[PeerExec] Relay data cleaned up successfully');
            }).catch(error => {
                console.warn('[PeerExec] Error cleaning up relay data:', error);
            });
        }
    }

    disconnect() {
        // Clean up relay data
        this.cleanupRelayData();
        
        this.hostConnection = null;
        this.useFirebaseRelay = false;
        this.relayRef = null;

        // Update UI
        document.getElementById('connectNotConnected').style.display = 'block';
        document.getElementById('connectIsConnected').style.display = 'none';
        document.getElementById('connectionCodeInput').value = '';

        // Update status bar
        this.updateStatusBarButton(false);

        this.showNotification('Disconnected', 'info');
    }

    // =========================================================================
    // EXECUTION API (for external use)
    // =========================================================================

    isConnectedToHost() {
        // Only check Firebase Relay connection
        const connected = this.useFirebaseRelay && !!this.hostConnection;
        console.log('[PeerExec] Relay connection check:', {
            useFirebaseRelay: this.useFirebaseRelay,
            hasHostConnection: connected,
            hostName: this.hostConnection?.hostName
        });
        return connected;
    }

    async executeRemote(code, language) {
        if (!this.isConnectedToHost()) {
            throw new Error('Not connected to execution host');
        }

        const terminal = this.ensureTerminalReady();
        if (terminal && typeof clearTerminal === 'function') {
            clearTerminal();
        }

        // Only use Firebase Relay
        console.log('[PeerExec] Executing via Firebase Relay');
        return new Promise((resolve, reject) => {
            this.pendingRelayResolve = resolve;
            this.pendingRelayReject = reject;

            if (terminal) {
                terminal.writeln(`\x1b[36m[Relay] Executing ${language} code...\x1b[0m\r\n`);
            }

            this.sendRelayData(JSON.stringify({
                type: 'execute',
                code,
                language
            }), this.hostConnection.code, 'client');

            setTimeout(() => {
                if (this.pendingRelayReject) {
                    this.pendingRelayReject(new Error('Execution timeout - host may be offline'));
                    this.pendingRelayResolve = null;
                    this.pendingRelayReject = null;
                    
                    if (terminal) {
                        terminal.writeln('\r\n\x1b[31mExecution timeout - host may be offline\x1b[0m');
                    }
                }
            }, 60000);
        });
    }

    sendInput(input) {
        if (this.isConnectedToHost()) {
            console.log('[PeerExec] Sending input via relay:', input);
            this.sendRelayData(JSON.stringify({
                type: 'input',
                input
            }), this.hostConnection.code, 'client');
        } else {
            console.warn('[PeerExec] Cannot send input - not connected to host');
        }
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    ensureTerminalReady() {
        // Check if terminal is available
        let terminal = window.term || (typeof term !== 'undefined' ? term : null);
        
        if (!terminal) {
            console.warn('[PeerExec] Terminal not available, attempting to initialize...');
            // Try to initialize terminal if the function exists
            if (typeof initTerminal === 'function') {
                initTerminal();
                terminal = window.term || (typeof term !== 'undefined' ? term : null);
            }
        }
        
        if (!terminal) {
            console.error('[PeerExec] Terminal still not available after initialization attempt');
            // Switch to terminal tab to ensure it's visible
            if (typeof switchTab === 'function') {
                switchTab('terminal');
            }
        }
        
        return terminal;
    }

    showNotification(message, type = 'info') {
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    updateStatusBarButton(isConnected, hostName = '') {
        const btn = document.getElementById('peerExecBtn');
        if (!btn) return;

        if (isConnected) {
            btn.innerHTML = `
                <i class="fas fa-link" style="color: #22c55a;"></i>
                <span style="color: #22c55a;">Connected</span>
            `;
            btn.title = `Connected to ${hostName} - Click to manage`;
            btn.style.color = '#22c55a';
        } else {
            btn.innerHTML = `
                <i class="fas fa-network-wired"></i>
                <span>Peer Exec</span>
            `;
            btn.title = 'Share/Connect Peer Execution';
            btn.style.color = '#00d4ff';
        }
    }
}

// Initialize and attach to window for global access
const peerExecution = new PeerExecutionManager();
window.peerExecution = peerExecution;

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PeerExecutionManager;
}
