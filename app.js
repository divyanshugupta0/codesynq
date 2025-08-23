// Global variables
let editor;
window.currentUser = null;
let isCollaborating = false;
let isHost = false;
let currentEditMode = 'freestyle';
let currentEditor = null;
let roomData = null;
let currentSavedFile = null; // {key: string, name: string}
let hasUnsavedChanges = false;
let isTabMode = false;
let editorTabs = [];
let activeTabIndex = 0;

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
    
    // Check for room parameter in URL and auto-join
    checkAndJoinFromURL();
    
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
            console.log('🔌 Attempting to connect to server');
            updateStatus('connecting');
            
            // Always try to connect to current origin for deployed version
            const serverUrl = window.location.origin;
            console.log('Connecting to:', serverUrl);
            console.log('Current hostname:', window.location.hostname);
            console.log('Current protocol:', window.location.protocol);
            
            window.socket = io(serverUrl, { 
                timeout: 15000,
                forceNew: true,
                transports: ['polling'],
                upgrade: false,
                autoConnect: true,
                reconnection: true,
                reconnectionAttempts: 3,
                reconnectionDelay: 1000
            });
            
            let connected = false;
            
            window.socket.on('connect', function() {
                console.log('✅ Connected to server successfully');
                connected = true;
                clearTimeout(forceTimeout);
                updateStatus('connected');
                
                // Always create a default room for code execution
                if (!window.currentRoom) {
                    window.currentRoom = 'solo-' + Date.now();
                }
                
                console.log('Joined room:', window.currentRoom);
            });
            
            window.socket.on('connect_error', function(error) {
                console.log('❌ Server connection error:', error);
                connected = false;
                updateStatus('offline');
            });
            
            window.socket.on('disconnect', function() {
                console.log('Disconnected from server');
                updateStatus('disconnected');
            });
            
            window.socket.on('execution-result', function(data) {
                console.log('Execution result received:', data);
                
                // Clear execution flag to prevent fallback
                window.executionId = null;
                
                // Clear terminal first to remove any fallback messages
                if (data.language !== 'javascript') {
                    clearTerminal();
                }
                
                if (data.language === 'javascript') {
                    displayOutput(data.output, data.error);
                } else {
                    displayOutputInTerminal(data.output, data.error, data.complexity);
                }
                // Handle HTML preview
                if (data.htmlContent) {
                    showPreview(data.htmlContent);
                }
            });
            
            window.socket.on('terminal-output', function(data) {
                // Clear execution flag since server is responding
                window.executionId = null;
                // Reset button on first output
                resetRunButton();
                displayRealTimeOutput(data.text, data.type);
            });
            
            window.socket.on('clear-terminal', function() {
                clearTerminal();
            });
            
            window.socket.on('user-joined', function(data) {
                updateUserList(data.users);
                displayChatMessage({
                    user: 'System',
                    message: `${data.user.username} joined the session`,
                    timestamp: Date.now()
                });
            });
            
            window.socket.on('user-left', function(data) {
                updateUserList(data.users);
                displayChatMessage({
                    user: 'System',
                    message: `${data.user.username} left the session`,
                    timestamp: Date.now()
                });
            });
            
            window.socket.on('video-call-start', function(data) {
                if (peer && localStream && data.peerId !== peer.id) {
                    const call = peer.call(data.peerId, localStream);
                    call.on('stream', (remoteStream) => {
                        addVideoStream(data.peerId, remoteStream);
                    });
                    connections.set(data.peerId, call);
                }
            });
            
            window.socket.on('video-call-end', function(data) {
                const videoElement = document.getElementById(`video-${data.peerId}`);
                if (videoElement) {
                    videoElement.remove();
                }
                if (connections.has(data.peerId)) {
                    connections.get(data.peerId).close();
                    connections.delete(data.peerId);
                }
            });
            
            window.socket.on('edit-request', function(data) {
                if (currentEditor === window.currentUser?.uid) {
                    showEditRequest(data.user);
                }
            });
            
            window.socket.on('cursor-position', function(data) {
                if (currentEditMode === 'freestyle' && data.userId !== window.currentUser?.uid) {
                    showRemoteCursor(data);
                }
            });
            
            window.socket.on('edit-approved', function(data) {
                currentEditor = data.userId;
                updateEditorPermissions();
            });
            
            window.socket.on('edit-mode-changed', function(data) {
                currentEditMode = data.mode;
                if (data.currentEditor) {
                    currentEditor = data.currentEditor;
                }
                if (data.mode === 'restricted') {
                    clearRemoteCursors();
                }
                updateEditorPermissions();
            });
            
            window.socket.on('new-message', function(data) {
                displayChatMessage(data);
            });
            
            window.socket.on('code-updated', function(data) {
                if (editor && !isEditing) {
                    const cursorPos = editor.getCursor();
                    editor.setValue(data.code);
                    editor.setCursor(cursorPos);
                    document.getElementById('languageSelect').value = data.language;
                    const mode = window.getCodeMirrorMode(data.language);
                    editor.setOption('mode', mode);
                }
            });
            
            window.socket.on('room-joined', function(data) {
                console.log('Room joined event received:', data);
                
                // Update editor with room code
                if (editor && data.code) {
                    editor.setValue(data.code);
                    document.getElementById('languageSelect').value = data.language || 'javascript';
                    const mode = window.getCodeMirrorMode(data.language || 'javascript');
                    editor.setOption('mode', mode);
                }
                
                // Set collaboration state
                currentEditMode = data.mode || 'freestyle';
                if (data.host && window.currentUser && data.host === window.currentUser.uid) {
                    isHost = true;
                }
                if (data.mode === 'restricted') {
                    currentEditor = data.currentEditor || data.host;
                } else {
                    currentEditor = null;
                }
                isCollaborating = true;
                
                // Show collaboration UI
                showCollaborationUI(data.roomId || window.currentRoom);
                
                setTimeout(() => updateEditorPermissions(), 100);
                showNotification('Successfully joined collaboration room!');
            });
            
            window.socket.on('edit-rejected', function() {
                showNotification('Edit request rejected');
            });
            
            // Store timeout reference for clearing
            // Force timeout after 10 seconds for production
            const forceTimeout = setTimeout(() => {
                if (!connected) {
                    console.log('⚠️ Connection timeout - switching to solo mode');
                    console.log('Socket state:', window.socket?.connected, window.socket?.disconnected);
                    console.log('Socket transport:', window.socket?.io?.engine?.transport?.name);
                    updateStatus('offline');
                    if (window.socket) {
                        window.socket.disconnect();
                    }
                }
            }, 10000);
            
            // Clear timeout if connected
            window.socket.on('connect', function() {
                clearTimeout(forceTimeout);
            });
            
        } catch (error) {
            console.log('❌ Socket.IO connection failed:', error);
            updateStatus('offline');
        }
    } else {
        console.log('❌ Socket.IO not loaded - running in offline mode');
        updateStatus('offline');
    }
}

