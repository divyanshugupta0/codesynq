// Global variables
let editor;
window.currentUser = null;
let isCollaborating = false;
let isHost = false;
let currentEditMode = 'freestyle';
let currentEditor = null;
let roomData = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing CodeNexus Pro...');
    initializeApp();
});

function initializeApp() {
    try {
        console.log('Starting app initialization...');
        
        // Setup profile first
        setupProfile();
        
        // Initialize editor
        setupEditor();
        
        // Setup UI event listeners
        setupUI();
        
        // Try to connect to server
        console.log('Current URL:', window.location.href);
        console.log('Socket.IO available:', typeof io !== 'undefined');
        tryServerConnection();
        
        console.log('App initialized successfully');
    
    // Check for room parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) {
        joinCollaborationRoom(roomId);
    }
    
    } catch (error) {
        console.error('App initialization failed:', error);
        // Ensure basic functionality works even if there are errors
        setupBasicFunctionality();
    }
}

function setupBasicFunctionality() {
    console.log('Setting up basic functionality as fallback...');
    
    // Ensure Run button works
    const runBtn = document.getElementById('runCode');
    if (runBtn) {
        runBtn.onclick = function() {
            console.log('Run button clicked');
            executeCode();
        };
    }
    
    // Ensure Save button works
    const saveBtn = document.getElementById('saveCode');
    if (saveBtn) {
        saveBtn.onclick = function() {
            console.log('Save button clicked');
            saveCode();
        };
    }
    
    // Ensure Theme button works
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.onclick = function() {
            console.log('Theme button clicked');
            if (editor) {
                const currentTheme = editor.getOption('theme');
                const newTheme = currentTheme === 'default' ? 'vscode-dark' : 'default';
                editor.setOption('theme', newTheme);
            }
        };
    }
}

function tryServerConnection() {
    // Check if Socket.IO is available and try to connect
    if (typeof io !== 'undefined') {
        try {
            window.socket = io({ 
                timeout: 2000,
                forceNew: true,
                transports: ['websocket', 'polling']
            });
            
            let connected = false;
            
            window.socket.on('connect', function() {
                console.log('Connected to server');
                connected = true;
                updateStatus('connected');
                
                // Always create a default room for code execution
                if (!window.currentRoom) {
                    window.currentRoom = 'solo-' + Date.now();
                }
                
                const user = window.currentUser || { 
                    id: 'guest-' + Date.now(), 
                    username: 'Guest', 
                    profilePic: 'https://via.placeholder.com/40/666/ffffff?text=G' 
                };
                
                window.socket.emit('join-room', {
                    roomId: window.currentRoom,
                    user: user
                });
                
                console.log('Joined room:', window.currentRoom);
            });
            
            window.socket.on('connect_error', function(error) {
                console.log('Server connection error:', error);
                if (!connected) {
                    updateStatus('offline');
                }
            });
            
            window.socket.on('disconnect', function() {
                console.log('Disconnected from server');
                updateStatus('disconnected');
            });
            
            window.socket.on('execution-result', function(data) {
                displayOutputInTerminal(data.output, data.error);
            });
            
            window.socket.on('terminal-output', function(data) {
                displayRealTimeOutput(data.text, data.type);
            });
            
            window.socket.on('clear-terminal', function() {
                clearTerminal();
            });
            
            window.socket.on('edit-request', function(data) {
                if (isHost) {
                    showEditRequest(data.user);
                }
            });
            
            window.socket.on('edit-approved', function(data) {
                currentEditor = data.userId;
                updateEditorPermissions();
            });
            
            window.socket.on('edit-mode-changed', function(data) {
                currentEditMode = data.mode;
                updateEditorPermissions();
            });
            
            window.socket.on('new-message', function(data) {
                displayChatMessage(data);
            });
            
            // Immediate check - if not connected within 2 seconds, assume offline
            setTimeout(() => {
                if (!connected) {
                    console.log('Server not responding after 2 seconds - running in offline mode');
                    console.log('Socket state:', window.socket.connected, window.socket.disconnected);
                    updateStatus('offline');
                    window.socket.disconnect();
                }
            }, 2000);
            
        } catch (error) {
            console.log('Socket.IO connection failed:', error);
            updateStatus('offline');
        }
    } else {
        console.log('Socket.IO not loaded - running in offline mode');
        updateStatus('offline');
    }
}

