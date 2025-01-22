// Update the state object to include currentWriter
        const state = {
            peer: null,
            editor: null,
            myStream: null,
            connections: new Map(),
            currentUsername: '',
            currentProfilePic: '',
            isAdmin: false,
            currentWriter: null,
            editingMode: 'freestyle', // Default to restricted mode
            peerId: null,
            facingMode: 'user',
            writingRequests: new Map(),
            audioContext: null,
            audioAnalyser: null,
            lastUpdate: null,
            adminId: null,
            connectedPeers: new Set() // Track connected peers
        };

        

        // Add to your initialization code
        // Updated initialization sequence
function initializeApp() {
    // Initialize audio context
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.audioAnalyser = state.audioContext.createAnalyser();
    
    // Initialize CodeMirror
    initializeCodeMirror();
    
    // Load saved profile
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        state.currentUsername = profile.username;
        state.currentProfilePic = profile.profilePic;
        document.getElementById('userProfilePic').src = state.currentProfilePic;
        
        // Initialize peer connections after profile is loaded
        initializePeerConnections();
    } else {
        // Show profile modal if no saved profile
        document.getElementById('profileModal').style.display = 'block';
    }
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize editor mode
    const modeSelect = document.getElementById('editingMode');
    if (modeSelect) {
        modeSelect.value = state.editingMode;
    }
}

// Update window.onload to use the new initialization sequence
window.onload = async () => {
    try {
        await initializeApp();
    } catch (error) {
        console.error('Initialization error:', error);
        showNotification('Failed to initialize application');
    }
};

// Add mode switching functionality
function switchMode(mode) {
    if (!state.isAdmin) return;
    
    state.editingMode = mode;
    updateModeDisplay();
    
    broadcastData({
        type: 'mode_change',
        mode: state.editingMode,
        sender: state.peerId
    });
}


function setupEditorSync() {
    const writingRequests = new Map();
    let currentWriter = null;
    
    function updateEditorState() {
        if (!state.editor) return;
    
        const isCurrentWriter = state.currentWriter === state.peerId;
        const canEdit = state.editingMode === 'freestyle' || isCurrentWriter;
        
        state.editor.setOption('readOnly', !canEdit);
        
        const statusDiv = document.getElementById('editorStatus') || document.createElement('div');
        statusDiv.id = 'editorStatus';
        statusDiv.textContent = `Mode: ${state.editingMode} | ${canEdit ? 'You can edit' : 'Read only'} | Writer: ${
            isCurrentWriter ? 'You' : (state.currentWriter ? 'Remote User' : 'None')
        }`;
        
        if (!document.getElementById('editorStatus')) {
            const editorSection = document.querySelector('.editor-section');
            const editorContainer = document.querySelector('.editor-container');
            editorSection.insertBefore(statusDiv, editorContainer);
        }
    
        state.editor.refresh();
    }
    
    function requestWriting() {
        if (currentWriter && currentWriter !== state.peerId) {
            broadcastData({
                type: 'write_request',
                userId: state.peerId,
                username: state.currentUsername
            });
            showNotification('Writing request sent');
        }
    }
    
    function handleWriteRequest(request) {
        if (state.peerId === currentWriter) {
            writingRequests.set(request.userId, request);
            updateRequestsList();
        }
    }
    
    function approveRequest(userId) {
        if (state.peerId === currentWriter) {
            currentWriter = userId;
            
            broadcastData({
                type: 'write_request_response',
                approved: true,
                userId: userId
            });
            
            // Reject all other requests
            writingRequests.forEach((request, requesterId) => {
                if (requesterId !== userId) {
                    broadcastData({
                        type: 'write_request_response',
                        approved: false,
                        userId: requesterId
                    });
                }
            });
            
            writingRequests.clear();
            updateRequestsList();
            updateEditorState();
        }
    }
    
    return {
        updateEditorState,
        requestWriting,
        handleWriteRequest,
        approveRequest
    };
}

function broadcastMessage(message) {
    const messageData = {
        type: 'chat',
        sender: state.currentUsername,
        message: message,
        timestamp: Date.now()
    };
    
    state.connections.forEach(connection => {
        connection.dataConnection.send(messageData);
    });
    
    // Add message to local chat
    addMessageToChat(state.currentUsername, message, true);
}