function setupProfile() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            console.log('Auth state changed:', user ? 'logged in' : 'logged out', 'Previous user:', window.currentUser);
            const wasLoggedOut = !window.currentUser;
            
            if (user && wasLoggedOut) {
                console.log('User just logged in, attempting to restore content');
                window.currentUser = user;
                
                // Load user preferences from Firebase with delay
                setTimeout(() => loadUserPreferences(), 1000);
                
                // Restore content immediately
                setTimeout(() => {
                    if (editor && editor.getValue) {
                        restoreEditorContent();
                    }
                }, 500);
            } else if (!user && window.currentUser) {
                console.log('User logged out, saving content');
                saveEditorContent();
                window.currentUser = null;
            } else if (user) {
                console.log('User already logged in');
                window.currentUser = user;
                // Load preferences for already logged-in users
                setTimeout(() => loadUserPreferences(), 500);
            } else {
                console.log('No user, no previous user');
            }
        });
    }
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
            hintOptions: {hint: getLanguageHints},
            extraKeys: {
                'Ctrl-Space': 'autocomplete',
                'Ctrl-S': function(cm) {
                    saveCode();
                    return false;
                },
                'Tab': function(cm) {
                    const tabSize = cm.getOption('tabSize');
                    const spaces = ' '.repeat(tabSize);
                    if (cm.somethingSelected()) {
                        cm.indentSelection('add');
                    } else {
                        cm.replaceSelection(spaces);
                    }
                }
            },
            value: '// Welcome to CodeSynq!\n// Start coding here...\n// Press Ctrl+Space for suggestions\n\nconsole.log("Hello, World!");'
        });
        
        window.editor = editor;
        window.isEditing = false;
        
        // Enable auto-suggestions on typing
        editor.on('inputRead', function(cm, change) {
            if (change.text[0].match(/[a-zA-Z]/)) {
                setTimeout(() => {
                    if (!cm.state.completionActive) {
                        CodeMirror.commands.autocomplete(cm, null, {completeSingle: false});
                    }
                }, 100);
            }
        });
        
        // Track changes for save indication
        editor.on('change', function(instance, changeObj) {
            if (isTabMode && editorTabs[activeTabIndex]) {
                editorTabs[activeTabIndex].hasChanges = true;
                renderTabs();
            } else if (currentSavedFile && !hasUnsavedChanges) {
                hasUnsavedChanges = true;
                updateSaveButtonText();
            }
        });
        
        // Add real-time collaboration and auto-save
        editor.on('change', function(instance, changeObj) {
            // Block changes if in restricted mode and user doesn't have edit rights
            if (currentEditMode === 'restricted' && currentEditor !== window.currentUser?.uid) {
                return;
            }
            
            // Auto-save to cache for non-logged users
            if (!window.currentUser) {
                clearTimeout(window.autoSaveTimeout);
                window.autoSaveTimeout = setTimeout(saveEditorContent, 500);
            }
            
            if (isCollaborating && window.socket && window.socket.connected && window.currentRoom) {
                window.isEditing = true;
                clearTimeout(window.editTimeout);
                window.editTimeout = setTimeout(() => {
                    window.isEditing = false;
                }, 100);
                
                const code = instance.getValue();
                const language = document.getElementById('languageSelect').value;
                window.socket.emit('code-change', {
                    roomId: window.currentRoom,
                    code: code,
                    language: language
                });
            }
        });
        
        // Add cursor tracking for freestyle mode
        editor.on('cursorActivity', function(instance) {
            if (isCollaborating && currentEditMode === 'freestyle' && window.socket && window.socket.connected && window.currentRoom) {
                const cursor = instance.getCursor();
                window.socket.emit('cursor-position', {
                    roomId: window.currentRoom,
                    userId: window.currentUser?.uid,
                    userName: window.currentUser?.displayName,
                    line: cursor.line,
                    ch: cursor.ch
                });
            }
        });
        
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
            // Skip validation during restoration
            if (window.isRestoring) {
                const newLanguage = e.target.value;
                languageSelect.dataset.previousValue = newLanguage;
                return;
            }
            
            const newLanguage = e.target.value;
            
            // Tab mode specific logic
            if (isTabMode && editorTabs[activeTabIndex]) {
                editorTabs[activeTabIndex].language = newLanguage;
                const mode = window.getCodeMirrorMode(newLanguage);
                if (editor) {
                    editor.setOption('mode', mode);
                }
                renderTabs();
                return;
            }
            
            // Original single-file mode logic
            const currentCode = editor ? editor.getValue() : '';
            
            // Auto-save before language change for non-logged users
            if (!window.currentUser && currentCode.trim()) {
                saveEditorContent();
            }
            
            if (currentCode.trim() && currentCode !== getDefaultCode(languageSelect.dataset.previousValue || 'javascript')) {
                e.target.value = languageSelect.dataset.previousValue || 'javascript';
                showLanguageSwitchModal(newLanguage);
            } else {
                switchLanguage(newLanguage);
            }
        });
        
        languageSelect.dataset.previousValue = languageSelect.value;
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
    
    // Live preview button
    const livePreviewBtn = document.getElementById('livePreview');
    if (livePreviewBtn) {
        livePreviewBtn.addEventListener('click', toggleLivePreview);
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
    
    // Language switch modal handlers
    document.getElementById('saveBeforeSwitch').addEventListener('click', saveBeforeLanguageSwitch);
    document.getElementById('trashAndSwitch').addEventListener('click', trashAndSwitch);
    document.getElementById('cancelSwitch').addEventListener('click', () => {
        document.getElementById('languageSwitchModal').style.display = 'none';
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
    
    // New window button
    const newWindowBtn = document.getElementById('openNewWindow');
    if (newWindowBtn) {
        newWindowBtn.addEventListener('click', openPreviewInNewWindow);
    }

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
    
    // Setup layout controls
    setupLayoutControls();
    
    // Initialize live preview visibility
    updateLivePreviewVisibility(document.getElementById('languageSelect').value);
    
    // Initialize theme
    setTimeout(() => {
        if (window.currentUser) {
            loadUserPreferences();
        } else {
            const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
            applyTheme(savedTheme);
            document.querySelector(`[data-theme="${savedTheme}"]`)?.classList.add('active');
        }
    }, 100);
    
    // Save content immediately for non-logged users and restore if available
    if (!window.currentUser) {
        // Save current state immediately
        setTimeout(() => {
            if (editor) {
                saveEditorContent();
            }
        }, 1000);
        
        // Try to restore any existing content
        restoreEditorContent();
    }
    
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
    document.getElementById('exitSession').addEventListener('click', exitCollaborationSession);
    
    // Chat functionality
    document.getElementById('sendMessage').addEventListener('click', sendChatMessage);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Video controls
    setupVideoControls();
    
    // Tab mode functionality
    document.getElementById('tabModeBtn').addEventListener('click', toggleTabMode);
    document.getElementById('addTabBtn').addEventListener('click', addNewTab);
    
    // Collaboration toggle
    setupCollaborationToggle();
    
    // Initialize video call when collaboration starts (only if user is logged in)
    if (typeof Peer !== 'undefined' && window.currentUser) {
        initializeVideoCall();
    }
    
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

let monacoEditor = null;

function toggleTabMode() {
    isTabMode = !isTabMode;
    const tabModeBtn = document.getElementById('tabModeBtn');
    const editorSection = document.querySelector('.editor-section');
    
    if (isTabMode) {
        tabModeBtn.innerHTML = '<i class="fas fa-times"></i> Exit VS Code';
        tabModeBtn.classList.add('active');
        
        editorSection.innerHTML = `
            <div class="editor-toolbar">
                <div class="toolbar-left">
                    <button id="tabModeBtn" class="btn-secondary active"><i class="fas fa-times"></i> Exit VS Code</button>
                    <button id="saveVSCode" class="btn-primary"><i class="fas fa-save"></i> Save to Firebase</button>
                </div>
            </div>
            <div id="monacoContainer" style="width:100%;height:calc(100% - 80px);"></div>
        `;
        
        loadMonacoEditor();
        document.getElementById('tabModeBtn').addEventListener('click', toggleTabMode);
        document.getElementById('saveVSCode').addEventListener('click', saveVSCodeContent);
    } else {
        location.reload();
    }
}

function loadMonacoEditor() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/loader.js';
    script.onload = () => {
        require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], () => {
            const language = document.getElementById('languageSelect')?.value || 'javascript';
            const monacoLang = getMonacoLanguage(language);
            const defaultCode = getDefaultCode(language);
            
            monacoEditor = monaco.editor.create(document.getElementById('monacoContainer'), {
                value: defaultCode,
                language: monacoLang,
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 14,
                minimap: { enabled: true }
            });
        });
    };
    document.head.appendChild(script);
}

function getMonacoLanguage(language) {
    const mapping = {
        javascript: 'javascript',
        python: 'python',
        html: 'html',
        css: 'css',
        java: 'java',
        c: 'c',
        cpp: 'cpp'
    };
    return mapping[language] || 'javascript';
}

function saveVSCodeContent() {
    if (!window.currentUser) {
        showNotification('Please login to save your code!');
        return;
    }
    
    const fileName = prompt('Enter file name:');
    if (!fileName) return;
    
    const content = monacoEditor ? monacoEditor.getValue() : '';
    const language = document.getElementById('languageSelect')?.value || 'javascript';
    
    const codeData = {
        name: fileName,
        content: content,
        language: language,
        source: 'vscode-mode',
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        lastModified: new Date().toISOString()
    };
    
    database.ref(`users/${window.currentUser.uid}/savedCodes`).push().set(codeData).then(() => {
        showNotification(`Code saved as "${fileName}"!`);
    }).catch((error) => {
        showNotification('Error saving: ' + error.message);
    });
}

function addTab(name, content = '', language = 'javascript') {
    const tab = {
        id: Date.now(),
        name: name,
        content: content,
        language: language,
        savedFile: null,
        hasChanges: false
    };
    editorTabs.push(tab);
    return tab;
}

function addNewTab() {
    const newTab = addTab('Untitled', getDefaultCode('javascript'), 'javascript');
    activeTabIndex = editorTabs.length - 1;
    renderTabs();
    switchToTab(activeTabIndex);
}

function renderTabs() {
    const tabsContainer = document.getElementById('editorTabs');
    tabsContainer.innerHTML = '';
    
    editorTabs.forEach((tab, index) => {
        const tabElement = document.createElement('div');
        tabElement.className = `editor-tab ${index === activeTabIndex ? 'active' : ''}`;
        tabElement.innerHTML = `
            <span class="tab-name">${tab.name}${tab.hasChanges ? '*' : ''}</span>
            <button class="tab-close" onclick="closeTab(${index})" title="Close tab">×</button>
        `;
        tabElement.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                switchToTab(index);
            }
        });
        tabsContainer.appendChild(tabElement);
    });
}

function switchToTab(index) {
    if (!isTabMode || index < 0 || index >= editorTabs.length) return;
    
    // Save current tab content
    if (editorTabs[activeTabIndex] && editor) {
        editorTabs[activeTabIndex].content = editor.getValue();
        editorTabs[activeTabIndex].language = document.getElementById('languageSelect').value;
    }
    
    activeTabIndex = index;
    const tab = editorTabs[activeTabIndex];
    
    // Load tab content
    if (editor) {
        editor.setValue(tab.content);
        document.getElementById('languageSelect').value = tab.language;
        const mode = window.getCodeMirrorMode(tab.language);
        editor.setOption('mode', mode);
    }
    
    renderTabs();
}

function closeTab(index) {
    if (editorTabs.length <= 1) {
        showNotification('Cannot close the last tab');
        return;
    }
    
    editorTabs.splice(index, 1);
    
    if (activeTabIndex >= index && activeTabIndex > 0) {
        activeTabIndex--;
    }
    
    if (activeTabIndex >= editorTabs.length) {
        activeTabIndex = editorTabs.length - 1;
    }
    
    renderTabs();
    switchToTab(activeTabIndex);
}

window.closeTab = closeTab;

