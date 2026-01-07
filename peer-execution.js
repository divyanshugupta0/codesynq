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
        this.connectedPeers = new Map();  // For hosts: connected clients
        this.hostConnection = null;       // For clients: connection to host

        // Fallback state
        this.useFirebaseRelay = false;
        this.relayRef = null;
        this.relayListenerRef = null;  // Track the listener reference for cleanup
        this.relayRole = null;  // 'host' or 'client'
        this.relayPeerId = null;  // The peer ID for relay mode

        // Firebase references
        this.sharingRef = null;
        this.offersRef = null;
        this.answerListenerRef = null;  // Track answer listener for cleanup
        this.iceListenerRefs = [];  // Track ICE listeners for cleanup
        this.hostSessionListenerRef = null;  // Track host session for auto-disconnect when host stops

        // Local executor
        this.localExecutor = null;

        // Execution state
        this.pendingRelayResolve = null;
        this.pendingRelayReject = null;
        this.executionChannel = null;

        // UI
        this.modalId = 'peerExecutionModal';

        // ICE Server Configuration
        this.iceConfig = {
            iceServers: [
                // Google STUN servers (Standard & Reliable)
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                // Other public STUN servers
                { urls: 'stun:stun.services.mozilla.com' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ],
            iceCandidatePoolSize: 10
        };

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
        console.log(`[PeerExec] Enabling Firebase Relay fallback (${role}, peer: ${peerId})`);

        // Clean up any existing relay listeners first
        this.cleanupRelayListeners();

        this.useFirebaseRelay = true;
        this.connectionCode = connectionCode;
        this.relayRole = role;
        this.relayPeerId = peerId;

        const basePath = `execution_sharing/${connectionCode}/relay`;
        this.relayRef = window.database.ref(basePath);

        // Listen for messages directed to me
        // Host listens to: relay/to_host/{clientId}
        // Client listens to: relay/to_client/{clientId}
        let listenPath = '';
        if (role === 'host') {
            listenPath = `${basePath}/to_host/${peerId}`;
        } else {
            listenPath = `${basePath}/to_client/${peerId}`;
        }

        this.relayListenerRef = window.database.ref(listenPath);
        this.relayListenerRef.on('child_added', (snapshot) => {
            try {
                const msg = snapshot.val();
                if (!msg || !msg.data) return;

                // Ignore messages older than 30 seconds
                const msgTimestamp = msg.timestamp || 0;
                if (typeof msgTimestamp === 'number' && msgTimestamp < Date.now() - 30000) {
                    console.log('[PeerExec] Ignoring old relay message');
                    snapshot.ref.remove().catch(() => { });
                    return;
                }

                this.handleRelayMessage(msg.data, role === 'host' ? peerId : 'host');

                // Cleanup processed message
                snapshot.ref.remove().catch(err => {
                    console.warn('[PeerExec] Failed to remove processed message:', err);
                });
            } catch (err) {
                console.error('[PeerExec] Error processing relay message:', err);
            }
        });

        this.showNotification('Switched to Relay Mode (P2P Failed)', 'warning');

        if (role === 'client') {
            const hostName = this.hostConnection?.hostName || 'Host';
            this.updateStatusBarButton(true, hostName + ' (Relay)');

            const notConnectedEl = document.getElementById('connectNotConnected');
            const isConnectedEl = document.getElementById('connectIsConnected');
            const hostNameEl = document.getElementById('connectedHostName');

            if (notConnectedEl) notConnectedEl.style.display = 'none';
            if (isConnectedEl) isConnectedEl.style.display = 'block';
            if (hostNameEl) hostNameEl.textContent = hostName + ' (Relay Mode)';

            // Switch to terminal tab to show relay connection status
            if (typeof switchTab === 'function') {
                switchTab('terminal');
            }

            // Show connection status in terminal
            const terminal = this.ensureTerminalReady();
            if (terminal) {
                terminal.writeln('\r\n\x1b[33m[Relay Mode] Connected via Firebase Relay\x1b[0m');
                terminal.writeln('\x1b[33mReady to execute code...\x1b[0m\r\n');
            }
        }
    }

    cleanupRelayListeners() {
        if (this.relayListenerRef) {
            console.log('[PeerExec] Cleaning up relay listener');
            this.relayListenerRef.off();
            this.relayListenerRef = null;
        }
        this.relayRole = null;
        this.relayPeerId = null;
    }

    handleRelayMessage(data, fromId) {
        let message;
        try {
            message = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (err) {
            console.error('[PeerExec] Failed to parse relay message:', err, data);
            return;
        }

        console.log('[PeerExec] Relay message:', message.type, 'from:', fromId);

        if (this.hostConnection) {
            // I am CLIENT
            this.handleClientRelayMessage(message);
        } else if (this.isSharing) {
            // I am HOST
            this.handleHostRelayMessage(message, fromId);
        } else {
            console.warn('[PeerExec] Received relay message but neither host nor client');
        }
    }

    handleClientRelayMessage(message) {
        const terminal = this.ensureTerminalReady();

        if (message.type === 'output') {
            console.log('[PeerExec] Client received output chunk');

            if (!terminal) {
                console.error('[PeerExec] No terminal available for output!');
                return;
            }

            const output = this.normalizeOutput(message.data);
            if (output) {
                this.writeToTerminal(terminal, output);
            }
        } else if (message.type === 'result') {
            console.log('[PeerExec] Client received result:', message);

            if (terminal) {
                if (message.error) {
                    terminal.writeln(`\r\n\x1b[31mError: ${message.error}\x1b[0m`);
                }
                if (typeof message.exitCode !== 'undefined') {
                    terminal.writeln(`\r\n\x1b[32m...Program finished (exit code ${message.exitCode})\x1b[0m`);
                }
            }

            // Resolve the pending promise from executeRemote
            if (this.pendingRelayResolve) {
                this.pendingRelayResolve(message);
                this.pendingRelayResolve = null;
                this.pendingRelayReject = null;
            }

            if (typeof resetRunButton === 'function') resetRunButton();
        }
    }

    handleHostRelayMessage(message, fromId) {
        if (message.type === 'execute') {
            console.log('[PeerExec] Host executing for peer:', message.language);

            this.executeLocally(message.code, message.language, (output) => {
                this.sendRelayData(JSON.stringify({ type: 'output', data: output }), fromId, 'host');
            }).then(result => {
                console.log('[PeerExec] Host execution finished:', result);
                this.sendRelayData(JSON.stringify({ type: 'result', ...result }), fromId, 'host');
            }).catch(error => {
                console.error('[PeerExec] Host execution error:', error);
                this.sendRelayData(JSON.stringify({ type: 'result', success: false, error: error.message }), fromId, 'host');
            });
        } else if (message.type === 'input' && this.localExecutor) {
            this.localExecutor.sendInput(message.input);
        }
    }

    normalizeOutput(output) {
        if (output === null || output === undefined) return '';

        if (typeof output === 'string') {
            return output;
        }

        if (typeof output === 'object') {
            // Handle structured output from local server
            if (output.type === 'control' && output.action === 'clear-terminal') {
                return null; // Signal to clear terminal
            }
            if (output.data !== undefined) {
                return String(output.data);
            }
            try {
                return JSON.stringify(output);
            } catch (e) {
                return String(output);
            }
        }

        return String(output);
    }

    writeToTerminal(terminal, output) {
        if (!terminal || !output) return;

        // Handle structured log output from local server
        if (typeof output === 'string' && output.includes('{"type":')) {
            try {
                // Handle concatenated JSON objects: {...}{...} -> [{...},{...}]
                const fixedJson = '[' + output.replace(/\}\{/g, '},{') + ']';
                const msgs = JSON.parse(fixedJson);

                if (Array.isArray(msgs)) {
                    for (const msg of msgs) {
                        if (msg.type === 'control' && msg.action === 'clear-terminal') {
                            terminal.clear();
                        } else if (msg.data !== undefined) {
                            terminal.write(String(msg.data));
                        }
                    }
                    return;
                }
            } catch (e) {
                // Fall through to raw output handling
            }
        }

        // Handle raw output
        terminal.write(output);
    }

    sendRelayData(data, targetId, fromRole) {
        if (!this.connectionCode) {
            console.error('[PeerExec] Cannot send relay data: no connection code');
            return;
        }

        if (!window.database) {
            console.error('[PeerExec] Cannot send relay data: database not available');
            return;
        }

        let path = '';
        // If I am sending AS host, I send TO client
        if (fromRole === 'host') {
            path = `execution_sharing/${this.connectionCode}/relay/to_client/${targetId}`;
        } else {
            // I am sending AS client, I send TO host
            const myId = window.currentUser?.uid;
            if (!myId) {
                console.error('[PeerExec] Cannot send relay data: no user ID');
                return;
            }
            path = `execution_sharing/${this.connectionCode}/relay/to_host/${myId}`;
        }

        window.database.ref(path).push({
            data: data,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => {
            console.error('[PeerExec] Failed to send relay data:', err);
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
        console.log('[PeerExec] Stopping sharing...');
        this.isSharing = false;

        // Clean up relay listeners
        this.cleanupRelayListeners();
        this.useFirebaseRelay = false;
        this.relayRef = null;

        // Clean up ICE listeners for all connected peers
        this.iceListenerRefs.forEach(ref => {
            try {
                ref.off();
            } catch (e) {
                console.warn('[PeerExec] Failed to remove ICE listener:', e);
            }
        });
        this.iceListenerRefs = [];

        // Remove from Firebase
        if (this.sharingRef) {
            try {
                await this.sharingRef.remove();
            } catch (e) {
                console.error('[PeerExec] Failed to remove sharing ref:', e);
            }
            this.sharingRef = null;
        }

        if (this.offersRef) {
            this.offersRef.off();
            this.offersRef = null;
        }

        // Close all peer connections
        this.connectedPeers.forEach((peer, id) => {
            console.log('[PeerExec] Closing connection to peer:', id);
            try {
                // Clean up per-peer ICE listener
                if (peer.iceRef) {
                    peer.iceRef.off();
                }
                if (peer.channel) peer.channel.close();
                if (peer.connection) peer.connection.close();
            } catch (e) {
                console.warn('[PeerExec] Error closing peer connection:', e);
            }
        });
        this.connectedPeers.clear();
        this.connectionCode = null;

        // Update UI
        const notSharingEl = document.getElementById('shareNotSharing');
        const isSharingEl = document.getElementById('shareIsSharing');
        if (notSharingEl) notSharingEl.style.display = 'block';
        if (isSharingEl) isSharingEl.style.display = 'none';

        this.showNotification('Sharing stopped', 'info');
    }

    async handleConnectionRequest(clientId, offer) {
        console.log('[PeerExec] Connection request from:', clientId);

        // Create RTCPeerConnection with TURN servers for NAT traversal
        const pc = new RTCPeerConnection(this.iceConfig);

        // HOST receives the data channel from the CLIENT (who creates it)
        pc.ondatachannel = (event) => {
            console.log('[PeerExec] Host received data channel from client');
            const channel = event.channel;
            this.setupExecutionChannel(channel, clientId);

            // Update the connected peer with the channel
            const peer = this.connectedPeers.get(clientId);
            if (peer) {
                peer.channel = channel;
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.sharingRef.child(`ice_host/${clientId}`).push(e.candidate.toJSON());
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('[PeerExec] Host connection state:', pc.connectionState);
            if (pc.connectionState === 'failed') {
                console.warn('[PeerExec] P2P connection failed, switching to Firebase Relay (Host)');
                this.enableFirebaseRelay(this.connectionCode, 'host', clientId);

                // Keep the peer in the list but mark as relay
                const peer = this.connectedPeers.get(clientId);
                if (peer) {
                    peer.isRelay = true;
                    this.updateClientsList();
                }
            }
        };

        // Set remote description and create answer
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));
            console.log('[PeerExec] Host set remote description');

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('[PeerExec] Host created and set answer');

            // Send answer back
            await this.sharingRef.child(`answers/${clientId}`).set({
                sdp: pc.localDescription.toJSON(),
                hostName: window.currentUser?.displayName || 'Host'
            });
            console.log('[PeerExec] Host sent answer to client');

            // Listen for client ICE candidates - track this listener for cleanup
            const iceRef = this.sharingRef.child(`ice_client/${clientId}`);
            this.iceListenerRefs.push(iceRef);

            iceRef.on('child_added', async (snap) => {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(snap.val()));
                    console.log('[PeerExec] Host added client ICE candidate');
                } catch (e) {
                    console.error('[PeerExec] ICE error:', e);
                }
            });

            this.connectedPeers.set(clientId, {
                connection: pc,
                channel: null, // Will be set when ondatachannel fires
                name: offer.clientName || 'User',
                iceRef: iceRef  // Track for per-peer cleanup
            });

            this.updateClientsList();
        } catch (error) {
            console.error('[PeerExec] Failed to handle connection:', error);
            this.showNotification('Failed to accept peer connection', 'error');
        }
    }

    setupExecutionChannel(channel, clientId) {
        channel.onopen = () => {
            console.log('[PeerExec] Channel open with:', clientId);
            this.updateClientsList();
        };

        channel.onclose = () => {
            console.log('[PeerExec] Channel closed:', clientId);
            this.connectedPeers.delete(clientId);
            this.updateClientsList();
        };

        channel.onmessage = async (event) => {
            const message = JSON.parse(event.data);

            if (message.type === 'execute') {
                // Execute code locally and send back results
                console.log('[PeerExec] Executing for client:', clientId);

                try {
                    const result = await this.executeLocally(message.code, message.language, (output) => {
                        // Stream output back
                        channel.send(JSON.stringify({ type: 'output', data: output }));
                    });

                    channel.send(JSON.stringify({ type: 'result', ...result }));
                } catch (error) {
                    channel.send(JSON.stringify({
                        type: 'result',
                        success: false,
                        error: error.message
                    }));
                }
            } else if (message.type === 'input') {
                // Forward input to local executor
                if (this.localExecutor) {
                    await this.localExecutor.sendInput(message.input);
                }
            }
        };
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

        list.innerHTML = Array.from(this.connectedPeers.entries()).map(([id, peer]) => {
            const modeLabel = peer.isRelay ? ' (Relay)' : '';
            const modeColor = peer.isRelay ? '#f59e0b' : '#22c55a';
            return `
            <div class="peer-client-item">
                <span class="peer-client-name">${peer.name}${modeLabel}</span>
                <span class="peer-client-status" style="color: ${modeColor}"><i class="fas fa-circle"></i> Online</span>
            </div>
        `;
        }).join('');
    }

    // =========================================================================
    // CONNECTING (CLIENT MODE)
    // =========================================================================

    async connectToHost() {
        const codeInput = document.getElementById('connectionCodeInput');
        const code = codeInput ? codeInput.value.toUpperCase().trim() : '';

        if (code.length !== 5) {
            this.showNotification('Please enter a valid 5-digit code', 'error');
            return;
        }

        if (!window.database || !window.currentUser) {
            this.showNotification('Please login to connect', 'error');
            return;
        }

        // Clean up any existing connection first
        if (this.hostConnection) {
            this.disconnect();
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
            console.log('[PeerExec] Connecting to host:', hostData.hostName);

            // Store connection code for relay
            this.connectionCode = code;

            // Create RTCPeerConnection with TURN servers for NAT traversal
            const pc = new RTCPeerConnection(this.iceConfig);

            // CLIENT creates the data channel BEFORE creating offer
            // This is the standard WebRTC pattern for reliable data channel
            const execChannel = pc.createDataChannel('execution', {
                ordered: true,
                maxRetransmits: 3
            });
            console.log('[PeerExec] Client created data channel');

            // Set up the channel handlers
            execChannel.onopen = () => {
                console.log('[PeerExec] Data channel OPEN - connected to host!');
                this.executionChannel = execChannel;
                this.updateStatusBarButton(true, this.hostConnection?.hostName || 'Host');

                // Ensure terminal is ready and switch to it
                const terminal = this.ensureTerminalReady();
                if (typeof switchTab === 'function') {
                    switchTab('terminal');
                }

                if (terminal) {
                    terminal.writeln('\r\n\x1b[32m[P2P] Connected to host via DataChannel\x1b[0m');
                    terminal.writeln('\x1b[32mReady to execute code...\x1b[0m\r\n');
                }

                this.showNotification(`Connected to ${this.hostConnection?.hostName || 'Host'}! Ready for peer execution.`, 'success');
            };

            execChannel.onclose = () => {
                console.log('[PeerExec] Data channel closed');
                // Only disconnect if we're not in relay mode
                if (!this.useFirebaseRelay) {
                    this.disconnect();
                }
            };

            execChannel.onerror = (error) => {
                console.error('[PeerExec] Data channel error:', error);
            };

            execChannel.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('[PeerExec] Received P2P message:', message.type);

                    const terminal = this.ensureTerminalReady();

                    if (message.type === 'output') {
                        if (terminal) {
                            const output = this.normalizeOutput(message.data);
                            if (output) {
                                this.writeToTerminal(terminal, output);
                            }
                        }
                    } else if (message.type === 'result') {
                        console.log('[PeerExec] P2P result received:', message);
                        if (terminal) {
                            if (message.error) {
                                terminal.writeln(`\r\n\x1b[31mError: ${message.error}\x1b[0m`);
                            }
                            if (typeof message.exitCode !== 'undefined') {
                                terminal.writeln(`\r\n\x1b[32m...Program finished (exit code ${message.exitCode})\x1b[0m`);
                            }
                        }
                        if (typeof resetRunButton === 'function') {
                            resetRunButton();
                        }
                    }
                } catch (err) {
                    console.error('[PeerExec] Error processing P2P message:', err);
                }
            };

            // ICE handling
            const clientId = window.currentUser.uid;
            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    sharingRef.child(`ice_client/${clientId}`).push(e.candidate.toJSON()).catch(err => {
                        console.warn('[PeerExec] Failed to push ICE candidate:', err);
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('[PeerExec] Connection state:', pc.connectionState);
                if (pc.connectionState === 'failed') {
                    console.warn('[PeerExec] P2P connection failed, switching to Firebase Relay (Client)');
                    // Don't disconnect, switch to relay mode instead
                    if (this.hostConnection) {
                        this.hostConnection.method = 'relay';
                    }
                    this.enableFirebaseRelay(code, 'client', clientId);
                } else if (pc.connectionState === 'disconnected' && !this.useFirebaseRelay) {
                    // Only disconnect if we're not using relay
                    this.disconnect();
                }
            };

            // Create offer (data channel is already created, so it will be in the offer)
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log('[PeerExec] Offer created and set');

            // Send offer
            await sharingRef.child(`offers/${clientId}`).set({
                sdp: pc.localDescription.toJSON(),
                clientName: window.currentUser.displayName || window.currentUser.username || 'User',
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            console.log('[PeerExec] Offer sent, waiting for answer...');

            // Set hostConnection early so we know we're trying to connect
            this.hostConnection = {
                code,
                connection: pc,
                hostName: hostData.hostName || 'Host',
                method: 'p2p'
            };

            // Listen for host session removal/deactivation - auto-disconnect client when host stops
            this.hostSessionListenerRef = sharingRef;
            sharingRef.on('value', (sessionSnap) => {
                // Check if session was removed or deactivated
                if (!sessionSnap.exists() || !sessionSnap.val()?.active) {
                    console.log('[PeerExec] Host session ended, disconnecting...');
                    // Only disconnect if we're still connected to this host
                    if (this.hostConnection?.code === code) {
                        this.showNotification('Host stopped sharing. Disconnected.', 'warning');
                        this.disconnect(true);  // Silent disconnect since we already showed a message
                    }
                }
            });

            // Update UI to show connecting state
            const notConnectedEl = document.getElementById('connectNotConnected');
            const isConnectedEl = document.getElementById('connectIsConnected');
            const hostNameEl = document.getElementById('connectedHostName');

            if (notConnectedEl) notConnectedEl.style.display = 'none';
            if (isConnectedEl) isConnectedEl.style.display = 'block';
            if (hostNameEl) hostNameEl.textContent = 'Connecting...';

            // Wait for answer - track this listener for cleanup
            this.answerListenerRef = sharingRef.child(`answers/${clientId}`);
            this.answerListenerRef.on('value', async (snap) => {
                if (!snap.exists()) return;

                const answer = snap.val();
                console.log('[PeerExec] Received answer from host');

                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer.sdp));
                    console.log('[PeerExec] Remote description set');

                    // Update host name
                    if (this.hostConnection) {
                        this.hostConnection.hostName = answer.hostName || hostData.hostName || 'Host';
                        if (hostNameEl) {
                            hostNameEl.textContent = this.hostConnection.hostName;
                        }
                    }

                    // Listen for host ICE candidates - track this listener for cleanup
                    const iceRef = sharingRef.child(`ice_host/${clientId}`);
                    this.iceListenerRefs.push(iceRef);

                    iceRef.on('child_added', async (iceSnap) => {
                        try {
                            await pc.addIceCandidate(new RTCIceCandidate(iceSnap.val()));
                            console.log('[PeerExec] Added host ICE candidate');
                        } catch (e) {
                            console.error('[PeerExec] ICE error:', e);
                        }
                    });
                } catch (e) {
                    console.error('[PeerExec] Error setting remote description:', e);
                    this.showNotification('Connection failed: ' + e.message, 'error');
                    this.disconnect();
                }
            });

        } catch (error) {
            console.error('[PeerExec] Connection failed:', error);
            this.showNotification('Failed to connect: ' + error.message, 'error');
            this.disconnect();
        }
    }

    // setupClientChannel has been consolidated into connectToHost
    // Keeping this as a no-op for backwards compatibility
    setupClientChannel(channel) {
        console.warn('[PeerExec] setupClientChannel is deprecated, use connectToHost instead');
    }

    disconnect(silent = false) {
        console.log('[PeerExec] Disconnecting from host...');

        // Clean up relay mode
        this.cleanupRelayListeners();
        this.useFirebaseRelay = false;
        this.relayRef = null;

        // Clean up answer listener
        if (this.answerListenerRef) {
            this.answerListenerRef.off();
            this.answerListenerRef = null;
        }

        // Clean up host session listener (prevents "host stopped" notification after manual disconnect)
        if (this.hostSessionListenerRef) {
            this.hostSessionListenerRef.off();
            this.hostSessionListenerRef = null;
        }

        // Clean up ICE listeners
        this.iceListenerRefs.forEach(ref => {
            try {
                ref.off();
            } catch (e) {
                console.warn('[PeerExec] Failed to remove ICE listener:', e);
            }
        });
        this.iceListenerRefs = [];

        // Close host connection
        if (this.hostConnection) {
            try {
                if (this.hostConnection.connection) {
                    this.hostConnection.connection.close();
                }
            } catch (e) {
                console.warn('[PeerExec] Error closing host connection:', e);
            }
            this.hostConnection = null;
        }

        // Close execution channel
        if (this.executionChannel) {
            try {
                this.executionChannel.close();
            } catch (e) {
                console.warn('[PeerExec] Error closing execution channel:', e);
            }
            this.executionChannel = null;
        }

        // Clear pending execution promises
        if (this.pendingRelayReject) {
            this.pendingRelayReject(new Error('Disconnected'));
        }
        this.pendingRelayResolve = null;
        this.pendingRelayReject = null;
        this.connectionCode = null;

        // Update UI
        const notConnectedEl = document.getElementById('connectNotConnected');
        const isConnectedEl = document.getElementById('connectIsConnected');
        const codeInputEl = document.getElementById('connectionCodeInput');

        if (notConnectedEl) notConnectedEl.style.display = 'block';
        if (isConnectedEl) isConnectedEl.style.display = 'none';
        if (codeInputEl) codeInputEl.value = '';

        // Update status bar
        this.updateStatusBarButton(false);

        // Only show notification if not silent (e.g., when host stopped, we already showed a message)
        if (!silent) {
            this.showNotification('Disconnected', 'info');
        }
    }

    // =========================================================================
    // EXECUTION API (for external use)
    // =========================================================================

    isConnectedToHost() {
        if (this.useFirebaseRelay) {
            // Only return true if I am a CLIENT (have a host connection)
            const connected = !!this.hostConnection;
            console.log('[PeerExec] Relay connection check:', {
                useFirebaseRelay: this.useFirebaseRelay,
                hasHostConnection: connected,
                hostName: this.hostConnection?.hostName
            });
            return connected;
        }

        const channelOpen = this.executionChannel && this.executionChannel.readyState === 'open';
        const hasHost = !!this.hostConnection;
        console.log('[PeerExec] P2P connection check:', {
            channelOpen,
            hasHost,
            channelState: this.executionChannel?.readyState,
            hostName: this.hostConnection?.hostName
        });
        return channelOpen && hasHost;
    }

    async executeRemote(code, language) {
        if (!this.isConnectedToHost()) {
            throw new Error('Not connected to execution host');
        }

        // Clear terminal before execution and ensure it's ready
        const terminal = this.ensureTerminalReady();
        if (terminal && typeof clearTerminal === 'function') {
            clearTerminal();
        }

        if (this.useFirebaseRelay) {
            console.log('[PeerExec] Executing via Firebase Relay');
            return new Promise((resolve, reject) => {
                this.pendingRelayResolve = resolve;
                this.pendingRelayReject = reject;

                // Show execution start message
                if (terminal) {
                    terminal.writeln(`\x1b[36m[Relay] Executing ${language} code...\x1b[0m\r\n`);
                }

                this.sendRelayData(JSON.stringify({
                    type: 'execute',
                    code,
                    language
                }), this.hostConnection.code, 'client');

                // Timeout with better error message
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

        // Direct P2P execution
        console.log('[PeerExec] Executing via P2P DataChannel');

        // Switch to terminal tab to show output
        if (typeof switchTab === 'function') {
            switchTab('terminal');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Execution timeout'));
                if (terminal) {
                    terminal.writeln('\r\n\x1b[31mExecution timeout\x1b[0m');
                }
                if (typeof resetRunButton === 'function') {
                    resetRunButton();
                }
            }, 60000);

            // Temporarily override message handler
            const originalHandler = this.executionChannel.onmessage;
            this.executionChannel.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    if (message.type === 'output') {
                        if (terminal) {
                            const output = this.normalizeOutput(message.data);
                            if (output) {
                                this.writeToTerminal(terminal, output);
                            }
                        }
                    } else if (message.type === 'result') {
                        clearTimeout(timeout);
                        this.executionChannel.onmessage = originalHandler;

                        if (terminal) {
                            if (message.error) {
                                terminal.writeln(`\r\n\x1b[31mError: ${message.error}\x1b[0m`);
                            }
                            if (typeof message.exitCode !== 'undefined') {
                                terminal.writeln(`\r\n\x1b[32m...Program finished (exit code ${message.exitCode})\x1b[0m`);
                            }
                        }

                        if (typeof resetRunButton === 'function') {
                            resetRunButton();
                        }

                        resolve(message);
                    }
                } catch (err) {
                    console.error('[PeerExec] Error processing P2P message:', err);
                }
            };

            try {
                this.executionChannel.send(JSON.stringify({
                    type: 'execute',
                    code,
                    language
                }));
            } catch (err) {
                clearTimeout(timeout);
                reject(new Error('Failed to send execution request: ' + err.message));
            }
        });
    }

    sendInput(input) {
        if (this.isConnectedToHost()) {
            if (this.useFirebaseRelay) {
                console.log('[PeerExec] Sending input via relay:', input);
                this.sendRelayData(JSON.stringify({
                    type: 'input',
                    input
                }), this.hostConnection.code, 'client');
            } else {
                console.log('[PeerExec] Sending input via P2P:', input);
                this.executionChannel.send(JSON.stringify({ type: 'input', input }));
            }
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