function initializeCodeMirror() {
    const editorContainer = document.getElementById('editor');
    if (!editorContainer) return;
    
    state.editor = CodeMirror(editorContainer, {
        mode: 'javascript',
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true,
        readOnly: !state.isAdmin // Initially readonly for non-admin
    });

    state.editor.on('change', (cm, change) => {
        if (change.origin === 'setValue') return;

        // In restricted mode, only admin can make changes
        if (state.editingMode === 'restricted' && !state.isAdmin) return;

        broadcastData({
            type: 'code_change',
            content: state.editor.getValue(),
            sender: state.peerId,
            timestamp: Date.now()
        });
    });
}

        function broadcastCodeChange(content) {
            connections.forEach((connection) => {
                if (connection.primary) {
                    connection.primary.send({
                        type: 'code_change',
                        content: content,
                        sender: primaryPeerId,
                        timestamp: Date.now()
                    });
                }
            });
        }

        // Profile functions
        async function saveProfile() {
            const username = document.getElementById('username').value.trim();
            const profilePicFile = document.getElementById('profilePic').files[0];
        
            if (!username) {
                alert('Please enter a username');
                return;
            }
        
            state.currentUsername = username;
            if (profilePicFile) {
                state.currentProfilePic = await readFileAsDataURL(profilePicFile);
            } else {
                state.currentProfilePic = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23333"/></svg>';
            }
        
            // Save to localStorage
            localStorage.setItem('userProfile', JSON.stringify({
                username: state.currentUsername,
                profilePic: state.currentProfilePic
            }));
        
            document.getElementById('userProfilePic').src = state.currentProfilePic;
            document.getElementById('profileModal').style.display = 'none';
        
            // Initialize peer after profile is saved
            initializePeerConnections();
        }

        function openProfileEdit() {
            document.getElementById('editUsername').value = state.currentUsername;
            document.getElementById('profileEditModal').style.display = 'block';
        }

        async function updateProfile() {
            const username = document.getElementById('editUsername').value.trim();
            const profilePicFile = document.getElementById('editProfilePic').files[0];
        
            if (!username) {
                alert('Please enter a username');
                return;
            }
        
            state.currentUsername = username;
            if (profilePicFile) {
                state.currentProfilePic = await readFileAsDataURL(profilePicFile);
            }
        
            // Save to localStorage
            localStorage.setItem('userProfile', JSON.stringify({
                username: state.currentUsername,
                profilePic: state.currentProfilePic
            }));
        
            document.getElementById('userProfilePic').src = state.currentProfilePic;
            document.getElementById('profileEditModal').style.display = 'none';
        
            // Broadcast profile update
            broadcastData({
                type: 'profile',
                username: state.currentUsername,
                profilePic: state.currentProfilePic
            });
        }

        // Peer connection functions
        function initializePeerConnections() {
            state.peer = new Peer({
                debug: 2,
                config: {
                    'iceServers': [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });
        
            state.peer.on('open', handlePeerOpen);
            state.peer.on('connection', handleConnection);
            state.peer.on('call', handleIncomingCall);
            state.peer.on('error', handlePeerError);
        
            setupMedia();
        }

        function setupPeerEventListeners() {
            primaryPeer.on('open', id => {
                primaryPeerId = id;
                handlePrimaryPeerOpen();
            });

            secondaryPeer.on('open', id => {
                secondaryPeerId = id;
                handleSecondaryPeerOpen();
            });

            primaryPeer.on('connection', handlePrimaryConnection);
            secondaryPeer.on('connection', handleSecondaryConnection);
            secondaryPeer.on('call', handleIncomingCall);
        }

        function initializeFeatures() {
            const audioHandler = setupAudioHandling(state.myStream);
            const adminControls = setupAdminControls();
            const editorSync = setupEditorSync();
            
            // Set up event listeners for the editor mode switch
            document.getElementById('editingMode').addEventListener('change', (e) => {
                state.editingMode = e.target.value;
                editorSync.updateEditorState();
                broadcastData({
                    type: 'mode_change',
                    mode: state.editingMode
                });
            });
            
            // Handle incoming data
            function handleIncomingData(data) {
                switch(data.type) {
                    case 'chat':
                        addMessageToChat(data.sender, data.message);
                        break;
                    case 'code_change':
                        if (data.change) {
                            state.editor.scrollIntoView(data.change.from);
                        }
                        state.editor.setValue(data.content);
                        break;
                    case 'mode_change':
                        state.editingMode = data.mode;
                        editorSync.updateEditorState();
                        break;
                    case 'write_request':
                        editorSync.handleWriteRequest(data);
                        break;
                    case 'write_request_response':
                        handleWriteRequestResponse(data);
                        break;
                    case 'speaking_status':
                        handleSpeakingStatus(data);
                        break;
                }
            }
            
            // Update connection handling to use new features
            state.handleConnection = (conn) => {
                conn.on('data', handleIncomingData);
                
                if (state.isAdmin) {
                    adminControls.updateAdminUserList();
                }
            };
        }

        function handlePrimaryConnection(conn) {
            conn.on('open', () => {
                connections.set(conn.peer, {
                    primary: conn,
                    username: conn.metadata?.username || 'Anonymous',
                    profilePic: conn.metadata?.profilePic || 'default-avatar.png'
                });
        
                // Send current editor state and mode
                conn.send({
                    type: 'initial_state',
                    content: editor.getValue(),
                    currentWriter: currentWriter,
                    editingMode: editingMode,
                    timestamp: Date.now()
                });
        
                updateUserList();
            });
        
            conn.on('data', (data) => {
                switch(data.type) {
                    case 'code_change':
                        if ((data.sender === currentWriter || editingMode === 'freestyle') && 
                            (!lastUpdate || data.timestamp > lastUpdate)) {
                            lastUpdate = data.timestamp;
                            editor.setValue(data.content);
                        }
                        break;
                    case 'mode_change':
                        editingMode = data.mode;
                        updateEditorState();
                        break;
                    case 'write_request':
                        handleWriteRequest(data);
                        break;
                    case 'write_request_response':
                        handleWriteRequestResponse(data);
                        break;
                }
            });
        }
        
        async function setupMedia() {
            try {
                const constraints = {
                    video: { facingMode: state.facingMode },
                    audio: true
                };
                
                state.myStream = await navigator.mediaDevices.getUserMedia(constraints);
                addVideoStream('me', state.myStream, state.currentUsername, true);
                
                // Initialize audio analysis if context exists
                if (state.audioContext && state.audioAnalyser) {
                    setupAudioAnalysis(state.myStream);
                }
            } catch (err) {
                console.error('Failed to get media devices:', err);
                showNotification('Failed to access camera/microphone');
            }
        }
        function handleSecondaryConnection(conn) {
            conn.on('open', () => {
                const userInfo = connections.get(conn.peer) || {};
                userInfo.secondary = conn;
                connections.set(conn.peer, userInfo);
                setupMediaConnection(conn.peer);
            });

            conn.on('data', handleSecondaryData);
        }
        function handlePeerError(err) {
            console.error('Peer error:', err);
            alert(`Connection error: ${err.message}. Please refresh the page and try again.`);
        }

        function checkRoomLink() {
            const urlParams = new URLSearchParams(window.location.search);
            const roomPeerId = urlParams.get('room');
            if (roomPeerId) {
                connectToPeer(roomPeerId);
            }
        }

        async function setupMedia() {
            try {
                myStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode },
                    audio: true
                });
                addVideoStream('me', myStream, currentUsername, true);
                
                // If we're joining a room, connect to all existing peers
                const urlParams = new URLSearchParams(window.location.search);
                const roomPeerId = urlParams.get('room');
                if (roomPeerId) {
                    connectToPeer(roomPeerId);
                }
            } catch (err) {
                console.error('Failed to get media devices:', err);
                showNotification('Failed to access camera/microphone. Please ensure permissions are granted.');
                flipCamera();
            }
        }

        function handleConnection(conn) {
            const connectionInfo = {
                dataConnection: conn,
                username: conn.metadata?.username || 'Anonymous',
                profilePic: conn.metadata?.profilePic || 'default-avatar.png',
                isAdmin: conn.metadata?.isAdmin || false
            };
        
            state.connections.set(conn.peer, connectionInfo);
            state.connectedPeers.add(conn.peer);
        
            conn.on('data', handleData);
            conn.on('open', () => {
                // If connecting to admin, send acknowledgment
                if (connectionInfo.isAdmin) {
                    state.adminId = conn.peer;
                    conn.send({
                        type: 'admin_acknowledgment',
                        username: state.currentUsername,
                        peerId: state.peerId,
                        connectedPeers: Array.from(state.connectedPeers) // Share connected peers
                    });
                }
        
                // Send current state to new peer
                conn.send({
                    type: 'initial_state',
                    content: state.editor.getValue(),
                    editingMode: state.editingMode,
                    isAdmin: state.isAdmin,
                    connectedPeers: Array.from(state.connectedPeers)
                });
                
                // Connect to other peers if not already connected
                autoConnectPeers();
                
                updateUserList();
                updateRoomInfo(state.peerId, state.isAdmin);
            });
        
            conn.on('close', () => {
                if (conn.peer === state.adminId) {
                    state.adminId = null;
                }
                state.connections.delete(conn.peer);
                state.connectedPeers.delete(conn.peer);
                removeUser(conn.peer);
                updateRoomInfo(state.peerId, state.isAdmin);
            });
        }

        // Add function to auto-connect peers