function setupThemeAndSettings() {
    const blurOverlay = document.getElementById('dropdownBlurOverlay');
    const dropdowns = {
        theme: { btn: document.getElementById('themeToggle'), menu: document.getElementById('themeMenu') },
        layout: { btn: document.getElementById('layoutBtn'), menu: document.getElementById('layoutMenu') },
        settings: { btn: document.getElementById('settingsBtn'), menu: document.getElementById('settingsMenu') },
        profile: { btn: document.getElementById('profileBtn'), menu: document.getElementById('profileMenu') }
    };
    
    function closeAllDropdowns() {
        Object.values(dropdowns).forEach(dropdown => {
            if (dropdown.menu) dropdown.menu.classList.remove('show');
        });
        if (blurOverlay) blurOverlay.classList.remove('show');
    }
    
    function openDropdown(menu) {
        closeAllDropdowns();
        menu.classList.add('show');
        if (blurOverlay) blurOverlay.classList.add('show');
    }
    
    // Theme dropdown
    if (dropdowns.theme.btn && dropdowns.theme.menu) {
        dropdowns.theme.btn.addEventListener('click', function(e) {
            e.stopPropagation();
            openDropdown(dropdowns.theme.menu);
        });
        
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', function() {
                const theme = this.dataset.theme;
                applyTheme(theme);
                
                document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
                this.classList.add('active');
                
                closeAllDropdowns();
                showNotification(`Theme changed to ${theme}`);
            });
        });
    }
    
    // Layout dropdown
    if (dropdowns.layout.btn && dropdowns.layout.menu) {
        dropdowns.layout.btn.addEventListener('click', function(e) {
            e.stopPropagation();
            openDropdown(dropdowns.layout.menu);
        });
    }
    
    // Settings dropdown
    if (dropdowns.settings.btn && dropdowns.settings.menu) {
        dropdowns.settings.btn.addEventListener('click', function(e) {
            e.stopPropagation();
            openDropdown(dropdowns.settings.menu);
        });
        
        // Prevent settings menu from closing when clicking inside it
        dropdowns.settings.menu.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        setupSettingsHandlers();
    }
    
    // Profile dropdown
    if (dropdowns.profile.btn && dropdowns.profile.menu) {
        dropdowns.profile.btn.addEventListener('click', function(e) {
            e.stopPropagation();
            openDropdown(dropdowns.profile.menu);
        });
    }
    
    // Blur overlay click
    if (blurOverlay) {
        blurOverlay.addEventListener('click', closeAllDropdowns);
    }
    
    // Global click handler
    document.addEventListener('click', closeAllDropdowns);
}

function setupSettingsHandlers() {
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const tabSizeSelect = document.getElementById('tabSizeSelect');
    const lineWrapToggle = document.getElementById('lineWrapToggle');
    const autoCompleteToggle = document.getElementById('autoCompleteToggle');
    const lineNumbersToggle = document.getElementById('lineNumbersToggle');
    const minimapToggle = document.getElementById('minimapToggle');
    
    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', function() {
            const fontSize = this.value + 'px';
            if (editor) {
                const editorElement = document.querySelector('.CodeMirror');
                if (editorElement) {
                    editorElement.style.fontSize = fontSize;
                    editor.refresh();
                }
            }
            showNotification(`Font size changed to ${this.value}px`);
        });
    }
    
    if (tabSizeSelect) {
        tabSizeSelect.addEventListener('change', function() {
            const tabSize = parseInt(this.value);
            if (monacoEditor) {
                // Monaco Editor (VS Code mode)
                monacoEditor.updateOptions({
                    tabSize: tabSize,
                    insertSpaces: true
                });
            } else if (editor) {
                // CodeMirror editor
                editor.setOption('tabSize', tabSize);
                editor.setOption('indentUnit', tabSize);
            }
            showNotification(`Tab size changed to ${tabSize} spaces`);
        });
    }
    
    if (lineWrapToggle) {
        lineWrapToggle.addEventListener('change', function() {
            if (editor) {
                editor.setOption('lineWrapping', this.checked);
            }
            showNotification(`Line wrapping ${this.checked ? 'enabled' : 'disabled'}`);
        });
    }
    
    if (lineNumbersToggle) {
        lineNumbersToggle.addEventListener('change', function() {
            if (monacoEditor) {
                monacoEditor.updateOptions({
                    lineNumbers: this.checked ? 'on' : 'off'
                });
            } else if (editor) {
                editor.setOption('lineNumbers', this.checked);
            }
            showNotification(`Line numbers ${this.checked ? 'enabled' : 'disabled'}`);
        });
    }
    
    if (minimapToggle) {
        minimapToggle.addEventListener('change', function() {
            if (monacoEditor) {
                monacoEditor.updateOptions({
                    minimap: { enabled: this.checked }
                });
                showNotification(`Minimap ${this.checked ? 'enabled' : 'disabled'}`);
            } else {
                showNotification('Minimap only available in VS Code mode');
                this.checked = false;
            }
        });
    }
}

function setupLayoutControls() {
    // Layout dropdown is now handled in setupThemeAndSettings
    document.querySelectorAll('.layout-option').forEach(option => {
        option.addEventListener('click', function() {
            const layout = this.dataset.layout;
            
            // Save state for non-logged users before layout change
            if (!window.currentUser) {
                saveEditorContent();
            }
            
            applyLayout(layout);
            
            document.querySelectorAll('.layout-option').forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            const blurOverlay = document.getElementById('dropdownBlurOverlay');
            document.getElementById('layoutMenu').classList.remove('show');
            if (blurOverlay) blurOverlay.classList.remove('show');
            
            showNotification(`Layout changed to ${this.querySelector('span').textContent}`);
        });
    });
}

function applyLayout(layout) {
    const editorContainer = document.querySelector('.editor-container');
    const outputSection = document.querySelector('.output-section');
    const editorSection = document.querySelector('.editor-section');
    const resizer = document.querySelector('.resizer');
    const toolbar = document.querySelector('.editor-toolbar');
    
    if (!editorContainer || !outputSection || !editorSection) return;
    
    // Save layout preference
    if (window.currentUser && !window.isRestoring && typeof database !== 'undefined') {
        database.ref(`users/${window.currentUser.uid}/preferences/layout`).set(layout).catch(e => {
            console.log('Error saving layout:', e);
            localStorage.setItem('selectedLayout', layout);
        });
    } else if (!window.isRestoring) {
        localStorage.setItem('selectedLayout', layout);
    }
    
    // Clear all existing styles
    editorContainer.style.cssText = '';
    outputSection.style.cssText = '';
    editorSection.style.flexDirection = '';
    resizer.style.cssText = '';
    
    if (layout.startsWith('v-')) {
        // Vertical layout
        let contentWrapper = editorSection.querySelector('.layout-wrapper');
        if (!contentWrapper) {
            contentWrapper = document.createElement('div');
            contentWrapper.className = 'layout-wrapper';
            contentWrapper.style.cssText = 'display: flex; flex: 1; height: 100%;';
            
            editorSection.appendChild(contentWrapper);
            contentWrapper.appendChild(editorContainer);
            contentWrapper.appendChild(resizer);
            contentWrapper.appendChild(outputSection);
        }
        
        resizer.style.cssText = 'width: 4px; height: 100%; cursor: col-resize; background: var(--border-color);';
        
        let editorPercent;
        switch (layout) {
            case 'v-50-50': editorPercent = 50; break;
            case 'v-60-40': editorPercent = 60; break;
            case 'v-40-60': editorPercent = 40; break;
            case 'v-70-30': editorPercent = 70; break;
            default: editorPercent = 50;
        }
        
        const outputPercent = 100 - editorPercent;
        
        const totalWidth = contentWrapper.offsetWidth || editorSection.offsetWidth;
        const editorWidth = Math.floor(totalWidth * (editorPercent / 100));
        const outputWidth = totalWidth - editorWidth - 4;
        
        editorContainer.style.cssText = `width: ${editorWidth}px; height: 100%; flex-shrink: 0; overflow: auto; max-width: ${editorWidth}px; box-sizing: border-box;`;
        outputSection.style.cssText = `width: ${outputWidth}px; height: 100%; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; border-top: none; border-left: 1px solid var(--border-color); max-width: ${outputWidth}px; box-sizing: border-box;`;
        
        // Set output panels for vertical layout
        document.querySelectorAll('.output-panel').forEach(panel => {
            panel.style.overflowX = 'auto';
            panel.style.overflowY = 'hidden';
        });
    } else {
        // Horizontal layout
        const contentWrapper = editorSection.querySelector('.layout-wrapper');
        if (contentWrapper) {
            editorSection.insertBefore(editorContainer, contentWrapper);
            editorSection.insertBefore(resizer, contentWrapper);
            editorSection.insertBefore(outputSection, contentWrapper);
            contentWrapper.remove();
        }
        
        editorSection.style.flexDirection = 'column';
        resizer.style.cssText = 'width: 100%; height: 4px; cursor: row-resize; background: var(--border-color);';
        
        let editorPercent;
        switch (layout) {
            case '50-50': editorPercent = 50; break;
            case '60-40': editorPercent = 60; break;
            case '70-30': editorPercent = 70; break;
            case '40-60': editorPercent = 40; break;
            case '80-20': editorPercent = 80; break;
            case '25-75': editorPercent = 25; break;
            default: editorPercent = 50;
        }
        
        const outputPercent = 100 - editorPercent;
        
        editorContainer.style.cssText = `height: ${editorPercent}%; flex-shrink: 0; overflow: auto; max-height: ${editorPercent}%; box-sizing: border-box;`;
        outputSection.style.cssText = `height: ${outputPercent}%; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; max-height: ${outputPercent}%; box-sizing: border-box;`;
        
        // Set output panels for horizontal layout
        document.querySelectorAll('.output-panel').forEach(panel => {
            panel.style.overflowX = 'hidden';
            panel.style.overflowY = 'auto';
        });
    }
    
    if (editor && editor.refresh) {
        setTimeout(() => editor.refresh(), 100);
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
        
        const overlay = document.createElement('div');
        overlay.id = 'resizeOverlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.3); backdrop-filter: blur(2px); z-index: 999;';
        document.body.appendChild(overlay);
        
        resizer.classList.add('active');
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        
        const containerRect = document.querySelector('.editor-section').getBoundingClientRect();
        const toolbarHeight = document.querySelector('.editor-toolbar').offsetHeight;
        const isVerticalLayout = resizer.style.cursor === 'col-resize';
        
        if (isVerticalLayout) {
            const mouseX = e.clientX - containerRect.left;
            const minEditorWidth = 200;
            const minOutputWidth = 200;
            const maxEditorWidth = containerRect.width - minOutputWidth - 4;
            
            const newEditorWidth = Math.max(minEditorWidth, Math.min(maxEditorWidth, mouseX));
            const newOutputWidth = containerRect.width - newEditorWidth - 4;
            
            editorContainer.style.cssText = `width: ${newEditorWidth}px; height: 100%; flex-shrink: 0; overflow: auto; max-width: ${newEditorWidth}px; box-sizing: border-box;`;
            outputSection.style.cssText = `width: ${newOutputWidth}px; height: 100%; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; border-top: none; border-left: 1px solid var(--border-color); max-width: ${newOutputWidth}px; box-sizing: border-box;`;
        } else {
            const mouseY = e.clientY - containerRect.top - toolbarHeight;
            const minEditorHeight = 200;
            const minOutputHeight = 100;
            const maxEditorHeight = containerRect.height - toolbarHeight - minOutputHeight - 4;
            
            const newEditorHeight = Math.max(minEditorHeight, Math.min(maxEditorHeight, mouseY));
            const newOutputHeight = containerRect.height - toolbarHeight - newEditorHeight - 4;
            
            editorContainer.style.cssText = `height: ${newEditorHeight}px; flex-shrink: 0; overflow: auto; max-height: ${newEditorHeight}px; box-sizing: border-box;`;
            outputSection.style.cssText = `height: ${newOutputHeight}px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; max-height: ${newOutputHeight}px; box-sizing: border-box;`;
        }
        
        editorContainer.style.flexShrink = '0';
        outputSection.style.flexShrink = '0';
        
        if (editor && editor.refresh) {
            setTimeout(() => editor.refresh(), 0);
        }
    });
    
    document.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            const overlay = document.getElementById('resizeOverlay');
            if (overlay) overlay.remove();
            
            resizer.classList.remove('active');
        }
    });
}

