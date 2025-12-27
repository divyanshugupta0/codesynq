/**
 * CodeSynq Collaboration Module 3.0 (Socket.io Edition)
 * Centralized Real-time collaboration via Collab Engine.
 */

class CollaborationManager {
    constructor() {
        // --- Configuration ---
        // Default to local, but allow override or prod URL
        this.serverUrl = 'https://codesynq-collab-engine.onrender.com/';
        // Note: For Render deployment, User will update this URL later.

        // --- State ---
        this.socket = null;
        this.roomId = null;
        this.isHost = false;

        // --- Sync State ---
        this.isRemoteUpdate = false;

        // --- Collaboration Mode ---
        this.collabMode = 'freestyle'; // 'freestyle' | 'restricted'
        this.editTokenHolder = null;   // Socket ID of editor
        this.pendingRequests = [];     // Requests list

        // --- Voice State ---
        this.localStream = null;
        this.voicePeers = {}; // { [socketId]: RTCPeerConnection }
        this.isVoiceActive = false;
        this.isMuted = false;
        this.audioContext = null;
        this.analysers = {}; // { [socketId]: AnalyserNode } (socketId='local' for self)

        // --- UI ---
        this.viewId = 'collaborationView';
        this.contentId = 'collaborationContent';
        this.participants = []; // [{userId, username, isHost}]

        // --- Init ---
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('CollaborationManager 3.0 (Socket) Initialized');
        // Load Socket.io client via CDN if not present? 
        // We assume it is added in HTML. If not, we should error or inject.
        if (typeof io === 'undefined') {
            console.warn('Socket.io client missing. Injecting...');
            const script = document.createElement('script');
            script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
            script.onload = () => this.checkRestoration();
            document.head.appendChild(script);
        } else {
            this.checkRestoration();
        }

        this.setupEditorListeners();
    }

    checkRestoration() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get('room');
        const stored = JSON.parse(localStorage.getItem('codesynq_collab_session'));