function autoConnectPeers() {
    state.connectedPeers.forEach(peerId => {
        if (peerId !== state.peerId && !state.connections.has(peerId)) {
            connectToPeer(peerId);
        }
    });
}
        

        function acceptConnection() {
            const [peerId, conn] = Array.from(pendingConnections.entries())[0];
            setupConnection(conn);
            document.getElementById('connectionModal').style.display = 'none';
            pendingConnections.delete(peerId);
        }

        function rejectConnection() {
            const [peerId, conn] = Array.from(pendingConnections.entries())[0];
            conn.close();
            pendingConnections.delete(peerId);
            document.getElementById('connectionModal').style.display = 'none';
        }

        function handleData(data) {
            switch(data.type) {
                case 'code_change':
                    if (state.editingMode === 'restricted') {
                        // In restricted mode, only accept changes from admin
                        if (data.sender === state.adminId) {
                        state.editor.setValue(data.content);
                        }
                    } else {
                        // In freestyle mode, accept changes from anyone
                        if (!state.lastUpdate || data.timestamp > state.lastUpdate) {
                        state.lastUpdate = data.timestamp;
                        state.editor.setValue(data.content);
                        }
                    }
                    break;
                case 'chat':
                    addMessageToChat(data.sender, data.message);
                    break;
                case 'admin_acknowledgment':
                    if (state.isAdmin) {
                        showNotification(`${data.username} joined your room`);
                        // Add new peer's connected peers to our list
                        if (data.connectedPeers) {
                            data.connectedPeers.forEach(peerId => {
                            state.connectedPeers.add(peerId);
                        });
                        autoConnectPeers();
                        }
                        updateAdminUserList();
                    }
                    break;
                case 'mode_change':
                    if (data.type === 'mode_change' && data.sender === state.adminId) {
                        state.editingMode = data.mode;
                        updateModeDisplay();
                    }
                    break;
                case 'initial_state':
                    state.editor.setValue(data.content);
                    state.editingMode = data.editingMode;
                    // Update connected peers list
                    if (data.connectedPeers) {
                        data.connectedPeers.forEach(peerId => {
                        state.connectedPeers.add(peerId);
                        });
                        autoConnectPeers();
                    }
                    updateEditorState();
                    break;
                case 'write_request':
                    handleWriteRequest(data);
                    break;
                case 'write_request_response':
                    handleWriteRequestResponse(data);
                    break;
            }
        }
        function setupAudioHandling(stream) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioQueue = [];
            let isProcessing = false;
        
            function queueAudio(audioData) {
                audioQueue.push(audioData);
                if (!isProcessing) {
                    processAudioQueue();
                }
            }
        
            function processAudioQueue() {
                if (audioQueue.length === 0) {
                    isProcessing = false;
                    return;
                }
                
                isProcessing = true;
                const nextAudio = audioQueue.shift();
                
                // Process audio data
                const source = audioContext.createMediaStreamSource(nextAudio.stream);
                const analyser = audioContext.createAnalyser();
                source.connect(analyser);
                
                // Add speaking indicator
                const videoContainer = document.getElementById(`video-${nextAudio.peerId}`);
                if (videoContainer) {
                    videoContainer.classList.add('speaking');
                    const indicator = document.createElement('div');
                    indicator.className = 'speaking-indicator';
                    indicator.textContent = 'Speaking';
                    videoContainer.appendChild(indicator);
                    
                    // Remove indicator after audio finishes
                    setTimeout(() => {
                        videoContainer.classList.remove('speaking');
                        indicator.remove();
                        processAudioQueue(); // Process next in queue
                    }, nextAudio.duration);
                }
            }
        
            // Set up audio analysis for speaking detection
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            function checkAudioLevel() {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                
                if (average > 30) { // Threshold for speaking
                    broadcastSpeakingStatus(true);
                } else {
                    broadcastSpeakingStatus(false);
                }
                
                requestAnimationFrame(checkAudioLevel);
            }
            
            checkAudioLevel();
            
            return { queueAudio };
        }