function resetRunButton() {
    const runBtn = document.getElementById('runCode');
    if (runBtn) {
        runBtn.innerHTML = '<i class="fas fa-play"></i> Run';
        runBtn.disabled = false;
    }
}

function executeCode() {
    const code = editor && editor.getValue ? editor.getValue() : document.getElementById('fallback-editor')?.value || '';
    const language = document.getElementById('languageSelect').value;
    const runBtn = document.getElementById('runCode');
    
    // Show loading state
    if (runBtn) {
        runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
        runBtn.disabled = true;
    }
    
    console.log('=== EXECUTE CODE DEBUG ===');
    console.log('Language:', language);
    console.log('Code:', code);
    console.log('Socket connected:', window.socket && window.socket.connected);
    console.log('Current room:', window.currentRoom);
    
    // Try server execution if connected
    if (window.socket && window.socket.connected) {
        console.log('Sending to server for execution');
        const roomId = window.currentRoom || 'solo-' + Date.now();
        
        // Set flag to track if server responded
        window.executionId = Date.now();
        const currentExecutionId = window.executionId;
        
        window.socket.emit('execute-code', {
            roomId: roomId,
            code,
            language,
            executionId: currentExecutionId,
            analyzeComplexity: true
        });
        
        // Fallback after 15 seconds if no server response (longer for server-hosted sites)
        setTimeout(() => {
            if (window.executionId === currentExecutionId) {
                console.log('No server response, running locally');
                resetRunButton();
                runCodeLocally(code, language);
            }
        }, 15000);
        
        // Show HTML preview immediately for better UX
        if (language === 'html') {
            showPreview(code);
        }
        return;
    }
    
    // Fallback to local execution
    console.log('Running locally (server not connected)');
    resetRunButton();
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
    
    // If file is already saved, update it directly
    if (currentSavedFile) {
        updateSavedFile();
        return;
    }
    
    // Show save modal for new file
    document.getElementById('saveCodeModal').style.display = 'block';
    document.getElementById('fileNameInput').focus();
}

function updateSavedFile() {
    const code = editor && editor.getValue ? editor.getValue() : '';
    const language = document.getElementById('languageSelect').value;
    
    const codeData = {
        name: currentSavedFile.name,
        content: code,
        language: language,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        lastModified: new Date().toISOString()
    };
    
    database.ref(`users/${window.currentUser.uid}/savedCodes/${currentSavedFile.key}`).set(codeData).then(() => {
        hasUnsavedChanges = false;
        updateSaveButtonText();
        showNotification(`Updated "${currentSavedFile.name}"!`);
    }).catch((error) => {
        showNotification('Error updating file: ' + error.message);
    });
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
        // Track the saved file
        currentSavedFile = {
            key: codeRef.key,
            name: fileName.trim()
        };
        hasUnsavedChanges = false;
        updateSaveButtonText();
        
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
    
    document.getElementById('loadCode').onclick = () => loadSavedCode(codeData, key);
    document.getElementById('deleteCode').onclick = () => deleteSavedCode(key, codeData.name);
    
    modal.style.display = 'block';
}

function loadSavedCode(codeData, fileKey) {
    if (editor) {
        editor.setValue(codeData.content);
        document.getElementById('languageSelect').value = codeData.language;
        const mode = window.getCodeMirrorMode(codeData.language);
        editor.setOption('mode', mode);
    }
    
    // Track the loaded file
    currentSavedFile = {
        key: fileKey,
        name: codeData.name
    };
    hasUnsavedChanges = false;
    updateSaveButtonText();
    
    document.getElementById('codePreviewModal').style.display = 'none';
    document.getElementById('savedCodesModal').style.display = 'none';
    showNotification(`Loaded "${codeData.name}"`);
}

function updateSaveButtonText() {
    const saveText = document.getElementById('saveText');
    if (!saveText) return;
    
    if (currentSavedFile) {
        if (hasUnsavedChanges) {
            saveText.textContent = `Save "${currentSavedFile.name}"*`;
        } else {
            saveText.textContent = `"${currentSavedFile.name}" Saved`;
        }
    } else {
        saveText.textContent = 'Save';
    }
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
    
    // Save collaboration session to Firebase
    saveCollaborationSession(roomId, mode, true);
    
    // Update UI to show collaborating state
    document.getElementById('collaborateBtn').style.display = 'none';
    document.getElementById('collaboratingLabel').style.display = 'inline-block';
    
    // Update dropdown info
    document.getElementById('dropdownRoomId').textContent = roomId;
    document.getElementById('dropdownMode').textContent = mode;
    document.getElementById('dropdownShareLink').value = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    
    // Show collaboration toggle button (panel hidden by default)
    const toggleBtn = document.getElementById('collaborationToggle');
    toggleBtn.style.display = 'flex';
    toggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    toggleBtn.classList.remove('panel-open');
    document.getElementById('roomStatus').textContent = `Host - ${roomId}`;
    document.getElementById('roomStatus').className = 'status-indicator connected';
    
    // Update editor permissions to show host controls
    setTimeout(() => updateEditorPermissions(), 100);
    
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
    
    // In restricted mode, host gets initial edit rights
    if (currentEditMode === 'restricted') {
        currentEditor = window.currentUser.uid;
    } else {
        // Clear remote cursors when switching to freestyle mode
        clearRemoteCursors();
        currentEditor = null;
    }
    
    // Broadcast mode change
    if (window.socket && window.currentRoom) {
        window.socket.emit('edit-mode-change', {
            roomId: window.currentRoom,
            mode: currentEditMode,
            currentEditor: currentEditor
        });
    }
    
    updateEditorPermissions();
    showNotification(`Mode changed to ${currentEditMode}`);
}

function updateEditorPermissions() {
    if (!editor) return;
    
    const editModeBtn = document.getElementById('editModeBtn');
    const currentEditorSpan = document.getElementById('currentEditor');
    const endSessionBtn = document.getElementById('endSession');
    const exitSessionBtn = document.getElementById('exitSession');
    
    console.log('Updating permissions - isHost:', isHost, 'isCollaborating:', isCollaborating, 'currentEditMode:', currentEditMode);
    
    // Show/hide controls based on host status and current panel
    if (isHost && isCollaborating) {
        if (editModeBtn) {
            editModeBtn.style.display = 'block';
            editModeBtn.textContent = currentEditMode === 'freestyle' ? 'Switch to Restricted' : 'Switch to Freestyle';
        }
        // Show end session button only when users panel is active
        const usersPanel = document.getElementById('users-panel');
        if (endSessionBtn && usersPanel && usersPanel.classList.contains('active')) {
            endSessionBtn.style.display = 'inline-block';
            console.log('Showing end session button for host in users panel');
        } else if (endSessionBtn) {
            endSessionBtn.style.display = 'none';
        }
        if (exitSessionBtn) exitSessionBtn.style.display = 'none';
    } else if (isCollaborating) {
        if (editModeBtn) editModeBtn.style.display = 'none';
        if (endSessionBtn) endSessionBtn.style.display = 'none';
        // Show exit session button only when users panel is active
        const usersPanel = document.getElementById('users-panel');
        if (exitSessionBtn && usersPanel && usersPanel.classList.contains('active')) {
            exitSessionBtn.style.display = 'inline-block';
            console.log('Showing exit session button for participant in users panel');
        } else if (exitSessionBtn) {
            exitSessionBtn.style.display = 'none';
        }
    }
    
    if (currentEditMode === 'freestyle') {
        editor.setOption('readOnly', false);
        if (currentEditorSpan) currentEditorSpan.textContent = 'Freestyle Mode - All can edit';
    } else if (currentEditMode === 'restricted') {
        if (currentEditor && currentEditor === window.currentUser?.uid) {
            editor.setOption('readOnly', false);
            if (currentEditorSpan) currentEditorSpan.textContent = 'You are editing';
        } else {
            editor.setOption('readOnly', true);
            if (currentEditorSpan) {
                currentEditorSpan.innerHTML = `<button onclick="requestEdit()" class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Request Edit</button>`;
            }
        }
    }
}