function setupProfile() {
    // Profile setup handled by Firebase auth
    // currentUser will be set by auth state listener
}

function setupEditor() {
    const editorElement = document.getElementById('editor');
    if (!editorElement) {
        console.error('Editor element not found');
        return;
    }

    try {
        editor = CodeMirror(editorElement, {
            mode: 'javascript',
            theme: 'default',
            lineNumbers: true,
            autoCloseBrackets: true,
            matchBrackets: true,
            indentUnit: 2,
            tabSize: 2,
            lineWrapping: true,
            value: '// Welcome to CodeNexus Pro!\n// Start coding here...\n\nconsole.log("Hello, World!");'
        });
        
        window.editor = editor;
        
        console.log('Editor created successfully');
    } catch (error) {
        console.error('Failed to create CodeMirror editor:', error);
        // Fallback to a simple textarea
        editorElement.innerHTML = '<textarea id="fallback-editor" style="width:100%;height:100%;background:#1e1e1e;color:#fff;border:none;font-family:monospace;padding:1rem;">// Welcome to CodeNexus Pro!\n// Start coding here...\n\nconsole.log("Hello, World!");</textarea>';
    }
}

function setupUI() {
    // Language selector
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.addEventListener('change', function(e) {
            const mode = window.getCodeMirrorMode(e.target.value);
            if (editor && editor.setOption) {
                editor.setOption('mode', mode);
            }
        });
    }

    // Run code button
    const runBtn = document.getElementById('runCode');
    if (runBtn) {
        runBtn.addEventListener('click', executeCode);
    }

    // Save code button
    const saveBtn = document.getElementById('saveCode');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveCode);
    }
    
    // See saved codes button
    const seeSavedBtn = document.getElementById('seeSavedCodes');
    if (seeSavedBtn) {
        seeSavedBtn.addEventListener('click', showSavedCodes);
    }
    
    // Modal handlers
    document.getElementById('confirmSave').addEventListener('click', () => {
        const fileName = document.getElementById('fileNameInput').value;
        saveCodeWithName(fileName);
    });
    
    document.getElementById('cancelSave').addEventListener('click', () => {
        document.getElementById('saveCodeModal').style.display = 'none';
        document.getElementById('fileNameInput').value = '';
    });
    
    document.getElementById('closeSavedCodes').addEventListener('click', () => {
        document.getElementById('savedCodesModal').style.display = 'none';
    });
    
    document.getElementById('closePreview').addEventListener('click', () => {
        document.getElementById('codePreviewModal').style.display = 'none';
    });
    
    // Enter key for save modal
    document.getElementById('fileNameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const fileName = document.getElementById('fileNameInput').value;
            saveCodeWithName(fileName);
        }
    });

    // Collaborate button
    const collaborateBtn = document.getElementById('collaborateBtn');
    if (collaborateBtn) {
        collaborateBtn.addEventListener('click', showCollaborationModal);
    }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            switchTab(e.target.dataset.tab);
        });
    });

    // Panel switching
    document.querySelectorAll('.panel-tab').forEach(btn => {
        btn.addEventListener('click', function(e) {
            switchPanel(e.target.dataset.panel);
        });
    });

    // Setup resizer
    setupResizer();
    
    // Setup theme and settings
    setupThemeAndSettings();
    
    // Collaboration modal handlers
    document.getElementById('generateRoomId').addEventListener('click', () => {
        const newRoomId = generateRoomId();
        document.getElementById('roomIdInput').value = newRoomId;
        document.getElementById('shareLink').value = `${window.location.origin}${window.location.pathname}?room=${newRoomId}`;
    });
    
    document.getElementById('copyLink').addEventListener('click', copyShareLink);
    document.getElementById('startCollaboration').addEventListener('click', startCollaboration);
    document.getElementById('cancelCollaboration').addEventListener('click', () => {
        document.getElementById('collaborationModal').style.display = 'none';
    });
    
    document.getElementById('editModeBtn').addEventListener('click', toggleEditMode);
    
    // Session dropdown handlers
    document.getElementById('sessionInfoBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('sessionDropdown');
        dropdown.classList.toggle('show');
    });
    
    document.getElementById('copyDropdownLink').addEventListener('click', () => {
        const link = document.getElementById('dropdownShareLink').value;
        navigator.clipboard.writeText(link).then(() => {
            showNotification('Share link copied!');
        });
    });
    
    document.getElementById('endSession').addEventListener('click', endCollaborationSession);
    
    // Chat functionality
    document.getElementById('sendMessage').addEventListener('click', sendChatMessage);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        document.getElementById('sessionDropdown').classList.remove('show');
    });
    
    // Debug: Check if buttons exist
    console.log('Buttons found:', {
        runCode: !!document.getElementById('runCode'),
        saveCode: !!document.getElementById('saveCode'),
        themeToggle: !!document.getElementById('themeToggle'),
        settingsBtn: !!document.getElementById('settingsBtn')
    });
    
    console.log('UI event listeners setup complete');
}