// Enhanced admin controls
function setupAdminControls() {
    if (!state.isAdmin) return;
    
    const adminSection = document.createElement('div');
    adminSection.className = 'admin-section';
    adminSection.innerHTML = `
        <h3>Connected Users</h3>
        <div id="adminUserList" class="admin-user-list"></div>
    `;
    
    document.querySelector('.right-panel').prepend(adminSection);
    
    function updateAdminUserList() {
        const userList = document.getElementById('adminUserList');
        userList.innerHTML = '';
        
        state.connections.forEach((connection, peerId) => {
            const userDiv = document.createElement('div');
            userDiv.className = 'admin-user-item';
            userDiv.innerHTML = `
                <span>${connection.username}</span>
                <button onclick="disconnectUser('${peerId}')" class="disconnect-btn">
                    Disconnect
                </button>
            `;
            userList.appendChild(userDiv);
        });
    }
    
    return { updateAdminUserList };
}

        function setupConnection(conn) {
            connections.set(conn.peer, {
                data: conn,
                username: conn.metadata.username,
                profilePic: conn.metadata.profilePic
            });

            conn.on('data', handleData);
            conn.on('close', () => {
                connections.delete(conn.peer);
                removeUser(conn.peer);
            });

            updateUserList();
            
            // Set up video call
            if (myStream) {
                const call = peer.call(conn.peer, myStream);
                setupCallHandlers(call);
            }
        }

        function handleIncomingCall(call) {
            call.answer(state.myStream);
            handleCallSetup(call);
        }

        function initializeAudioContext() {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioAnalyser = audioContext.createAnalyser();
        }

        function setupAudioAnalysis(stream) {
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(audioAnalyser);
            
            const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
            
            function checkAudioLevel() {
                audioAnalyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                
                if (average > 30) { // Threshold for speaking
                    broadcastSpeakingStatus(true);
                } else {
                    broadcastSpeakingStatus(false);
                }
                
                requestAnimationFrame(checkAudioLevel);
            }
            
            checkAudioLevel();
        }

        function broadcastSpeakingStatus(isSpeaking) {
            connections.forEach((connection, peerId) => {
                if (connection.secondary) {
                    connection.secondary.send({
                        type: 'speaking_status',
                        peerId: secondaryPeerId,
                        isSpeaking
                    });
                }
            });
        }
        // UI functions
        function addVideoStream(userId, stream, username, muted = false) {
            const videoGrid = document.getElementById('videoGrid');
            const existingVideo = document.getElementById(`video-${userId}`);
            if (existingVideo) {
                existingVideo.remove();
            }
        
            const videoContainer = document.createElement('div');
            videoContainer.className = 'video-container';
            videoContainer.id = `video-${userId}`;
            
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.playsInline = true;
            video.muted = muted;
            
            const usernameDiv = document.createElement('div');
            usernameDiv.className = 'video-username';
            usernameDiv.textContent = username;
            
            videoContainer.appendChild(video);
            videoContainer.appendChild(usernameDiv);
            videoContainer.appendChild(usernameDiv);
            videoGrid.appendChild(videoContainer);
        }


        function updateUIForRole() {
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'admin-controls';
            
            // Always show mode selection for admin
            if (state.isAdmin) {
                const modeSelect = document.createElement('select');
                modeSelect.id = 'editingMode';
                modeSelect.innerHTML = `
                    <option value="restricted">Restricted Mode</option>
                    <option value="freestyle">Freestyle Mode</option>
                `;
                modeSelect.value = state.editingMode;
                modeSelect.onchange = (e) => switchMode(e.target.value);
                
                controlsDiv.appendChild(modeSelect);
                controlsDiv.style.display = 'block'; // Ensure controls are visible
            }
        
            const editorSection = document.querySelector('.editor-section');
            const existingControls = document.querySelector('.admin-controls');
            if (existingControls) {
                existingControls.remove();
            }
            editorSection.insertBefore(controlsDiv, document.querySelector('.editor-container'));
        }
    
        function updateUserList() {
            const userList = document.getElementById('userList');
            userList.innerHTML = '';
            
            // Add current user first if they're admin
            if (state.isAdmin) {
                const currentUserItem = document.createElement('div');
                currentUserItem.className = 'user-item';
                
                const avatar = document.createElement('img');
                avatar.className = 'user-avatar';
                avatar.src = state.currentProfilePic;
                
                const username = document.createElement('span');
                username.textContent = `${state.currentUsername} (Admin)`;
                
                currentUserItem.appendChild(avatar);
                currentUserItem.appendChild(username);
                userList.appendChild(currentUserItem);
            }
            
            // Add other connected users
            state.connections.forEach((connection, peerId) => {
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                
                const avatar = document.createElement('img');
                avatar.className = 'user-avatar';
                avatar.src = connection.profilePic;
                
                const username = document.createElement('span');
                username.textContent = connection.isAdmin ? 
                    `${connection.username} (Admin)` : 
                    connection.username;
                
                userItem.appendChild(avatar);
                userItem.appendChild(username);
                userList.appendChild(userItem);
            });
        }
        
    
        function removeUser(peerId) {
            const videoElement = document.getElementById(`video-${peerId}`);
            if (videoElement) {
                videoElement.remove();
            }
            updateUserList();
        }
    
        // Chat functions
        window.sendMessage = () => {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            
            if (message) {
                addMessageToChat(state.currentUsername, message, true);
                broadcastData({
                    type: 'chat',
                    message,
                    sender: state.currentUsername
                });
                input.value = '';
            }
        };
    
        function addMessageToChat(sender, content, isMe = false) {
            const messagesContainer = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isMe ? 'message-mine' : ''}`;
            
            const senderDiv = document.createElement('div');
            senderDiv.className = 'message-sender';
            senderDiv.textContent = isMe ? 'You' : sender;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = content;
            
            messageDiv.appendChild(senderDiv);
            messageDiv.appendChild(contentDiv);
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    
        // Data handling functions
        function handlePrimaryData(data) {
            switch(data.type) {
                case 'code_change':
                    if (data.sender === currentWriter || editingMode === 'freestyle') {
                        editor.setValue(data.content);
                        scrollToChange(data.change);
                    }
                    break;
                case 'write_request':
                    handleWriteRequest(data);
                    break;
                case 'write_request_response':
                    handleWriteRequestResponse(data);
                    break;
                case 'code':
                if (data.sender === currentWriter || editingMode === 'freestyle') {
                    editor.setValue(data.content);
                }
                break;
                case 'mode_change':
                    editingMode = data.mode;
                    updateEditorState();
                    break;
                case 'initial_state':
                    editor.setValue(data.content);
                    currentWriter = data.currentWriter;
                    editingMode = data.editingMode;
                    updateEditorState();
                    break;
            }
        }

        function handleSecondaryData(data) {
            switch(data.type) {
                case 'chat':
                    addMessageToChat(data.username, data.message, false);
                    break;
                case 'audio_data':
                    handleIncomingAudio(data);
                    break;
                case 'video_data':
                handleIncomingVideo(data);
                break;
            }
        }

        // Add disconnect functionality for admin
function disconnectUser(userId) {
    if (isAdmin) {
        broadcastData({
            type: 'disconnect_user',
            userId: userId
        });
        connections.delete(userId);
        removeUser(userId);
    }
}

// Add room disconnect function
function disconnectFromRoom() {
    [dataConnection, videoConnection, audioConnection, chatConnection].forEach(conn => {
        if (conn) conn.close();
    });
    peer.destroy();
    window.location.href = window.location.pathname;
}
    
function broadcastData(data) {
    state.connections.forEach(connection => {
        connection.dataConnection.send(data);
    });
}
    
        function broadcastProfile() {
            broadcastData({
                type: 'profile',
                username: currentUsername,
                profilePic: currentProfilePic
            });
        }
    
        // Media control functions
        window.toggleVideo = () => {
            const videoTrack = state.myStream?.getVideoTracks()[0];
            if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
        };
        
        window.toggleAudio = () => {
            const audioTrack = state.myStream?.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
        };
    
        window.flipCamera = async () => {
            state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
            try {
                if (state.myStream) {
                    state.myStream.getTracks().forEach(track => track.stop());
                }
                
                state.myStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: state.facingMode },
                    audio: true
                });
                
                addVideoStream('me', state.myStream, state.currentUsername, true);
                
                // Update all existing calls with new stream
                state.connections.forEach((connection, peerId) => {
                    const call = state.peer.call(peerId, state.myStream);
                    handleCallSetup(call);
                });
            } catch (err) {
                console.error('Failed to flip camera:', err);
                showNotification('Failed to flip camera');
            }
        };
    
        // Room sharing functions
        window.shareRoom = () => {
            if (!state.peerId) {
                showNotification('Room not yet initialized');
                return;
            }
            
            let shareLink;
            
            if (state.isAdmin) {
                // Admin shares their own link
                shareLink = `${window.location.origin}${window.location.pathname}?room=${state.peerId}`;
            } else {
                // Non-admin users share the admin's link if connected to an admin
                const adminConnection = Array.from(state.connections.entries())
                    .find(([_, conn]) => conn.isAdmin);
                    
                if (adminConnection) {
                    shareLink = `${window.location.origin}${window.location.pathname}?room=${adminConnection[0]}`;
                } else {
                    // If not connected to an admin, share their own regular room link
                    shareLink = `${window.location.origin}${window.location.pathname}?room=${state.peerId}`;
                }
            }
            
            navigator.clipboard.writeText(shareLink)
                .then(() => showNotification('Room link copied!'))
                .catch(() => prompt('Copy this room link:', shareLink));
        };
    
        function joinRoom() {
            const input = document.getElementById('roomLinkInput').value.trim();
            document.getElementById('roomLinkInput').value = '';
        
            let peerId;
            let isAdmin = false;
        
            try {
                if (input.includes('?')) {
                    const url = new URL(input);
                    peerId = url.searchParams.get('admin') || url.searchParams.get('room');
                    isAdmin = url.searchParams.has('admin');
                } else {
                    peerId = input;
                }
        
                if (!peerId) {
                    throw new Error('Invalid room link or ID');
                }
        
                if (peerId === state.peerId) {
                    throw new Error('Cannot connect to your own room');
                }
        
                if (state.connections.has(peerId)) {
                    throw new Error('Already connected to this room');
                }
        
                connectToPeer(peerId, isAdmin);
        
            } catch (error) {
                showNotification(error.message || 'Invalid room link or ID');
            }
        }

        function connectToPeer(peerId, isAdmin = false) {
            if (peerId === state.peerId) {
                showNotification('Cannot connect to yourself');
                return;
            }
        
            const conn = state.peer.connect(peerId, {
                metadata: {
                    username: state.currentUsername,
                    profilePic: state.currentProfilePic,
                    isAdmin: state.isAdmin,
                    isAdminConnection: isAdmin
                }
            });
        
            // Send admin acknowledgment when connecting
            if (isAdmin) {
                state.adminId = peerId;
                conn.on('open', () => {
                    conn.send({
                        type: 'admin_acknowledgment',
                        username: state.currentUsername,
                        peerId: state.peerId,
                        timestamp: Date.now()
                    });
                });
            }
        
            handleConnection(conn);
        
            // Set up video/audio call
            if (state.myStream) {
                const call = state.peer.call(peerId, state.myStream, {
                    metadata: { username: state.currentUsername }
                });
                handleCallSetup(call);
            }
        }

        function handleCallSetup(call) {
            call.on('stream', remoteStream => {
                const remoteUser = state.connections.get(call.peer);
                if (remoteUser) {
                    addVideoStream(call.peer, remoteStream, remoteUser.username);
                }
            });
        }

        function updateEditorState() {
            if (!state.editor) return;
        
            // Admin can always edit, regardless of mode
            let canEdit = state.isAdmin || state.editingMode === 'freestyle';
            
            state.editor.setOption('readOnly', !canEdit);
            
            const statusDiv = document.getElementById('editorStatus') || document.createElement('div');
            statusDiv.id = 'editorStatus';
            statusDiv.textContent = `Mode: ${state.editingMode} | ${canEdit ? 'You can edit' : 'Read only'} | ${
                state.isAdmin ? '(Admin)' : ''
            }`;
            
            if (!document.getElementById('editorStatus')) {
                const editorSection = document.querySelector('.editor-section');
                const editorContainer = document.querySelector('.editor-container');
                editorSection.insertBefore(statusDiv, editorContainer);
            }
        
            // Update handler for code changes
            state.editor.off('change');
            state.editor.on('change', (cm, change) => {
                if (change.origin === 'setValue') return;
                
                // Only broadcast changes if user can edit
                if (canEdit) {
                    broadcastData({
                        type: 'code_change',
                        content: state.editor.getValue(),
                        sender: state.peerId,
                        timestamp: Date.now()
                    });
                }
            });
        
            state.editor.refresh();
        }
        
        function handlePeerOpen(id) {
            state.peerId = id;
            const urlParams = new URLSearchParams(window.location.search);
            
            // Set admin status based on URL or being first peer
            state.isAdmin = urlParams.has('admin') || !urlParams.has('room');
            
            // Update UI and controls
            updateModeDisplay();
            updateUIForRole();
            
            // Connect if room ID present
            const roomId = urlParams.get('room');
            if (roomId) {
                connectToPeer(roomId);
            }
        }
        function updateModeDisplay() {
            const modeIndicator = document.querySelector('.mode-indicator');
            const modeSelect = document.getElementById('editingMode');
            
            if (state.isAdmin) {
                modeSelect.disabled = false;
                modeIndicator.innerHTML = `${state.editingMode} Mode <span class="admin-badge">Admin</span>`;
            } else {
                modeSelect.disabled = true;
                modeIndicator.textContent = `${state.editingMode} Mode - Read Only`;
            }
            
            // Update editor state
            if (state.editor) {
                state.editor.setOption('readOnly', !state.isAdmin);
            }
        }
    
        // Add styles for admin info
const styles = `
.admin-info {
    background: #2d2d2d;
    padding: 8px;
    margin-top: 8px;
    border-radius: 4px;
    font-size: 14px;
    color: #fff;
}