function requestEdit() {
    if (!window.socket || !window.currentRoom || currentEditMode === 'freestyle') return;
    
    window.socket.emit('edit-request', {
        roomId: window.currentRoom,
        user: {
            uid: window.currentUser.uid,
            displayName: window.currentUser.displayName,
            email: window.currentUser.email
        }
    });
    
    showNotification('Edit request sent!');
}

window.requestEdit = requestEdit;

// Debug function to test button display
window.testRequestButton = function() {
    const currentEditorSpan = document.getElementById('currentEditor');
    if (currentEditorSpan) {
        currentEditorSpan.innerHTML = `<button onclick="requestEdit()" class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Request Edit</button>`;
        console.log('Test button added successfully');
    } else {
        console.log('currentEditor element not found');
    }
};

// Debug function to check connection status
window.checkConnection = function() {
    console.log('=== Connection Status Debug ===');
    console.log('Socket exists:', !!window.socket);
    console.log('Socket connected:', window.socket?.connected);
    console.log('Socket disconnected:', window.socket?.disconnected);
    console.log('Socket id:', window.socket?.id);
    console.log('Current room:', window.currentRoom);
    console.log('Is collaborating:', isCollaborating);
    console.log('Status element text:', document.getElementById('roomStatus')?.textContent);
    
    if (window.socket && window.socket.connected) {
        console.log('✅ Socket should be connected - forcing status update');
        updateStatus('connected');
    } else {
        console.log('❌ Socket not connected');
    }
};

// Force reconnect function
window.forceReconnect = function() {
    console.log('Forcing reconnection...');
    if (window.socket) {
        window.socket.disconnect();
    }
    setTimeout(() => {
        tryServerConnection();
    }, 500);
};

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
    
    // Update editor permissions when switching panels
    if (isCollaborating) {
        if (panelName === 'users') {
            setTimeout(() => updateEditorPermissions(), 100);
        } else {
            // Hide session buttons when not in users panel
            const endSessionBtn = document.getElementById('endSession');
            const exitSessionBtn = document.getElementById('exitSession');
            if (endSessionBtn) endSessionBtn.style.display = 'none';
            if (exitSessionBtn) exitSessionBtn.style.display = 'none';
        }
    }
}

function displayOutput(output, error) {
    console.log('displayOutput called:', { output, error });
    resetRunButton();
    const consolePanel = document.getElementById('console');
    if (!consolePanel) {
        console.log('Console panel not found!');
        return;
    }
    
    const timestamp = new Date().toLocaleTimeString();
    
    if (error) {
        consolePanel.innerHTML += `<div style="color: #f44336;">[${timestamp}] Error: ${error}</div>`;
    } else {
        consolePanel.innerHTML += `<div>[${timestamp}] ${output}</div>`;
    }
    
    consolePanel.scrollTop = consolePanel.scrollHeight;
    switchTab('console');
    console.log('Output displayed in console');
}