function setupThemeAndSettings() {
    const themeToggle = document.getElementById('themeToggle');
    const settingsBtn = document.getElementById('settingsBtn');
    
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            if (!editor) return;
            const currentTheme = editor.getOption('theme');
            const newTheme = currentTheme === 'default' ? 'vscode-dark' : 'default';
            editor.setOption('theme', newTheme);
            
            const icon = themeToggle.querySelector('i');
            icon.className = newTheme === 'default' ? 'fas fa-moon' : 'fas fa-sun';
            showNotification(`Theme changed to ${newTheme}`);
        });
    }
    
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function() {
            showNotification('Settings panel coming soon!');
        });
    }
}

function setupResizer() {
    const resizer = document.getElementById('resizer');
    const editorContainer = document.querySelector('.editor-container');
    const outputSection = document.querySelector('.output-section');
    
    if (!resizer || !editorContainer || !outputSection) return;
    
    let isResizing = false;
    
    resizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        
        const containerRect = document.querySelector('.editor-section').getBoundingClientRect();
        const toolbarHeight = document.querySelector('.editor-toolbar').offsetHeight;
        const mouseY = e.clientY - containerRect.top - toolbarHeight;
        
        const minEditorHeight = 200;
        const minOutputHeight = 100;
        const maxEditorHeight = containerRect.height - toolbarHeight - minOutputHeight - 4;
        
        const newEditorHeight = Math.max(minEditorHeight, Math.min(maxEditorHeight, mouseY));
        const newOutputHeight = containerRect.height - toolbarHeight - newEditorHeight - 4;
        
        editorContainer.style.height = newEditorHeight + 'px';
        editorContainer.style.flexShrink = '0';
        outputSection.style.height = newOutputHeight + 'px';
        outputSection.style.flexShrink = '0';
        
        // Refresh CodeMirror if it exists
        if (editor && editor.refresh) {
            setTimeout(() => editor.refresh(), 0);
        }
        
        // Add click handler for edit requests in restricted mode
        if (editor) {
            editor.on('focus', () => {
                if (currentEditMode === 'restricted' && !isHost && currentEditor !== window.currentUser?.uid) {
                    requestEdit();
                    editor.getInputField().blur();
                }
            });
        }
    });
    
    document.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