.link-input-container {
    flex-direction: column;
}
`;

// Add the styles to the document
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

        // Utility functions
        function readFileAsDataURL(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        // Add writing request functionality
        function requestWriting() {
            if (currentWriter && currentWriter !== primaryPeerId) {
                broadcastToPrimary({
                    type: 'write_request',
                    userId: primaryPeerId,
                    username: currentUsername
                });
                showNotification('Write request sent');
            }
        }


        function updateRoomInfo(peerId, isAdmin) {
            const roomInfo = document.getElementById('roomInfo');
            const linkContainer = document.querySelector('.link-input-container');
            
            // Clear any existing admin info
            const existingAdminInfo = document.querySelector('.admin-info');
            if (existingAdminInfo) {
                existingAdminInfo.remove();
            }
            
            if (isAdmin) {
                roomInfo.textContent = 'Admin Room';
                // Add admin info display
                const adminInfo = document.createElement('div');
                adminInfo.className = 'admin-info';
                adminInfo.textContent = 'You are the admin';
                linkContainer.appendChild(adminInfo);
            } else {
                // Only show "Connected to Admin" if actually connected to an admin
                roomInfo.textContent = state.connections.size > 0 ? 'Connected to Room' : 'Not Connected';
            }
        }

        // Utility functions
        function scrollToChange(change) {
            if (change && change.from) {
                editor.scrollIntoView(change.from, 100);
            }
        }

        function showNotification(message) {
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = message;
            document.body.appendChild(notification);
            
            // Remove notification after 3 seconds
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
// Add this to your existing styles
const newStyles = `
    #editorStatus {
        padding: 10px;
        background: #2d2d2d;
        color: #fff;
        border-bottom: 1px solid #333;
    }

    .editor-controls {
        display: flex;
        gap: 10px;
        padding: 10px;
        background: #2d2d2d;
        border-bottom: 1px solid #333;
    }
`;
    
function setupEventListeners() {
    // Mode selection handler
    const modeSelect = document.getElementById('editingMode');
    if (modeSelect) {
        modeSelect.onchange = (e) => switchMode(e.target.value);
    }
    
    // Chat input handler
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        };
    }
    
    // Room link input handler
    const roomLinkInput = document.getElementById('roomLinkInput');
    if (roomLinkInput) {
        roomLinkInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                joinRoom();
            }
        };
    }
    
    // Profile pic handler
    const userProfilePic = document.getElementById('userProfilePic');
    if (userProfilePic) {
        userProfilePic.onclick = openProfileEdit;
    }
}

function disableRightClick() {
    document.addEventListener('contextmenu', function(event) {
        event.preventDefault();
        console.log("Right-click is disabled!");
    });
}

// Call the function to disable right-click
disableRightClick();