        if (urlRoom) {
            this.renderJoinUI(urlRoom);
        } else if (stored && stored.roomId) {
            // Auto-rejoin?
            // For now, let's just prefill join UI or confirm.
            this.renderJoinUI(stored.roomId);
        } else {
            this.renderInitialState();
        }
    }

    // =========================================================================
    // 1. CONNECTION & EVENTS
    // =========================================================================

    connect(roomId, isHost = false) {
        if (this.socket) this.socket.disconnect();

        const username = this.getCurrentUsername();
        this.showLoading(isHost ? 'Creating Session...' : `Joining ${roomId}...`);

        this.socket = io(this.serverUrl);

        this.socket.on('connect', () => {
            console.log('Connected to Server:', this.socket.id);
            this.roomId = roomId;
            this.isHost = isHost;

            // Join payload
            const payload = {
                roomId,
                username,
                isHost,
                initialFiles: isHost ? this.captureWorkspace() : null
            };
            this.socket.emit('join_session', payload);
        });

        // --- Event Listeners ---

        this.socket.on('workspace_sync', (data) => {
            console.log('Received Workspace Sync');
            this.loadWorkspace(data);
            this.participants = data.users || [];
            if (isHost) this.renderHostingUI(roomId);
            else this.renderConnectedUI(roomId);
        });

        this.socket.on('user_joined', (data) => {
            console.log('User Joined:', data.username);
            this.participants.push({ userId: data.userId, username: data.username });
            this.refreshContextUI();
            if (this.isHost) this.showNotification(`${data.username} joined!`, 'success');

            // If I am in voice, connect to new user (Mesh Initiator)
            if (this.isVoiceActive) this.connectVoicePeer(data.userId, true);
        });

        this.socket.on('user_left', (data) => {
            this.participants = this.participants.filter(p => p.userId !== data.userId);
            this.refreshContextUI();
            this.cleanupVoicePeer(data.userId);
        });

        this.socket.on('code_change', (data) => {
            this.applyCodeChange(data);
        });

        this.socket.on('mode_update', (data) => {
            this.collabMode = data.mode;
            this.editTokenHolder = data.tokenHolder;
            this.updateEditorState();
            this.refreshContextUI();
        });

        this.socket.on('edit_request', (data) => {
            // Only Token Holder receives this directly via server logic usually, 
            // OR server broadcasts to holder.
            // My server implementation sends to holder specifically.
            if (!this.pendingRequests.find(r => r.id === data.requesterId)) {
                this.pendingRequests.push({ id: data.requesterId, name: data.requesterName });
                this.renderRequestBox();
                this.showNotification(`${data.requesterName} requests edit access`, 'info');
            }
        });

        this.socket.on('token_transfer', (data) => {
            this.editTokenHolder = data.tokenHolder;
            this.pendingRequests = [];
            this.updateEditorState();
            this.refreshContextUI();
        });

        this.socket.on('sync_error', (data) => {
            // Unauthorized edit rejected by server
            console.warn('Sync Error - Reverting:', data.message);
            this.showError('Edit Rejected: ' + data.message);

            // Force state sync
            this.collabMode = data.mode;
            this.editTokenHolder = data.tokenHolder;
            this.updateEditorState();
            this.refreshContextUI();

            // Revert Content if provided
            if (data.revertContent !== undefined && data.tabIndex !== undefined) {
                this.applyCodeChange({
                    tabIndex: data.tabIndex,
                    content: data.revertContent,
                    changes: [] // Full replace
                });
            }
        });

        // --- Voice Events ---
        this.socket.on('voice_signal', async (data) => {
            // data: { senderId, signal }
            if (!this.isVoiceActive) return;
            await this.handleVoiceSignal(data.senderId, data.signal);
        });

        this.socket.on('error', (msg) => {
            this.showError(msg);
            this.renderInitialState();
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            // If unintentional?
        });

        // Persist
        localStorage.setItem('codesynq_collab_session', JSON.stringify({ roomId, isHost }));
    }

    // =========================================================================
    // VOICE / AUDIO LOGIC
    // =========================================================================

    async joinVoiceChannel() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.isVoiceActive = true;
            this.isMuted = false;

            // Allow user to hear others (in browsers that block autoplay)
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            // Analyze Local Volume
            this.attachAnalyser(this.localStream, 'local');

            this.refreshContextUI();
            this.showNotification('Joined Voice Channel', 'success');

            // Connect to all existing participants
            this.participants.forEach(p => {
                if (p.userId !== this.socket.id) {
                    this.connectVoicePeer(p.userId, true);
                }
            });

        } catch (e) {
            console.error('Voice Error:', e);
            this.showError('Microphone access denied or error.');
        }
    }

    leaveVoiceChannel() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        Object.keys(this.voicePeers).forEach(id => this.cleanupVoicePeer(id));

        this.isVoiceActive = false;
        this.refreshContextUI();
    }

    toggleMute() {
        if (!this.localStream) return;
        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(track => track.enabled = !this.isMuted);
        this.refreshContextUI();

        // TODO: Send mute status to peers for UI update
    }

    async connectVoicePeer(targetId, initiator) {
        if (this.voicePeers[targetId]) return; // Already connected

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.voicePeers[targetId] = pc;

        // Add Local Tracks
        this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));

        // Handle Remote Stream
        pc.ontrack = (event) => {
            console.log('Received Remote Stream from', targetId);
            const remoteAudio = new Audio();
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.autoplay = true;

            // Analyze Remote Volume
            this.attachAnalyser(event.streams[0], targetId);
        };

        // ICE Candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('voice_signal', {
                    targetId: targetId,
                    signal: { candidate: event.candidate }
                });
            }
        };

        if (initiator) {
            // Create Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.socket.emit('voice_signal', {
                targetId: targetId,
                signal: { sdp: offer }
            });
        }
    }

    async handleVoiceSignal(senderId, signal) {
        if (!this.isVoiceActive) return; // Ignore if I left voice

        // Ensure PeerConnection exists (if I received offer, I am not initiator)
        if (!this.voicePeers[senderId]) {
            await this.connectVoicePeer(senderId, false);
        }

        const pc = this.voicePeers[senderId];

        if (signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            if (signal.sdp.type === 'offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this.socket.emit('voice_signal', {
                    targetId: senderId,
                    signal: { sdp: answer }
                });
            }
        } else if (signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }

    cleanupVoicePeer(id) {
        if (this.voicePeers[id]) {
            this.voicePeers[id].close();
            delete this.voicePeers[id];
        }
        if (this.analysers[id]) delete this.analysers[id];
    }

    // --- Audio Visualization ---
    attachAnalyser(stream, id) {
        if (!this.audioContext) return;
        const source = this.audioContext.createMediaStreamSource(stream);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        this.analysers[id] = analyser;

        if (!this._visualizerLoopRunning) {
            this._visualizerLoopRunning = true;
            this.visualizerLoop();
        }
    }

    visualizerLoop() {
        if (!this.isVoiceActive) {
            this._visualizerLoopRunning = false;
            return;
        }

        requestAnimationFrame(() => this.visualizerLoop());

        const dataArray = new Uint8Array(32);
        const threshold = 10;

        // Check Local
        if (this.analysers['local'] && this.socket) {
            this.analysers['local'].getByteFrequencyData(dataArray);
            const vol = dataArray.reduce((subject, val) => subject + val, 0) / dataArray.length;
            this.updateSpeakingUI(this.socket.id, vol > threshold);
        }

        // Check Remotes
        Object.keys(this.analysers).forEach(id => {
            if (id === 'local') return;
            this.analysers[id].getByteFrequencyData(dataArray);
            const vol = dataArray.reduce((subject, val) => subject + val, 0) / dataArray.length;
            this.updateSpeakingUI(id, vol > threshold);
        });
    }

    updateSpeakingUI(socketId, isSpeaking) {
        // Find avatar element and toggle class
        // Use simpler selector if possible.
        // For local user (me), my ID is socket.id

        // Host rendering might complicate ID finding?
        // Participants list logic renders: `participant-${p.userId}`

        const el = document.getElementById(`participant-${socketId}`);
        if (el) {
            const avatar = el.querySelector('.collab-user-avatar');
            if (avatar) {
                if (isSpeaking) avatar.classList.add('is-speaking');
                else avatar.classList.remove('is-speaking');
            }
        }
    }

    // =========================================================================
    // 2. CORE ACTIONS
    // =========================================================================

    startHosting() {
        const roomId = 'synq-' + Math.random().toString(36).substr(2, 6);
        this.connect(roomId, true);
    }

    joinSession(roomId) {
        if (!roomId) return;
        this.connect(roomId, false);
    }

    endSession() {
        if (this.socket) this.socket.disconnect();
        this.socket = null;
        this.roomId = null;
        localStorage.removeItem('codesynq_collab_session');

        // Reset Editor
        if (editor) editor.updateOptions({ readOnly: false });

        // Reset URL
        const url = new URL(window.location);
        url.searchParams.delete('room');
        window.history.pushState({}, '', url);

        this.renderInitialState();
    }

    // --- Mode Actions ---

    setMode(mode) {
        if (!this.socket) return;
        // Optimistic UI
        this.collabMode = mode;
        this.socket.emit('set_mode', { roomId: this.roomId, mode });
    }

    requestEditAccess() {
        if (this.collabMode !== 'restricted' || this.editTokenHolder === this.socket.id) return;
        if (!this.socket) return;
        this.socket.emit('request_edit', { roomId: this.roomId });

        const btn = document.getElementById('btnRequestEdit');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-clock"></i> Requested...';
            btn.disabled = true;
        }
    }

    grantEditAccess(targetId) {
        if (!this.socket) return;
        this.socket.emit('grant_edit', { roomId: this.roomId, targetId });
        // Optimistic
        this.editTokenHolder = targetId;
        this.pendingRequests = [];
        this.refreshContextUI();
    }

    forceResetToken() {
        this.setMode('freestyle');
        setTimeout(() => this.setMode('restricted'), 200);
    }

    // =========================================================================
    // 3. EDITOR SYNC
    // =========================================================================

    setupEditorListeners() {
        setInterval(() => {
            if (typeof editor !== 'undefined' && editor && !this._listenerAttached) {
                this._listenerAttached = true;

                editor.onDidChangeModelContent((e) => {
                    if (this.isRemoteUpdate || !this.socket || !this.roomId) return;

                    // Permission Check (Client Side optimization)
                    if (this.collabMode === 'restricted') {
                        if (!this.socket || !this.socket.id) return; // Not ready

                        if (this.editTokenHolder !== this.socket.id) {
                            console.warn(`Blocked local edit. Mode: Restricted. Holder: ${this.editTokenHolder} vs Me: ${this.socket.id}`);
                            return;
                        }
                    }

                    const tabIndex = typeof window.activeTabIndex !== 'undefined' ? window.activeTabIndex : 0;

                    this.socket.emit('code_change', {
                        roomId: this.roomId,
                        tabIndex: tabIndex,
                        changes: e.changes,
                        content: editor.getValue()
                    });
                });
            }
        }, 1000);
    }

    applyCodeChange(data) {
        const { tabIndex, changes, content } = data;
        const targetIndex = parseInt(tabIndex);
        const activeIndex = typeof window.activeTabIndex !== 'undefined' ? parseInt(window.activeTabIndex) : 0;

        // Update background tab data
        if (window.editorTabs && window.editorTabs[targetIndex]) {
            window.editorTabs[targetIndex].content = content;
            if (activeIndex !== targetIndex) {
                window.editorTabs[targetIndex].hasChanges = true;
                if (typeof renderTabs === 'function') renderTabs();
                return;
            }
        }

        // Apply to active editor
        if (editor && activeIndex === targetIndex) {
            // Temporarily unlock to ensure update applies visually
            const wasReadOnly = editor.getOption(monaco.editor.EditorOption.readOnly);
            if (wasReadOnly) editor.updateOptions({ readOnly: false });

            this.isRemoteUpdate = true;
            if (changes && Array.isArray(changes) && changes.length > 0) {
                const edits = changes.map(c => ({
                    range: c.range, text: c.text, forceMoveMarkers: true
                }));
                editor.executeEdits('remote', edits);
            } else {
                editor.setValue(content);
            }
            this.isRemoteUpdate = false;

            // Re-lock
            if (wasReadOnly) editor.updateOptions({ readOnly: true });
        }
    }

    captureWorkspace() {
        return (window.editorTabs || []).map(t => ({
            name: t.name, language: t.language, content: t.content || ''
        }));
    }

    loadWorkspace(data) {
        // Overwrite local workspace
        window.editorTabs = [];
        const tabsContainer = document.getElementById('editorTabs');
        if (tabsContainer) tabsContainer.innerHTML = '';

        (data.files || []).forEach(f => {
            window.editorTabs.push({
                name: f.name,
                language: f.language,
                content: f.content,
                hasChanges: false
            });
        });

        if (typeof renderTabs === 'function') renderTabs();

        // Mode Sync
        this.collabMode = data.mode;
        this.editTokenHolder = data.tokenHolder;
        this.participants = data.users || [];

        if (typeof switchToTab === 'function') {
            switchToTab(data.activeTabIndex || 0);
            if (editor && data.files[data.activeTabIndex || 0]) {
                this.isRemoteUpdate = true;
                editor.setValue(data.files[data.activeTabIndex || 0].content);
                this.isRemoteUpdate = false;
            }
        }
        this.updateEditorState();
    }

    updateEditorState() {
        if (!editor) return;
        const canEdit = this.collabMode === 'freestyle' || this.editTokenHolder === this.socket.id;
        editor.updateOptions({ readOnly: !canEdit });
    }

    // =========================================================================
    // 4. UI RENDERING
    // =========================================================================

    refreshContextUI() {
        if (this.isHost) this.renderHostingUI(this.roomId);
        else this.renderConnectedUI(this.roomId);
    }

    showLoading(msg) {
        const container = document.getElementById(this.contentId);
        container.innerHTML = `
            <div class="collab-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>${msg}</p>
                <button class="btn-xs" style="margin-top:10px;background:#333;color:#aaa;border:1px solid #555" onclick="collaborationManager.renderInitialState()">Cancel</button>
            </div>`;
    }

    renderInitialState() {
        const container = document.getElementById(this.contentId);
        if (!container) return;
        container.innerHTML = `
           <div class="collab-container">
               <div class="collab-header-icon"><i class="fas fa-project-diagram"></i></div>
               <h3>Real-time Coding</h3>
               <p class="collab-desc">Collaborate with peers via Cloud Server.</p>
               <div class="collab-actions">
                   <button id="startCollabBtn" class="btn-collab-primary"><i class="fas fa-plus-circle"></i> Start Session</button>
                   <div class="collab-divider"><span>OR</span></div>
                   <button id="joinRoomBtn" class="btn-collab-secondary"><i class="fas fa-sign-in-alt"></i> Join Session</button>
               </div>
           </div>`;
        document.getElementById('startCollabBtn')?.addEventListener('click', () => this.startHosting());
        document.getElementById('joinRoomBtn')?.addEventListener('click', () => this.renderJoinUI());
    }

    renderJoinUI(prefill = '') {
        const container = document.getElementById(this.contentId);
        container.innerHTML = `
           <div class="collab-container">
               <div class="back-nav"><button onclick="collaborationManager.renderInitialState()" class="btn-link"><i class="fas fa-arrow-left"></i> Back</button></div>
               <h3>Join Session</h3>
               <div class="join-form">
                   <div class="input-group">
                       <label>Session ID</label>
                       <input type="text" id="joinRoomIdInput" value="${prefill}" placeholder="synq-...">
                   </div>
                   <button id="connectRoomBtn" class="btn-collab-primary">Join Workspace</button>
               </div>
           </div>`;
        document.getElementById('connectRoomBtn')?.addEventListener('click', () => {
            const id = document.getElementById('joinRoomIdInput').value.trim();
            this.joinSession(id);
        });
    }

    renderHostingUI(roomId) {
        const container = document.getElementById(this.contentId);
        const url = `${window.location.origin}?room=${roomId}`;

        const isFreestyle = this.collabMode === 'freestyle';
        const isRestricted = this.collabMode === 'restricted';
        const canEdit = isFreestyle || (isRestricted && this.editTokenHolder === this.socket.id);

        let statusHtml = this.generateStatusHtml(isRestricted, canEdit);

        container.innerHTML = `
            <div class="collab-session-active">
                <div class="session-info-card">
                    <h4><i class="fas fa-server"></i> Server Active</h4>
                    <div class="mode-switcher" style="margin-top:10px; padding-top:10px; border-top:1px solid #333">
                        <label style="font-size:12px;display:block;margin-bottom:5px">Editing Mode:</label>
                        <div class="btn-group" style="display:flex;gap:5px;">
                            <button class="btn-xs ${isFreestyle ? 'active' : ''}" onclick="collaborationManager.setMode('freestyle')" style="flex:1;background:${isFreestyle ? 'var(--accent-primary)' : '#333'};border:none;color:white;padding:4px">Freestyle</button>
                            <button class="btn-xs ${!isFreestyle ? 'active' : ''}" onclick="collaborationManager.setMode('restricted')" style="flex:1;background:${!isFreestyle ? 'var(--accent-primary)' : '#333'};border:none;color:white;padding:4px">Restricted</button>
                        </div>
                    </div>
                    ${statusHtml}
                    <div class="room-id-box" style="margin-top:10px">
                        <span>${roomId}</span>
                        <button class="icon-btn-small" onclick="collaborationManager.copy('${roomId}')"><i class="fas fa-copy"></i></button>
                    </div>
                </div>
                
                <!-- Voice Controls -->
                <div class="collab-voice-controls">
                    ${!this.isVoiceActive ?
                `<button class="btn-voice active" onclick="collaborationManager.joinVoiceChannel()"><i class="fas fa-microphone"></i> Join Voice</button>` :
                `<button class="btn-voice ${this.isMuted ? 'danger' : ''}" onclick="collaborationManager.toggleMute()"><i class="fas fa-microphone${this.isMuted ? '-slash' : ''}"></i> ${this.isMuted ? 'Unmute' : 'Mute'}</button>
                         <button class="btn-voice danger" onclick="collaborationManager.leaveVoiceChannel()"><i class="fas fa-phone-slash"></i> Leave</button>`
            }
                </div>
                
                <div id="requestBoxContainer"></div>

                <div class="participants-section">
                    <h5>Participants (<span id="participantCount">${this.participants.length}</span>)</h5>
                    <div id="collabUserList" class="collab-user-list">
                         ${this.renderUserList()}
                    </div>
                </div>
                <div class="session-actions">
                     <button class="btn-danger-outline" onclick="collaborationManager.endSession()">End Session</button>
                </div>
            </div>`;

        this.renderRequestBox();
        this.updateEditorState();
    }

    renderConnectedUI(id) {
        const container = document.getElementById(this.contentId);

        const isRestricted = this.collabMode === 'restricted';
        const canEdit = isRestricted ? (this.editTokenHolder === this.socket.id) : true;

        let statusHtml = this.generateStatusHtml(isRestricted, canEdit);

        container.innerHTML = `
            <div class="collab-session-active">
                <div class="session-info-card connected">
                     <h4><i class="fas fa-plug"></i> Connected</h4>
                     <p>Session: ${id}</p>
                </div>
                ${statusHtml}

                <!-- Voice Controls -->
                <div class="collab-voice-controls">
                    ${!this.isVoiceActive ?
                `<button class="btn-voice active" onclick="collaborationManager.joinVoiceChannel()"><i class="fas fa-microphone"></i> Join Voice</button>` :
                `<button class="btn-voice ${this.isMuted ? 'danger' : ''}" onclick="collaborationManager.toggleMute()"><i class="fas fa-microphone${this.isMuted ? '-slash' : ''}"></i> ${this.isMuted ? 'Unmute' : 'Mute'}</button>
                         <button class="btn-voice danger" onclick="collaborationManager.leaveVoiceChannel()"><i class="fas fa-phone-slash"></i> Leave</button>`
            }
                </div>

                <div id="requestBoxContainer"></div>
                <div class="participants-section">
                     <h5>Participants (<span id="participantCount">${this.participants.length}</span>)</h5>
                      <div id="collabUserList" class="collab-user-list">
                         ${this.renderUserList()}
                    </div>
                </div>
                 <div class="session-actions">
                     <button class="btn-danger-outline" onclick="collaborationManager.endSession()">Leave</button>
                </div>
            </div>`;

        this.renderRequestBox();
        this.updateEditorState();
    }

    renderUserList() {
        const myId = this.socket ? this.socket.id : '';
        return this.participants.map(p => {
            const isMe = p.userId === myId;
            const isTokenHolder = this.collabMode === 'restricted' && this.editTokenHolder === p.userId;
            const letter = p.username.charAt(0).toUpperCase();

            return `
             <div class="collab-user-item" id="participant-${p.userId}">
                 <div class="collab-user-avatar ${isTokenHolder ? 'token-holder' : ''}">
                     ${letter}
                     ${isTokenHolder ? '<i class="fas fa-pen-nib" style="position:absolute;bottom:-2px;right:-2px;font-size:10px;background:#222;padding:2px;border-radius:50%;color:var(--accent-primary)"></i>' : ''}
                 </div>
                 <div class="collab-user-info">
                     <span class="name">${p.username} ${isMe ? '(You)' : ''}</span>
                 </div>
                 <div class="collab-mic-status"></div>
             </div>
             `;
        }).join('');
    }

    generateStatusHtml(isRestricted, canEdit) {
        if (!isRestricted) {
            return `<div style="padding:10px;font-size:12px;opacity:0.7"><i class="fas fa-users"></i> Freestyle Mode</div>`;
        }
        if (canEdit) {
            return `<div class="alert-success" style="padding:10px;border-radius:4px;margin-top:10px;font-size:12px;background:rgba(34,197,94,0.1);color:#22c55e"><i class="fas fa-pen"></i> You have edit control.</div>`;
        } else {
            // Find name of token holder
            const holder = this.participants.find(p => p.userId === this.editTokenHolder);
            const holderName = holder ? holder.username : 'Unknown';

            return `
                <div class="alert-warning" style="padding:10px;border-radius:4px;margin-top:10px;font-size:12px;background:rgba(234,179,8,0.1);color:#eab308">
                    <i class="fas fa-lock"></i> Edit Restricted (${holderName})
                </div>
                <button id="btnRequestEdit" class="btn-collab-primary" style="width:100%;margin-top:5px;margin-bottom:10px" onclick="collaborationManager.requestEditAccess()">
                    Request Edit Access
                </button>
                ${this.isHost ? `<button class="btn-xs" style="width:100%;background:#333;color:#aaa;border:none;padding:4px;" onclick="collaborationManager.forceResetToken()"><i class="fas fa-sync"></i> Force Reset</button>` : ''}
             `;
        }
    }

    renderRequestBox() {
        const container = document.getElementById('requestBoxContainer');
        if (!container) return;

        // Ensure only Token Holder sees this
        if (this.editTokenHolder !== this.socket.id || this.pendingRequests.length === 0) {
            container.innerHTML = '';
            return;
        }

        const reqs = this.pendingRequests.map(req => `
            <div class="request-item" style="background:#222;padding:8px;border-radius:4px;margin-bottom:5px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:11px">${req.name}</span>
                <button class="btn-xs" style="background:var(--accent-primary);border:none;color:white;padding:2px 8px;border-radius:3px;cursor:pointer" onclick="collaborationManager.grantEditAccess('${req.id}')">Grant</button>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="requests-panel" style="margin:10px 0;border:1px solid var(--accent-primary);border-radius:6px;padding:10px;">
                <h5 style="margin:0 0 10px 0;color:var(--accent-primary)">Edit Requests</h5>
                ${reqs}
            </div>
        `;
    }

    getCurrentUsername() {
        return window.currentUser ? (window.currentUser.displayName || window.currentUser.email) : 'Guest';
    }

    copy(text) {
        navigator.clipboard.writeText(text);
        this.showNotification('Copied', 'success');
    }

    showNotification(msg, type = 'info') {
        if (typeof showNotification === 'function') showNotification(msg, type);
    }

    showError(msg) {
        this.showNotification(msg, 'error');
    }
}

window.collaborationManager = new CollaborationManager();