function displayOutputInTerminal(output, error, complexity) {
    console.log('displayOutputInTerminal called:', { output, error, complexity });
    resetRunButton();
    const terminalPanel = document.getElementById('terminal');
    if (!terminalPanel) {
        console.log('Terminal panel not found!');
        return;
    }
    
    const timestamp = new Date().toLocaleTimeString();
    const language = document.getElementById('languageSelect')?.value;
    
    if (error) {
        terminalPanel.innerHTML += `<div style="color: #f44336;">[${timestamp}] Error: ${error}</div>`;
    } else if (output) {
        terminalPanel.innerHTML += `<div style="color: #00ff00;">[${timestamp}] ${output}</div>`;
        
        // Check if Java program is waiting for input
        if (language === 'java' && (output.includes('Enter') || output.includes('Input'))) {
            setTimeout(() => addTerminalInput(), 200);
        }
    }
    
    // Always display complexity analysis for backend languages
    if (['python', 'java', 'c', 'cpp'].includes(language)) {
        const analysisComplexity = complexity || getLocalComplexity(editor ? editor.getValue() : '', language);
        console.log('Showing complexity for', language, ':', analysisComplexity);
        terminalPanel.innerHTML += `<div style="color: #ffa500; margin-top: 10px; padding: 8px; border-left: 3px solid #ffa500; background: rgba(255, 165, 0, 0.1); border-radius: 4px;"><strong>📊 Complexity Analysis:</strong><br>⏱️ Time Complexity: ${analysisComplexity.time}<br>💾 Space Complexity: ${analysisComplexity.space}</div>`;
    }
    
    terminalPanel.scrollTop = terminalPanel.scrollHeight;
    switchTab('terminal');
    console.log('Output displayed in terminal');
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
    
    // Add input field for Java Scanner prompts
    if (type === 'stdout' && !terminalPanel.querySelector('.terminal-input')) {
        // Check for Java input prompts or if output doesn't end with newline
        if (text.includes('Enter') || text.includes('Input') || !text.endsWith('\n')) {
            setTimeout(() => {
                if (!terminalPanel.querySelector('.terminal-input')) {
                    addTerminalInput();
                }
            }, 100);
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
    
    // Check if request already exists
    const existingRequest = chatMessages.querySelector(`[data-user-id="${user.uid}"]`);
    if (existingRequest) return;
    
    const requestDiv = document.createElement('div');
    requestDiv.className = 'edit-request';
    requestDiv.setAttribute('data-user-id', user.uid);
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
    const allRequests = document.querySelectorAll('.edit-request');
    allRequests.forEach(req => {
        const reqUserId = req.getAttribute('data-user-id');
        if (reqUserId !== userId && window.socket && window.currentRoom) {
            window.socket.emit('edit-rejected', {
                roomId: window.currentRoom,
                userId: reqUserId
            });
        }
        req.remove();
    });
    
    // Transfer editor rights (even host loses rights)
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
    const requestToRemove = document.querySelector(`[data-user-id="${userId}"]`);
    if (requestToRemove) requestToRemove.remove();
    
    if (window.socket && window.currentRoom) {
        window.socket.emit('edit-rejected', {
            roomId: window.currentRoom,
            userId: userId
        });
    }
};

function addTerminalInput() {
    const terminalPanel = document.getElementById('terminal');
    if (!terminalPanel || terminalPanel.querySelector('.terminal-input')) return;
    
    const inputDiv = document.createElement('div');
    inputDiv.className = 'terminal-input';
    inputDiv.innerHTML = `
        <input type="text" id="terminalInput" placeholder="Enter value and press Enter..." style="
            background: transparent;
            border: 1px solid #555;
            color: #ffffff;
            outline: none;
            font-family: 'Consolas', monospace;
            font-size: 13px;
            padding: 4px;
            margin: 2px 0;
            border-radius: 3px;
            width: 200px;
        ">
    `;
    
    terminalPanel.appendChild(inputDiv);
    
    const input = inputDiv.querySelector('input');
    input.focus();
    
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const value = input.value.trim();
            
            // Send input to server (server will echo it back)
            if (window.socket && window.socket.connected && window.currentRoom) {
                window.socket.emit('terminal-input', {
                    roomId: window.currentRoom,
                    input: value + '\n'
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
            'connecting': 'Connecting...',
            'connected': 'Connected',
            'disconnected': 'Disconnected', 
            'offline': 'Solo Mode'
        };
        statusElement.textContent = statusText[status] || 'Unknown';
        statusElement.className = `status-indicator ${status}`;
        console.log('📊 Status updated to:', statusText[status]);
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
                break;
                
            case 'html':
                showPreview(code);
                displayOutput('HTML preview updated');
                break;
                
            case 'css':
                displayOutput('CSS code ready (combine with HTML for preview)');
                break;
                
            case 'python':
                displayOutputInTerminal('Python requires server connection with Python interpreter installed.', '', getLocalComplexity(code, language));
                break;
            case 'java':
                displayOutputInTerminal('Connecting to server for Java execution...', '', getLocalComplexity(code, language));
                break;
            case 'c':
                displayOutputInTerminal('', 'C: Download MinGW from https://sourceforge.net/projects/mingw-w64/files/ and add to PATH', getLocalComplexity(code, language));
                break;
            case 'cpp':
                displayOutputInTerminal('', 'C++: Download MinGW from https://sourceforge.net/projects/mingw-w64/files/ and add to PATH', getLocalComplexity(code, language));
                break;
                
            default:
                displayOutput(`${language} execution not supported in offline mode`);
        }
    } catch (error) {
        displayOutput('', `Execution error: ${error.message}`);
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Slide in animation
    setTimeout(() => {
        notification.style.transform = 'translateX(-50%) translateY(0)';
    }, 50);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(-50%) translateY(-100px)';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

let isLivePreviewEnabled = false;
let previewWindow = null;

function updateLivePreviewVisibility(language) {
    const btn = document.getElementById('livePreview');
    const runBtn = document.getElementById('runCode');
    
    if (language === 'html') {
        btn.style.display = 'flex';
        if (isLivePreviewEnabled) {
            updateLivePreview();
        }
    } else {
        btn.style.display = 'none';
        if (isLivePreviewEnabled) {
            btn.classList.remove('active');
            runBtn.disabled = false;
            isLivePreviewEnabled = false;
            if (editor) {
                editor.off('change', updateLivePreview);
            }
        }
    }
}

function toggleLivePreview() {
    const btn = document.getElementById('livePreview');
    const runBtn = document.getElementById('runCode');
    const language = document.getElementById('languageSelect').value;
    
    if (language !== 'html') return;
    
    isLivePreviewEnabled = !isLivePreviewEnabled;
    
    if (isLivePreviewEnabled) {
        btn.classList.add('active');
        runBtn.disabled = true;
        showNotification('Live Preview enabled');
        
        if (editor) {
            editor.on('change', updateLivePreview);
        }
        updateLivePreview();
    } else {
        btn.classList.remove('active');
        runBtn.disabled = false;
        showNotification('Live Preview disabled');
        
        if (editor) {
            editor.off('change', updateLivePreview);
        }
    }
}

function updateLivePreview() {
    if (!isLivePreviewEnabled) return;
    
    const language = document.getElementById('languageSelect').value;
    if (language === 'html') {
        const code = editor ? editor.getValue() : '';
        showPreview(code);
        switchTab('preview');
        
        // Update new window if open
        if (previewWindow && !previewWindow.closed) {
            previewWindow.document.open();
            previewWindow.document.write(code);
            previewWindow.document.close();
        }
    }
}

function openPreviewInNewWindow() {
    const code = editor ? editor.getValue() : '';
    const language = document.getElementById('languageSelect').value;
    
    if (language === 'html' && code.trim()) {
        previewWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
        previewWindow.document.write(code);
        previewWindow.document.close();
        
        previewWindow.addEventListener('beforeunload', () => {
            previewWindow = null;
        });
        
        showNotification('Preview opened in new window');
    } else {
        showNotification('Please write HTML code to preview');
    }
}

let pendingLanguageSwitch = null;

function getDefaultCode(language) {
    const defaults = {
        javascript: '// Welcome to CodeSynq!\n// Press Ctrl+Space for suggestions\n\nconsole.log("Hello, World!");',
        python: '# Welcome to CodeSynq!\n# Press Ctrl+Space for suggestions\n\nprint("Hello, World!")',
        html: '<!DOCTYPE html>\n<html>\n<head>\n    <title>My Page</title>\n</head>\n<body>\n    <!-- Press Ctrl+Space for suggestions -->\n    <h1>Hello, World!</h1>\n</body>\n</html>',
        css: '/* Welcome to CodeSynq! */\n/* Press Ctrl+Space for suggestions */\n\nbody {\n    font-family: Arial, sans-serif;\n}',
        java: '// Welcome to CodeSynq!\n// Press Ctrl+Space for suggestions\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
        c: '// Welcome to CodeSynq!\n// Press Ctrl+Space for suggestions\n\n#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}',
        cpp: '// Welcome to CodeSynq!\n// Press Ctrl+Space for suggestions\n\n#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}'
    };
    return defaults[language] || defaults.javascript;
}

function showLanguageSwitchModal(newLanguage) {
    pendingLanguageSwitch = newLanguage;
    const saveBtn = document.getElementById('saveBeforeSwitch');
    
    if (window.currentUser) {
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
        saveBtn.onclick = saveBeforeLanguageSwitch;
    } else {
        saveBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login to Save';
        saveBtn.onclick = () => showNotification('Please login first to save your code!');
    }
    
    document.getElementById('languageSwitchModal').style.display = 'block';
}

function saveBeforeLanguageSwitch() {
    if (!window.currentUser) {
        showNotification('Please login first to save your code!');
        return;
    }
    
    document.getElementById('languageSwitchModal').style.display = 'none';
    document.getElementById('saveCodeModal').style.display = 'block';
    document.getElementById('fileNameInput').focus();
    
    const originalConfirmSave = document.getElementById('confirmSave').onclick;
    document.getElementById('confirmSave').onclick = () => {
        const fileName = document.getElementById('fileNameInput').value;
        if (fileName.trim()) {
            saveCodeWithName(fileName);
            switchLanguage(pendingLanguageSwitch);
        }
    };
}

function trashAndSwitch() {
    document.getElementById('languageSwitchModal').style.display = 'none';
    switchLanguage(pendingLanguageSwitch);
}

function switchLanguage(newLanguage) {
    const languageSelect = document.getElementById('languageSelect');
    languageSelect.value = newLanguage;
    languageSelect.dataset.previousValue = newLanguage;
    
    const mode = window.getCodeMirrorMode(newLanguage);
    if (editor && editor.setOption) {
        editor.setOption('mode', mode);
        editor.setValue(getDefaultCode(newLanguage));
    }
    
    // Reset file tracking when switching languages
    currentSavedFile = null;
    hasUnsavedChanges = false;
    updateSaveButtonText();
    
    updateLivePreviewVisibility(newLanguage);
}

function saveEditorContent() {
    if (editor) {
        const content = {
            code: editor.getValue(),
            language: document.getElementById('languageSelect').value,
            layout: getCurrentLayout()
        };
        sessionStorage.setItem('tempEditorContent', JSON.stringify(content));
        console.log('Content saved:', content);
    }
}

function restoreEditorContent() {
    const saved = sessionStorage.getItem('tempEditorContent');
    console.log('Attempting to restore, saved data:', saved);
    
    if (saved && editor) {
        try {
            const content = JSON.parse(saved);
            console.log('Parsed content:', content);
            
            if (content.code || content.language || content.layout) {
                window.isRestoring = true;
                
                // Restore language first
                if (content.language && content.language !== 'javascript') {
                    const languageSelect = document.getElementById('languageSelect');
                    languageSelect.value = content.language;
                    languageSelect.dataset.previousValue = content.language;
                    
                    const mode = window.getCodeMirrorMode(content.language);
                    editor.setOption('mode', mode);
                    updateLivePreviewVisibility(content.language);
                }
                
                // Restore content
                if (content.code && content.code.trim() !== '') {
                    editor.setValue(content.code);
                    editor.refresh();
                }
                
                // Restore layout
                if (content.layout) {
                    setTimeout(() => {
                        applyLayout(content.layout);
                        document.querySelectorAll('.layout-option').forEach(opt => opt.classList.remove('active'));
                        const activeOption = document.querySelector(`[data-layout="${content.layout}"]`);
                        if (activeOption) activeOption.classList.add('active');
                    }, 100);
                }
                
                setTimeout(() => {
                    window.isRestoring = false;
                    sessionStorage.removeItem('tempEditorContent');
                    showNotification('Previous work restored!');
                }, 200);
            }
        } catch (e) {
            console.log('Error restoring editor content:', e);
        }
    } else {
        console.log('No saved content found or editor not ready');
    }
}

// Profile modal removed - using Firebase auth

function checkAndJoinFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        console.log('Room ID found in URL:', roomId);
        
        // Wait for socket connection and then join
        const attemptJoin = () => {
            if (window.socket && window.socket.connected) {
                joinCollaborationRoom(roomId);
            } else {
                console.log('Socket not ready, retrying in 1 second...');
                setTimeout(attemptJoin, 1000);
            }
        };
        
        // Start attempting to join after a short delay
        setTimeout(attemptJoin, 1500);
    }
}

function joinCollaborationRoom(roomId) {
    console.log('Attempting to join room:', roomId, 'User:', window.currentUser);
    
    // Allow guest users to join collaboration
    if (!window.currentUser) {
        window.currentUser = {
            uid: 'guest-' + Date.now(),
            displayName: 'Guest User',
            email: 'guest@example.com',
            photoURL: 'https://via.placeholder.com/40/666/ffffff?text=G'
        };
        console.log('Created guest user for collaboration:', window.currentUser);
    }
    
    isCollaborating = true;
    isHost = false;
    window.currentRoom = roomId;
    
    // Save collaboration session to Firebase (only for logged users)
    if (window.currentUser && !window.currentUser.uid.startsWith('guest-')) {
        saveCollaborationSession(roomId, 'joined', false);
    }
    
    // Update UI to show collaborating state
    document.getElementById('collaborateBtn').style.display = 'none';
    document.getElementById('collaboratingLabel').style.display = 'inline-block';
    
    // Update dropdown info
    document.getElementById('dropdownRoomId').textContent = roomId;
    document.getElementById('dropdownMode').textContent = 'Joined Session';
    document.getElementById('dropdownShareLink').value = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    
    // Show collaboration toggle button (panel hidden by default)
    const toggleBtn = document.getElementById('collaborationToggle');
    toggleBtn.style.display = 'flex';
    toggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    toggleBtn.classList.remove('panel-open');
    document.getElementById('roomStatus').textContent = `Joined - ${roomId}`;
    document.getElementById('roomStatus').className = 'status-indicator connected';
    
    // Update editor permissions to show participant controls
    updateEditorPermissions();
    
    // Join room via socket
    if (window.socket && window.socket.connected) {
        console.log('Emitting join-room event for:', roomId);
        window.socket.emit('join-room', {
            roomId,
            user: {
                uid: window.currentUser.uid,
                username: window.currentUser.displayName,
                profilePic: window.currentUser.photoURL,
                isHost: false
            }
        });
    } else {
        console.error('Socket not connected when trying to join room');
        showNotification('Connection error. Please refresh and try again.', 'error');
        return;
    }
    
    // Don't show notification here - wait for room-joined event
}

function showCollaborationUI(roomId) {
    // Update UI to show collaborating state
    document.getElementById('collaborateBtn').style.display = 'none';
    document.getElementById('collaboratingLabel').style.display = 'inline-block';
    
    // Update dropdown info
    document.getElementById('dropdownRoomId').textContent = roomId;
    document.getElementById('dropdownMode').textContent = isHost ? currentEditMode : 'Joined Session';
    document.getElementById('dropdownShareLink').value = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    
    // Show collaboration toggle button
    const toggleBtn = document.getElementById('collaborationToggle');
    toggleBtn.style.display = 'flex';
    toggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    toggleBtn.classList.remove('panel-open');
    
    // Update status
    const statusText = isHost ? `Host - ${roomId}` : `Joined - ${roomId}`;
    document.getElementById('roomStatus').textContent = statusText;
    document.getElementById('roomStatus').className = 'status-indicator connected';
}

// Firebase collaboration persistence functions
function saveCollaborationSession(roomId, mode, isHost) {
    if (!window.currentUser) return;
    database.ref(`users/${window.currentUser.uid}/collaboration`).set({
        roomId: roomId,
        mode: mode,
        isHost: isHost,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
}

function clearCollaborationSession() {
    if (!window.currentUser) return;
    database.ref(`users/${window.currentUser.uid}/collaboration`).remove();
}

function loadCollaborationSession() {
    if (!window.currentUser) return;
    database.ref(`users/${window.currentUser.uid}/collaboration`).once('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.roomId) {
            if (data.isHost) {
                isCollaborating = true;
                isHost = true;
                currentEditMode = data.mode;
                window.currentRoom = data.roomId;
                
                document.getElementById('collaborateBtn').style.display = 'none';
                document.getElementById('collaboratingLabel').style.display = 'inline-block';
                document.getElementById('dropdownRoomId').textContent = data.roomId;
                document.getElementById('dropdownMode').textContent = data.mode;
                document.getElementById('dropdownShareLink').value = `${window.location.origin}${window.location.pathname}?room=${data.roomId}`;
                
                const toggleBtn = document.getElementById('collaborationToggle');
                toggleBtn.style.display = 'flex';
                toggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
                toggleBtn.classList.remove('panel-open');
                document.getElementById('roomStatus').textContent = `Host - ${data.roomId}`;
                document.getElementById('roomStatus').className = 'status-indicator connected';
                
                if (window.socket && window.socket.connected) {
                    window.socket.emit('join-room', {
                        roomId: data.roomId,
                        user: {
                            ...window.currentUser,
                            username: window.currentUser.displayName,
                            profilePic: window.currentUser.photoURL,
                            isHost: true
                        }
                    });
                }
            } else {
                joinCollaborationRoom(data.roomId);
            }
        }
    });
}

// Remote cursor management
let remoteCursors = new Map();

function showRemoteCursor(data) {
    if (!editor || currentEditMode !== 'freestyle') return;
    
    const userId = data.userId;
    const userName = data.userName;
    const pos = { line: data.line, ch: data.ch };
    
    // Remove existing cursor
    if (remoteCursors.has(userId)) {
        const oldCursor = remoteCursors.get(userId);
        if (oldCursor.marker) oldCursor.marker.clear();
        if (oldCursor.widget) oldCursor.widget.clear();
    }
    
    // Create cursor marker
    const cursorElement = document.createElement('span');
    cursorElement.className = 'remote-cursor';
    cursorElement.style.cssText = `
        position: absolute;
        width: 2px;
        height: 1.2em;
        background: ${getUserColor(userId)};
        z-index: 100;
        pointer-events: none;
    `;
    
    // Create name label
    const nameLabel = document.createElement('div');
    nameLabel.className = 'cursor-label';
    nameLabel.textContent = userName;
    nameLabel.style.cssText = `
        position: absolute;
        top: -20px;
        left: 0;
        background: ${getUserColor(userId)};
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        white-space: nowrap;
        pointer-events: none;
        z-index: 101;
    `;
    cursorElement.appendChild(nameLabel);
    
    const marker = editor.setBookmark(pos, { widget: cursorElement });
    
    remoteCursors.set(userId, { marker, widget: marker });
    
    // Auto-hide after 3 seconds of inactivity
    setTimeout(() => {
        if (remoteCursors.has(userId)) {
            const cursor = remoteCursors.get(userId);
            if (cursor.marker) cursor.marker.clear();
            remoteCursors.delete(userId);
        }
    }, 3000);
}

function clearRemoteCursors() {
    remoteCursors.forEach(cursor => {
        if (cursor.marker) cursor.marker.clear();
    });
    remoteCursors.clear();
}

function getUserColor(userId) {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    const hash = userId.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
}

function getCurrentLayout() {
    const editorContainer = document.querySelector('.editor-container');
    const outputSection = document.querySelector('.output-section');
    const resizer = document.querySelector('.resizer');
    
    if (!editorContainer || !outputSection) return '50-50';
    
    const isVertical = resizer.style.cursor === 'col-resize';
    
    if (isVertical) {
        const editorWidth = editorContainer.offsetWidth;
        const totalWidth = editorContainer.parentElement.offsetWidth;
        const percentage = Math.round((editorWidth / totalWidth) * 100);
        
        if (percentage >= 68) return 'v-70-30';
        if (percentage >= 58) return 'v-60-40';
        if (percentage >= 48) return 'v-50-50';
        return 'v-40-60';
    } else {
        const editorHeight = editorContainer.offsetHeight;
        const totalHeight = editorContainer.parentElement.offsetHeight - document.querySelector('.editor-toolbar').offsetHeight;
        const percentage = Math.round((editorHeight / totalHeight) * 100);
        
        if (percentage >= 78) return '80-20';
        if (percentage >= 68) return '70-30';
        if (percentage >= 58) return '60-40';
        if (percentage >= 48) return '50-50';
        if (percentage >= 38) return '40-60';
        return '25-75';
    }
}

function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    
    if (editor) {
        const editorThemes = {
            dark: 'vscode-dark',
            light: 'default',
            blue: 'material',
            green: 'monokai'
        };
        editor.setOption('theme', editorThemes[theme] || 'vscode-dark');
    }
    
    // Update favicon based on theme
    updateFavicon(theme);
    
    // Save theme preference
    if (window.currentUser && typeof database !== 'undefined') {
        database.ref(`users/${window.currentUser.uid}/preferences/theme`).set(theme).catch(e => {
            console.log('Error saving theme:', e);
            localStorage.setItem('selectedTheme', theme);
        });
    } else {
        localStorage.setItem('selectedTheme', theme);
    }
}

function updateFavicon(theme) {
    const faviconColors = {
        dark: '#0d1117',
        light: '#ffffff', 
        blue: '#0a1929',
        green: '#0d1b0d'
    };
    
    const iconColors = {
        dark: '#007acc',
        light: '#0066cc', 
        blue: '#2196F3',
        green: '#4CAF50'
    };
    
    const bgColor = faviconColors[theme] || '#0d1117';
    const iconColor = iconColors[theme] || '#007acc';
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bgColor}"/><text x="50" y="65" font-family="Arial, sans-serif" font-size="50" font-weight="bold" text-anchor="middle" fill="${iconColor}">&lt;/&gt;</text></svg>`;
    
    let favicon = document.querySelector('link[rel="icon"]');
    if (favicon) {
        favicon.remove();
    }
    
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/svg+xml';
    favicon.href = 'data:image/svg+xml;base64,' + btoa(svg);
    document.head.appendChild(favicon);
}