function executeCode() {
    const code = editor && editor.getValue ? editor.getValue() : document.getElementById('fallback-editor')?.value || '';
    const language = document.getElementById('languageSelect').value;
    
    console.log('Execute code called for language:', language);
    console.log('Socket connected:', window.socket && window.socket.connected);
    console.log('Current room:', window.currentRoom);
    
    // Try server execution if connected
    if (window.socket && window.socket.connected && window.currentRoom) {
        console.log('Sending to server for execution');
        window.socket.emit('execute-code', {
            roomId: window.currentRoom,
            code,
            language
        });
        return;
    }
    
    // Fallback to local execution
    console.log('Running locally (server not connected)');
    runCodeLocally(code, language);

    if (language === 'html') {
        showPreview(code);
    }
}

function saveCode() {
    if (!window.currentUser) {
        showNotification('Please login first to save your code!');
        return;
    }
    
    // Show save modal
    document.getElementById('saveCodeModal').style.display = 'block';
    document.getElementById('fileNameInput').focus();
}

function saveCodeWithName(fileName) {
    if (!window.currentUser || !fileName.trim()) {
        showNotification('Please enter a valid file name!');
        return;
    }
    
    const code = editor && editor.getValue ? editor.getValue() : document.getElementById('fallback-editor')?.value || '';
    const language = document.getElementById('languageSelect').value;
    
    const codeData = {
        name: fileName.trim(),
        content: code,
        language: language,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        lastModified: new Date().toISOString()
    };
    
    // Save to Firebase with unique key
    const codeRef = database.ref(`users/${window.currentUser.uid}/savedCodes`).push();
    codeRef.set(codeData).then(() => {
        showNotification(`Code saved as "${fileName}"!`);
        document.getElementById('saveCodeModal').style.display = 'none';
        document.getElementById('fileNameInput').value = '';
    }).catch((error) => {
        showNotification('Error saving code: ' + error.message);
    });
}

function showSavedCodes() {
    if (!window.currentUser) {
        showNotification('Please login to view saved codes!');
        return;
    }
    
    const modal = document.getElementById('savedCodesModal');
    const list = document.getElementById('savedCodesList');
    
    list.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading...</div>';
    modal.style.display = 'block';
    
    database.ref(`users/${window.currentUser.uid}/savedCodes`).once('value', (snapshot) => {
        const codes = snapshot.val();
        list.innerHTML = '';
        
        if (!codes) {
            list.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No saved codes found</div>';
            return;
        }
        
        Object.entries(codes).forEach(([key, codeData]) => {
            const item = document.createElement('div');
            item.className = 'saved-code-item';
            item.innerHTML = `
                <div class="saved-code-info">
                    <div class="saved-code-name">${codeData.name}</div>
                    <div class="saved-code-meta">
                        ${new Date(codeData.lastModified).toLocaleDateString()} • 
                        ${codeData.content.split('\n').length} lines
                    </div>
                </div>
                <div class="saved-code-language">${codeData.language}</div>
            `;
            
            item.addEventListener('mouseenter', (e) => {
                currentMouseX = e.clientX;
                currentMouseY = e.clientY;
                showCodePreview(codeData);
            });
            item.addEventListener('mouseleave', hideCodePreview);
            item.addEventListener('click', () => openCodePreview(key, codeData));
            
            list.appendChild(item);
        });
    });
}

let previewTimeout;
let currentMouseX = 0;
let currentMouseY = 0;