// Language-specific suggestions
const languageSuggestions = {
    javascript: [
        'console.log', 'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'return',
        'document', 'window', 'addEventListener', 'getElementById', 'querySelector',
        'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON',
        'setTimeout', 'setInterval', 'Promise', 'async', 'await', 'try', 'catch', 'throw'
    ],
    python: [
        'print', 'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'import',
        'from', 'as', 'try', 'except', 'finally', 'with', 'lambda', 'yield',
        'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed',
        'str', 'int', 'float', 'list', 'dict', 'tuple', 'set', 'bool'
    ],
    html: [
        'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'ul', 'ol', 'li',
        'table', 'tr', 'td', 'th', 'form', 'input', 'button', 'select', 'option',
        'head', 'body', 'title', 'meta', 'link', 'script', 'style'
    ],
    css: [
        'color', 'background', 'font-size', 'font-family', 'margin', 'padding', 'border',
        'width', 'height', 'display', 'position', 'top', 'left', 'right', 'bottom',
        'flex', 'grid', 'text-align', 'text-decoration', 'opacity', 'z-index'
    ],
    java: [
        'public', 'private', 'protected', 'static', 'final', 'class', 'interface',
        'extends', 'implements', 'import', 'package', 'void', 'int', 'String',
        'boolean', 'double', 'float', 'char', 'long', 'short', 'byte',
        'System.out.println', 'new', 'this', 'super', 'null', 'true', 'false'
    ],
    c: [
        '#include', 'stdio.h', 'stdlib.h', 'string.h', 'int', 'char', 'float', 'double',
        'void', 'main', 'printf', 'scanf', 'malloc', 'free', 'sizeof',
        'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return'
    ],
    cpp: [
        '#include', 'iostream', 'vector', 'string', 'map', 'set', 'queue', 'stack',
        'using', 'namespace', 'std', 'cout', 'cin', 'endl', 'class', 'public', 'private',
        'int', 'char', 'float', 'double', 'bool', 'void', 'new', 'delete'
    ]
};