function showCodePreview(codeData) {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => {
        const preview = document.createElement('div');
        preview.id = 'hoverPreview';
        preview.style.cssText = `
            position: fixed;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            width: 300px;
            max-height: 200px;
            overflow: auto;
            z-index: 1001;
            font-family: 'Consolas', monospace;
            font-size: 0.8rem;
            white-space: pre-wrap;
            box-shadow: var(--shadow);
            color: var(--text-primary);
            pointer-events: none;
        `;
        preview.textContent = codeData.content.substring(0, 400) + (codeData.content.length > 400 ? '...' : '');
        
        document.body.appendChild(preview);
        
        // Position near cursor
        let left = currentMouseX + 15;
        let top = currentMouseY + 15;
        
        // Adjust if goes off screen
        if (left + 300 > window.innerWidth) {
            left = currentMouseX - 315;
        }
        if (left < 10) {
            left = 10;
        }
        
        if (top + 200 > window.innerHeight) {
            top = currentMouseY - 215;
        }
        if (top < 10) {
            top = 10;
        }
        
        preview.style.left = left + 'px';
        preview.style.top = top + 'px';
    }, 300);
}

// Track mouse position
document.addEventListener('mousemove', (e) => {
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
});

function hideCodePreview() {
    clearTimeout(previewTimeout);
    const preview = document.getElementById('hoverPreview');
    if (preview) preview.remove();
}

function openCodePreview(key, codeData) {
    hideCodePreview();
    const modal = document.getElementById('codePreviewModal');
    document.getElementById('previewTitle').textContent = codeData.name;
    document.getElementById('codePreview').textContent = codeData.content;
    
    document.getElementById('loadCode').onclick = () => loadSavedCode(codeData);
    document.getElementById('deleteCode').onclick = () => deleteSavedCode(key, codeData.name);
    
    modal.style.display = 'block';
}

function loadSavedCode(codeData) {
    if (editor) {
        editor.setValue(codeData.content);
        document.getElementById('languageSelect').value = codeData.language;
        const mode = window.getCodeMirrorMode(codeData.language);
        editor.setOption('mode', mode);
    }
    
    document.getElementById('codePreviewModal').style.display = 'none';
    document.getElementById('savedCodesModal').style.display = 'none';
    showNotification(`Loaded "${codeData.name}"`);
}

function deleteSavedCode(key, name) {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
        database.ref(`users/${window.currentUser.uid}/savedCodes/${key}`).remove().then(() => {
            showNotification(`Deleted "${name}"`);
            document.getElementById('codePreviewModal').style.display = 'none';
            showSavedCodes(); // Refresh the list
        });
    }
}