function getLanguageHints(cm, options) {
    const language = document.getElementById('languageSelect').value;
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    const start = token.start;
    const end = cursor.ch;
    const word = token.string;
    
    const suggestions = languageSuggestions[language] || [];
    const filtered = suggestions.filter(item => 
        item.toLowerCase().startsWith(word.toLowerCase())
    );
    
    return {
        list: filtered,
        from: CodeMirror.Pos(cursor.line, start),
        to: CodeMirror.Pos(cursor.line, end)
    };
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
    
    if (!message || !window.socket || !window.currentRoom || !window.currentUser) return;
    
    window.socket.emit('chat-message', {
        roomId: window.currentRoom,
        message: message,
        user: {
            uid: window.currentUser.uid,
            username: window.currentUser.displayName,
            profilePic: window.currentUser.photoURL
        }
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

function updateUserList(users) {
    const userList = document.getElementById('userList');
    const userCount = document.getElementById('userCount');
    
    userList.innerHTML = '';
    userCount.textContent = users.length;
    
    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        
        userItem.innerHTML = `
            <img src="${user.profilePic}" alt="${user.username}" class="user-avatar">
            <div class="user-info">
                <div class="user-name">${user.username}${user.isHost ? ' (Host)' : ''}</div>
                <div class="user-status">${user.isHost ? 'Host' : 'Participant'}</div>
            </div>
        `;
        
        userList.appendChild(userItem);
    });
}

function loadUserPreferences() {
    if (!window.currentUser || typeof database === 'undefined') {
        // Fallback to localStorage for non-logged users
        const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
        applyTheme(savedTheme);
        document.querySelector(`[data-theme="${savedTheme}"]`)?.classList.add('active');
        return;
    }
    
    database.ref(`users/${window.currentUser.uid}/preferences`).once('value', (snapshot) => {
        const prefs = snapshot.val();
        console.log('Loaded preferences:', prefs);
        
        if (prefs) {
            // Apply saved theme
            if (prefs.theme) {
                document.body.setAttribute('data-theme', prefs.theme);
                if (editor) {
                    const editorThemes = {
                        dark: 'vscode-dark',
                        light: 'default',
                        blue: 'material',
                        green: 'monokai'
                    };
                    editor.setOption('theme', editorThemes[prefs.theme] || 'vscode-dark');
                }
                document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
                document.querySelector(`[data-theme="${prefs.theme}"]`)?.classList.add('active');
            }
            
            // Apply saved layout
            if (prefs.layout) {
                setTimeout(() => {
                    applyLayout(prefs.layout);
                    document.querySelectorAll('.layout-option').forEach(opt => opt.classList.remove('active'));
                    document.querySelector(`[data-layout="${prefs.layout}"]`)?.classList.add('active');
                }, 300);
            }
        } else {
            // No preferences saved, apply defaults
            const defaultTheme = 'dark';
            applyTheme(defaultTheme);
            document.querySelector(`[data-theme="${defaultTheme}"]`)?.classList.add('active');
        }
    }).catch(e => {
        console.log('Error loading preferences:', e);
        // Fallback to localStorage
        const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
        applyTheme(savedTheme);
        document.querySelector(`[data-theme="${savedTheme}"]`)?.classList.add('active');
    });
}

function endCollaborationSession() {
    if (confirm('Are you sure you want to end the collaboration session?')) {
        isCollaborating = false;
        isHost = false;
        window.currentRoom = 'solo-' + Date.now();
        
        // Clear collaboration session from Firebase
        clearCollaborationSession();
        
        // Reset UI
        document.getElementById('collaborateBtn').style.display = 'inline-block';
        document.getElementById('collaboratingLabel').style.display = 'none';
        document.querySelector('.container').classList.remove('collaboration-mode');
        document.getElementById('rightPanel').style.display = 'none';
        document.getElementById('collaborationToggle').style.display = 'none';
        
        // Keep the current connection status
        if (window.socket && window.socket.connected) {
            updateStatus('connected');
        } else {
            updateStatus('offline');
        }
        
        // Clear chat and cursors
        document.getElementById('chatMessages').innerHTML = '';
        clearRemoteCursors();
        
        showNotification('Collaboration session ended');
    }
}

function exitCollaborationSession() {
    if (confirm('Are you sure you want to exit the collaboration session?')) {
        isCollaborating = false;
        isHost = false;
        window.currentRoom = 'solo-' + Date.now();
        
        // Clear collaboration session from Firebase
        clearCollaborationSession();
        
        // Stop video call
        stopVideoCall();
        
        // Reset UI
        document.getElementById('collaborateBtn').style.display = 'inline-block';
        document.getElementById('collaboratingLabel').style.display = 'none';
        document.querySelector('.container').classList.remove('collaboration-mode');
        document.getElementById('rightPanel').style.display = 'none';
        document.getElementById('collaborationToggle').style.display = 'none';
        
        // Keep the current connection status
        if (window.socket && window.socket.connected) {
            updateStatus('connected');
        } else {
            updateStatus('offline');
        }
        
        // Clear chat and cursors
        document.getElementById('chatMessages').innerHTML = '';
        clearRemoteCursors();
        
        showNotification('Exited collaboration session');
    }
}

// Video Call Functionality
let localStream = null;
let peer = null;
let connections = new Map();

function initializeVideoCall() {
    if (typeof Peer === 'undefined') {
        console.log('PeerJS not loaded');
        return;
    }
    
    if (!window.currentUser) {
        console.log('No user logged in, skipping video call initialization');
        return;
    }
    
    peer = new Peer(window.currentUser.uid, {
        host: 'peerjs-server.herokuapp.com',
        port: 443,
        secure: true
    });
    
    peer.on('open', (id) => {
        console.log('Peer connected with ID:', id);
    });
    
    peer.on('call', (call) => {
        if (localStream) {
            call.answer(localStream);
            call.on('stream', (remoteStream) => {
                addVideoStream(call.peer, remoteStream);
            });
        }
    });
}

function startVideoCall() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
            localStream = stream;
            addVideoStream('local', stream);
            
            // Notify other users about video call
            if (window.socket && window.currentRoom) {
                window.socket.emit('video-call-start', {
                    roomId: window.currentRoom,
                    peerId: peer.id
                });
            }
        })
        .catch((err) => {
            console.error('Failed to get media:', err);
            showNotification('Camera/microphone access denied', 'error');
        });
}

function stopVideoCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    connections.forEach((call) => {
        call.close();
    });
    connections.clear();
    
    document.getElementById('videoGrid').innerHTML = '';
    
    if (window.socket && window.currentRoom) {
        window.socket.emit('video-call-end', {
            roomId: window.currentRoom
        });
    }
}

function addVideoStream(userId, stream) {
    const videoGrid = document.getElementById('videoGrid');
    const existingVideo = document.getElementById(`video-${userId}`);
    
    if (existingVideo) {
        existingVideo.srcObject = stream;
        return;
    }
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `video-${userId}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = userId === 'local';
    
    const username = document.createElement('div');
    username.className = 'video-username';
    username.textContent = userId === 'local' ? 'You' : userId;
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(username);
    videoGrid.appendChild(videoContainer);
}

// Video controls
function setupVideoControls() {
    document.getElementById('toggleVideo').addEventListener('click', () => {
        if (localStream) {
            stopVideoCall();
        } else {
            startVideoCall();
        }
    });
    
    document.getElementById('toggleAudio').addEventListener('click', () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.getElementById('toggleAudio');
                btn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
            }
        }
    });
}

function setupCollaborationToggle() {
    const toggleBtn = document.getElementById('collaborationToggle');
    const rightPanel = document.getElementById('rightPanel');
    const container = document.querySelector('.container');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = rightPanel.style.display !== 'none';
            
            if (isVisible) {
                // Hide panel
                rightPanel.style.display = 'none';
                container.classList.remove('collaboration-mode');
                toggleBtn.classList.remove('panel-open');
                toggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
            } else {
                // Show panel
                rightPanel.style.display = 'block';
                container.classList.add('collaboration-mode');
                toggleBtn.classList.add('panel-open');
                toggleBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
            }
        });
    }
}

function getLocalComplexity(code, language) {
    const patterns = {
        loops: /\b(for|while|do)\s*\(/g,
        nestedLoops: /\b(for|while)\s*\([^}]*\b(for|while)\s*\(/g,
        recursion: /\b\w+\s*\([^)]*\)\s*{[^}]*\b\w+\s*\(/g,
        arrays: /\b(int|char|float|double|string)\s*\w+\s*\[|\bnew\s+\w+\[|\blist\s*\(|\barray\s*\(/g,
        sorting: /\b(sort|Sort|sorted|quicksort|mergesort|heapsort)\b/g
    };
    
    const loopCount = (code.match(patterns.loops) || []).length;
    const nestedLoopCount = (code.match(patterns.nestedLoops) || []).length;
    const hasRecursion = patterns.recursion.test(code);
    const hasArrays = patterns.arrays.test(code);
    const hasSorting = patterns.sorting.test(code);
    
    let timeComplexity = 'O(1)';
    let spaceComplexity = 'O(1)';
    
    if (hasSorting) {
        timeComplexity = 'O(n log n)';
        spaceComplexity = 'O(log n)';
    } else if (nestedLoopCount > 0) {
        timeComplexity = 'O(n²)';
        spaceComplexity = hasArrays ? 'O(n)' : 'O(1)';
    } else if (hasRecursion) {
        timeComplexity = 'O(2^n)';
        spaceComplexity = 'O(n)';
    } else if (loopCount > 0) {
        timeComplexity = 'O(n)';
        spaceComplexity = hasArrays ? 'O(n)' : 'O(1)';
    } else if (hasArrays) {
        spaceComplexity = 'O(n)';
    }
    
    return { time: timeComplexity, space: spaceComplexity };
}