function showCollaborationModal() {
    if (!window.currentUser) {
        showNotification('Please login to start collaboration!');
        return;
    }
    
    const modal = document.getElementById('collaborationModal');
    const roomId = generateRoomId();
    document.getElementById('roomIdInput').value = roomId;
    document.getElementById('shareLink').value = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    modal.style.display = 'block';
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function startCollaboration() {
    const roomId = document.getElementById('roomIdInput').value;
    const mode = document.getElementById('collaborationMode').value;
    
    isCollaborating = true;
    isHost = true;
    currentEditMode = mode;
    window.currentRoom = roomId;
    
    // Update UI to show collaborating state
    document.getElementById('collaborateBtn').style.display = 'none';
    document.getElementById('collaboratingLabel').style.display = 'block';
    
    // Update dropdown info
    document.getElementById('dropdownRoomId').textContent = roomId;
    document.getElementById('dropdownMode').textContent = mode;
    document.getElementById('dropdownShareLink').value = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    
    // Show collaboration UI
    document.querySelector('.container').classList.add('collaboration-mode');
    document.getElementById('rightPanel').style.display = 'block';
    document.getElementById('roomStatus').textContent = `Host - ${roomId}`;
    document.getElementById('roomStatus').className = 'status-indicator connected';
    
    // Join room
    if (window.socket && window.socket.connected) {
        window.socket.emit('join-room', {
            roomId,
            user: {
                ...window.currentUser,
                username: window.currentUser.displayName,
                profilePic: window.currentUser.photoURL,
                isHost: true
            }
        });
    }
    
    document.getElementById('collaborationModal').style.display = 'none';
    showNotification('Collaboration session started!');
}

function copyShareLink() {
    const link = document.getElementById('shareLink').value;
    navigator.clipboard.writeText(link).then(() => {
        showNotification('Share link copied to clipboard!');
    });
}

function toggleEditMode() {
    if (!isHost) return;
    
    currentEditMode = currentEditMode === 'freestyle' ? 'restricted' : 'freestyle';
    const btn = document.getElementById('editModeBtn');
    btn.textContent = currentEditMode === 'freestyle' ? 'Restricted Mode' : 'Freestyle Mode';
    
    // Broadcast mode change
    if (window.socket && window.currentRoom) {
        window.socket.emit('edit-mode-change', {
            roomId: window.currentRoom,
            mode: currentEditMode
        });
    }
    
    updateEditorPermissions();
}

function updateEditorPermissions() {
    if (!editor) return;
    
    if (currentEditMode === 'freestyle' || isHost || currentEditor === window.currentUser?.uid) {
        editor.setOption('readOnly', false);
        document.getElementById('currentEditor').textContent = 'You are editing';
    } else {
        editor.setOption('readOnly', true);
        document.getElementById('currentEditor').textContent = currentEditor ? 'Someone else is editing' : 'Request to edit';
    }
}

function requestEdit() {
    if (!window.socket || !window.currentRoom || currentEditMode === 'freestyle') return;
    
    window.socket.emit('edit-request', {
        roomId: window.currentRoom,
        user: window.currentUser
    });
    
    showNotification('Edit request sent!');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.output-panel').forEach(panel => panel.classList.remove('active'));
    
    const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const panel = document.getElementById(tabName);
    
    if (tabBtn) tabBtn.classList.add('active');
    if (panel) panel.classList.add('active');
}

function switchPanel(panelName) {
    document.querySelectorAll('.panel-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.panel-content').forEach(panel => panel.classList.remove('active'));
    
    const panelBtn = document.querySelector(`[data-panel="${panelName}"]`);
    const panel = document.getElementById(`${panelName}-panel`);
    
    if (panelBtn) panelBtn.classList.add('active');
    if (panel) panel.classList.add('active');
}

function displayOutput(output, error) {
    const consolePanel = document.getElementById('console');
    if (!consolePanel) return;
    
    const timestamp = new Date().toLocaleTimeString();
    
    if (error) {
        consolePanel.innerHTML += `<div style="color: #f44336;">[${timestamp}] Error: ${error}</div>`;
    } else {
        consolePanel.innerHTML += `<div>[${timestamp}] ${output}</div>`;
    }
    
    consolePanel.scrollTop = consolePanel.scrollHeight;
    switchTab('console');
}

function displayOutputInTerminal(output, error) {
    const terminalPanel = document.getElementById('terminal');
    if (!terminalPanel) return;
    
    const timestamp = new Date().toLocaleTimeString();
    
    if (error) {
        terminalPanel.innerHTML += `<div style="color: #f44336;">[${timestamp}] Error: ${error}</div>`;
    } else if (output) {
        terminalPanel.innerHTML += `<div style="color: #00ff00;">[${timestamp}] ${output}</div>`;
    }
    
    terminalPanel.scrollTop = terminalPanel.scrollHeight;
    switchTab('terminal');
}

function displayRealTimeOutput(text, type) {
    const terminalPanel = document.getElementById('terminal');
    if (!terminalPanel) return;
    
    let color = '#00ff00'; // default stdout color
    let fontWeight = 'normal';
    
    if (type === 'stderr') {
        color = '#f44336';
    } else if (type === 'input') {
        color = '#ffffff'; // white for user input
    } else if (type === 'command') {
        color = '#00bfff'; // blue for commands
        fontWeight = 'bold';
    }
    
    terminalPanel.innerHTML += `<span style="color: ${color}; font-weight: ${fontWeight};">${text}</span>`;
    terminalPanel.scrollTop = terminalPanel.scrollHeight;
    switchTab('terminal');
    
    // Add input field if program is waiting for input
    if (type === 'stdout' && !terminalPanel.querySelector('.terminal-input')) {
        // If output doesn't end with newline, it's likely waiting for input
        if (!text.endsWith('\n')) {
            setTimeout(() => {
                if (!terminalPanel.querySelector('.terminal-input')) {
                    addTerminalInput();
                }
            }, 200);
        }
    }
}

function clearTerminal() {
    const terminalPanel = document.getElementById('terminal');
    if (terminalPanel) {
        terminalPanel.innerHTML = '';
    }
}

function showEditRequest(user) {
    const chatMessages = document.getElementById('chatMessages');
    const requestDiv = document.createElement('div');
    requestDiv.className = 'edit-request';
    requestDiv.innerHTML = `
        <div><strong>${user.displayName}</strong> requests to edit</div>
        <div class="request-actions">
            <button class="approve-btn" onclick="approveEditRequest('${user.uid}', '${user.displayName}')">Approve</button>
            <button class="reject-btn" onclick="rejectEditRequest('${user.uid}')">Reject</button>
        </div>
    `;
    chatMessages.appendChild(requestDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    switchPanel('chat');
}

window.approveEditRequest = function(userId, userName) {
    // Reject all other pending requests
    document.querySelectorAll('.edit-request').forEach(req => req.remove());
    
    currentEditor = userId;
    updateEditorPermissions();
    
    // Notify all users
    if (window.socket && window.currentRoom) {
        window.socket.emit('edit-approved', {
            roomId: window.currentRoom,
            userId: userId,
            userName: userName
        });
    }
    
    // Add message to chat
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.innerHTML = `<div style="color: var(--accent-color); font-style: italic;">${userName} is now editing</div>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

window.rejectEditRequest = function(userId) {
    document.querySelectorAll('.edit-request').forEach(req => req.remove());
    
    if (window.socket && window.currentRoom) {
        window.socket.emit('edit-rejected', {
            roomId: window.currentRoom,
            userId: userId
        });
    }
};

function addTerminalInput() {
    const terminalPanel = document.getElementById('terminal');
    if (!terminalPanel) return;
    
    const inputDiv = document.createElement('div');
    inputDiv.className = 'terminal-input';
    inputDiv.innerHTML = `
        <input type="text" id="terminalInput" placeholder="Enter input..." style="
            background: transparent;
            border: none;
            color: #00ff00;
            outline: none;
            font-family: 'Consolas', monospace;
            font-size: 13px;
        ">
    `;
    
    terminalPanel.appendChild(inputDiv);
    
    const input = inputDiv.querySelector('input');
    input.focus();
    
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const value = input.value;
            
            // Send input to server (server will echo it back)
            if (window.socket && window.socket.connected && window.currentRoom) {
                window.socket.emit('terminal-input', {
                    roomId: window.currentRoom,
                    input: value
                });
            }
            
            // Remove input field
            inputDiv.remove();
            terminalPanel.scrollTop = terminalPanel.scrollHeight;
        }
    });
}

function showPreview(html) {
    const preview = document.getElementById('preview');
    if (preview) {
        preview.innerHTML = `<iframe srcdoc="${html.replace(/"/g, '&quot;')}" style="width:100%;height:100%;border:none;"></iframe>`;
        switchTab('preview');
    }
}

function updateStatus(status) {
    const statusElement = document.getElementById('roomStatus');
    if (statusElement) {
        const statusText = {
            'connected': 'Connected',
            'disconnected': 'Disconnected',
            'offline': 'Offline Mode'
        };
        statusElement.textContent = statusText[status] || 'Unknown';
        statusElement.className = `status-indicator ${status}`;
    }
}

function runCodeLocally(code, language) {
    try {
        switch (language) {
            case 'javascript':
                // Create a safe execution context
                const originalLog = console.log;
                let output = '';
                console.log = (...args) => {
                    output += args.join(' ') + '\n';
                };
                
                try {
                    eval(code);
                    displayOutput(output || 'Code executed successfully');
                } catch (error) {
                    displayOutput('', error.message);
                } finally {
                    console.log = originalLog;
                }
                break;
                
            case 'html':
                showPreview(code);
                displayOutput('HTML preview updated');
                break;
                
            case 'css':
                displayOutput('CSS code ready (combine with HTML for preview)');
                break;
                
            case 'python':
                displayOutput('', 'Python requires server connection. Please check if server is running.');
                break;
                
            default:
                displayOutput(`${language} execution not supported in offline mode`);
        }
    } catch (error) {
        displayOutput('', `Execution error: ${error.message}`);
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification fade-in';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 1rem;
        border-radius: 8px;
        z-index: 1000;
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Profile modal removed - using Firebase auth

function joinCollaborationRoom(roomId) {
    if (!window.currentUser) {
        showNotification('Please login to join collaboration!');
        return;
    }
    
    isCollaborating = true;
    isHost = false;
    window.currentRoom = roomId;
    
    // Update UI to show collaborating state
    document.getElementById('collaborateBtn').style.display = 'none';
    document.getElementById('collaboratingLabel').style.display = 'block';
    
    // Update dropdown info
    document.getElementById('dropdownRoomId').textContent = roomId;
    document.getElementById('dropdownMode').textContent = 'Joined Session';
    document.getElementById('dropdownShareLink').value = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    
    // Show collaboration UI
    document.querySelector('.container').classList.add('collaboration-mode');
    document.getElementById('rightPanel').style.display = 'block';
    document.getElementById('roomStatus').textContent = `Joined - ${roomId}`;
    document.getElementById('roomStatus').className = 'status-indicator connected';
    
    // Join room when socket connects
    if (window.socket && window.socket.connected) {
        window.socket.emit('join-room', {
            roomId,
            user: {
                ...window.currentUser,
                username: window.currentUser.displayName,
                profilePic: window.currentUser.photoURL,
                isHost: false
            }
        });
    }
    
    showNotification('Joined collaboration session!');
}

// Utility functions
window.getCodeMirrorMode = function(language) {
    const modes = {
        javascript: 'javascript',
        python: 'python',
        html: 'xml',
        css: 'css',
        java: 'text/x-java',
        c: 'text/x-csrc',
        cpp: 'text/x-c++src'
    };
    return modes[language] || 'javascript';
};

function getFileExtension(language) {
    const extensions = {
        javascript: 'js',
        python: 'py',
        html: 'html',
        css: 'css',
        java: 'java',
        c: 'c',
        cpp: 'cpp'
    };
    return extensions[language] || 'txt';
}

function generateUserId() {
    return Math.random().toString(36).substring(2, 15);
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message || !window.socket || !window.currentRoom) return;
    
    window.socket.emit('chat-message', {
        roomId: window.currentRoom,
        message: message
    });
    
    input.value = '';
}

function displayChatMessage(data) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const time = new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <strong>${data.user}</strong> • ${time}
        </div>
        <div class="message-content">${data.message}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Switch to chat panel if not already active
    if (!document.getElementById('chat-panel').classList.contains('active')) {
        switchPanel('chat');
    }
}

function endCollaborationSession() {
    if (confirm('Are you sure you want to end the collaboration session?')) {
        isCollaborating = false;
        isHost = false;
        window.currentRoom = null;
        
        // Reset UI
        document.getElementById('collaborateBtn').style.display = 'block';
        document.getElementById('collaboratingLabel').style.display = 'none';
        document.querySelector('.container').classList.remove('collaboration-mode');
        document.getElementById('rightPanel').style.display = 'none';
        document.getElementById('roomStatus').textContent = 'Solo Mode';
        document.getElementById('roomStatus').className = 'status-indicator';
        
        // Clear chat
        document.getElementById('chatMessages').innerHTML = '';
        
        showNotification('Collaboration session ended');
    }
}