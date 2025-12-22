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

// Auto-save functionality
function saveEditorState() {
    if (!editor) return;

    const state = {
        isTabMode: isTabMode,
        timestamp: Date.now()
    };

    if (isTabMode) {
        // Save current tab content
        if (editorTabs[activeTabIndex]) {
            editorTabs[activeTabIndex].content = editor.getValue();
        }
        state.editorTabs = editorTabs;
        state.activeTabIndex = activeTabIndex;
    } else {
        state.content = editor.getValue();
        state.language = document.getElementById('languageSelect').value;
    }

    localStorage.setItem('codesynq_editor_state', JSON.stringify(state));
}

function loadEditorState() {
    const saved = localStorage.getItem('codesynq_editor_state');
    if (!saved) return false;

    try {
        const state = JSON.parse(saved);
        // Only restore if saved within last 24 hours
        if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
            localStorage.removeItem('codesynq_editor_state');
            return false;
        }

        if (editor && state.isTabMode && state.editorTabs) {
            // Restore tab mode
            isTabMode = true;
            const tabModeBtn = document.getElementById('tabModeBtn');
            tabModeBtn.innerHTML = '<i class="fas fa-times"></i> Exit Tab Mode';
            tabModeBtn.classList.add('active');
            document.getElementById('tabBar').style.display = 'flex';

            editorTabs = state.editorTabs;
            activeTabIndex = state.activeTabIndex || 0;
            const activeTab = editorTabs[activeTabIndex];

            // Set language and content directly without triggering boilerplate
            if (activeTab) {
                const languageSelect = document.getElementById('languageSelect');
                languageSelect.value = activeTab.language;
                const language = getMonacoLanguage(activeTab.language);
                monaco.editor.setModelLanguage(editor.getModel(), language);
                editor.setValue(activeTab.content);
                updateLivePreviewVisibility(activeTab.language);
                resetRunButton();
            }

            renderTabs();
            return true;
        } else if (editor && state.content && state.language) {
            // Restore single file mode
            document.getElementById('languageSelect').value = state.language;
            const language = getMonacoLanguage(state.language);
            monaco.editor.setModelLanguage(editor.getModel(), language);
            editor.setValue(state.content);
            updateLivePreviewVisibility(state.language);
            resetRunButton();
            return true;
        }
    } catch (e) {
        localStorage.removeItem('codesynq_editor_state');
    }
    return false;
}

// Auto-save on content change
function setupAutoSave() {
    if (!editor) return;

    editor.onDidChangeModelContent(() => {
        saveEditorState();
    });

    document.getElementById('languageSelect').addEventListener('change', () => {
        saveEditorState();
    });
}

// Save state before page unload
window.addEventListener('beforeunload', () => {
    saveEditorState();
});

// Prevent F5 from reloading page globally
window.addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
        e.preventDefault();
        return false;
    }
});

// Admin notification system
let adminNotificationListener = null;
let messaging = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    console.log('Initializing CodeNexus Pro...');
    initializeApp();
});

// Simple keyboard shortcuts
document.addEventListener('keydown', function (e) {
    // Only handle shortcuts when not in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (isTabMode) {
            handleTabModeSave();
        } else {
            saveCode();
        }
    }
    if (e.ctrlKey && e.key === 'n' && isTabMode) {
        e.preventDefault();
        addNewTab();
    }
    if (e.ctrlKey && e.key === 'w' && isTabMode) {
        e.preventDefault();
        closeTab(activeTabIndex);
    }

    // F5 key for running backend languages
    if (e.key === 'F5') {
        e.preventDefault();
        const language = document.getElementById('languageSelect').value;
        const backendLanguages = ['python', 'java', 'c', 'cpp', 'javascript'];

        if (backendLanguages.includes(language)) {
            executeCode();
        } else {
            showNotification(`F5 shortcut is only available for backend languages (Python, Java, C, C++, JavaScript)`);
        }
        return false;
    }
});

let loadingProgress = 0;
let settingsLoaded = false;
let themeApplied = false;
let layoutApplied = false;
let editorSettingsApplied = false;

function updateLoadingProgress(progress, text) {
    const progressBar = document.getElementById('progressBar');
    const loadingText = document.querySelector('.loading-text');
    if (progressBar) progressBar.style.width = progress + '%';
    if (loadingText && text) loadingText.textContent = text;
    loadingProgress = progress;
}

function initializeApp() {
    try {
        console.log('Starting app initialization...');
        updateLoadingProgress(10, 'Initializing application...');

        // Setup profile first
        setupProfile();
        updateLoadingProgress(25, 'Setting up user profile...');

        // Initialize editor
        setupEditor();
        updateLoadingProgress(50, 'Loading code editor...');

        // Setup UI event listeners
        setupUI();
        updateLoadingProgress(70, 'Setting up interface...');

        // Try to connect to server
        console.log('Current URL:', window.location.href);
        console.log('Socket.IO available:', typeof io !== 'undefined');
        tryServerConnection();
        updateLoadingProgress(85, 'Connecting to server...');

        console.log('App initialized successfully');

        // Check for room parameter in URL and auto-join
        checkAndJoinFromURL();

        // Check if settings are loaded, if not wait
        checkSettingsAndHideLoader();

    } catch (error) {
        console.error('App initialization failed:', error);
        setupBasicFunctionality();
        hideLoadingScreen();
    }
}

let loaderCheckCount = 0;
const MAX_LOADER_CHECKS = 100; // 10 seconds max

function checkSettingsAndHideLoader() {
    loaderCheckCount++;

    // Fallback: force hide loader after 10 seconds
    if (loaderCheckCount >= MAX_LOADER_CHECKS) {
        console.log('Loader timeout reached, forcing hide');
        updateLoadingProgress(100, 'Ready!');
        setTimeout(() => hideLoadingScreen(), 500);
        return;
    }

    // Check if user is logged in (either Firebase auth or window.currentUser)
    const isLoggedIn = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) || window.currentUser;

    if (isLoggedIn) {
        // For logged users, wait for all settings to be applied
        if (themeApplied && layoutApplied && editorSettingsApplied) {
            console.log('All settings applied for logged user, hiding loader');
            updateLoadingProgress(100, 'Ready!');
            setTimeout(() => hideLoadingScreen(), 500);
        } else {
            console.log('Waiting for settings:', { themeApplied, layoutApplied, editorSettingsApplied });
            setTimeout(checkSettingsAndHideLoader, 100);
        }
    } else {
        // For non-logged users, hide loader after server connection
        if (window.socket && window.socket.connected) {
            console.log('Server connected for non-logged user, hiding loader');
            updateLoadingProgress(100, 'Ready!');
            setTimeout(() => hideLoadingScreen(), 500);
        } else {
            setTimeout(checkSettingsAndHideLoader, 100);
        }
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        loadingScreen.style.transition = 'opacity 0.8s ease';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 800);
    }
}

function setupBasicFunctionality() {
    console.log('Setting up basic functionality as fallback...');

    // Ensure Run button works
    const runBtn = document.getElementById('runCode');
    if (runBtn) {
        runBtn.onclick = function () {
            console.log('Run button clicked');
            executeCode();
        };
    }

    // Ensure Save button works
    const saveBtn = document.getElementById('saveCode');
    if (saveBtn) {
        saveBtn.onclick = function () {
            console.log('Save button clicked');
            saveCode();
        };
    }

    // Ensure Theme button works
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.onclick = function () {
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

            window.socket.on('connect', function () {
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

            window.socket.on('connect_error', function (error) {
                console.log('❌ Server connection error:', error);
                connected = false;
                updateStatus('offline');
            });

            window.socket.on('disconnect', function () {
                console.log('Disconnected from server');
                updateStatus('disconnected');
            });

            window.socket.on('execution-result', function (data) {
                console.log('Execution result received:', data);

                // Clear execution flag to prevent fallback
                window.executionId = null;

                // Clear terminal first to remove any fallback messages
                if (data.language !== 'javascript') {
                    clearTerminal();
                }

                if (data.language === 'javascript') {
                    // Reset run button
                    resetRunButton();

                    // Clear console first
                    const consolePanel = document.getElementById('console');
                    if (consolePanel) {
                        consolePanel.innerHTML = '';
                    }

                    // Display server output in custom console
                    if (data.error) {
                        displayConsoleOutput(data.error, 'error');
                    } else if (data.output && data.output.trim()) {
                        // Split output by lines and display each
                        const lines = data.output.trim().split('\n');
                        lines.forEach(line => {
                            if (line.trim()) {
                                displayConsoleOutput(line, 'log');
                            }
                        });
                    } else {
                        displayConsoleOutput('Code executed successfully', 'success');
                    }
                } else {
                    displayOutputInTerminal(data.output, data.error, data.complexity);
                }
                // Handle HTML preview
                if (data.htmlContent) {
                    showPreview(data.htmlContent);
                }
            });

            window.socket.on('terminal-output', function (data) {
                // Clear execution flag since server is responding
                window.executionId = null;
                // Reset button on first output
                resetRunButton();
                displayRealTimeOutput(data.text, data.type);
            });

            window.socket.on('clear-terminal', function () {
                clearTerminal();
            });

            window.socket.on('user-joined', function (data) {
                updateUserList(data.users);
                displayChatMessage({
                    user: 'System',
                    message: `${data.user.username} joined the session`,
                    timestamp: Date.now()
                });
            });

            window.socket.on('user-left', function (data) {
                updateUserList(data.users);
                displayChatMessage({
                    user: 'System',
                    message: `${data.user.username} left the session`,
                    timestamp: Date.now()
                });
            });

            window.socket.on('video-call-start', function (data) {
                if (peer && localStream && data.peerId !== peer.id) {
                    const call = peer.call(data.peerId, localStream);
                    call.on('stream', (remoteStream) => {
                        addVideoStream(data.peerId, remoteStream);
                    });
                    connections.set(data.peerId, call);
                }
            });

            window.socket.on('video-call-end', function (data) {
                const videoElement = document.getElementById(`video-${data.peerId}`);
                if (videoElement) {
                    videoElement.remove();
                }
                if (connections.has(data.peerId)) {
                    connections.get(data.peerId).close();
                    connections.delete(data.peerId);
                }
            });

            window.socket.on('edit-request', function (data) {
                if (currentEditor === window.currentUser?.uid) {
                    showEditRequest(data.user);
                }
            });

            window.socket.on('cursor-position', function (data) {
                if (currentEditMode === 'freestyle' && data.userId !== window.currentUser?.uid) {
                    showRemoteCursor(data);
                }
            });

            window.socket.on('edit-approved', function (data) {
                currentEditor = data.userId;
                updateEditorPermissions();
            });

            window.socket.on('edit-mode-changed', function (data) {
                currentEditMode = data.mode;
                if (data.currentEditor) {
                    currentEditor = data.currentEditor;
                }
                if (data.mode === 'restricted') {
                    clearRemoteCursors();
                }
                updateEditorPermissions();
            });

            window.socket.on('new-message', function (data) {
                displayChatMessage(data);
            });

            window.socket.on('code-updated', function (data) {
                if (editor && !isEditing) {
                    const cursorPos = editor.getCursor();
                    editor.setValue(data.code);
                    editor.setCursor(cursorPos);
                    document.getElementById('languageSelect').value = data.language;
                    const mode = window.getCodeMirrorMode(data.language);
                    editor.setOption('mode', mode);
                }
            });

            window.socket.on('room-joined', function (data) {
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

            window.socket.on('edit-rejected', function () {
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
            window.socket.on('connect', function () {
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

                // Show notifications and friends dropdowns
                document.querySelector('.notifications-dropdown').style.display = 'inline-block';
                document.querySelector('.friends-dropdown').style.display = 'inline-block';

                // Load user preferences from Firebase with delay
                setTimeout(() => loadUserPreferences(), 1000);

                // Set user online status
                setTimeout(() => setUserOnline(), 500);

                // Load friend requests
                setTimeout(() => {
                    if (typeof loadFriendRequests === 'function') {
                        loadFriendRequests();
                    }
                }, 1500);

                // Setup admin notifications listener
                setTimeout(() => setupAdminNotifications(), 2000);

                // Restore content immediately
                setTimeout(() => {
                    if (editor && editor.getValue) {
                        restoreEditorContent();
                    }
                }, 500);
            } else if (!user && window.currentUser) {
                console.log('User logged out, saving content');
                saveEditorContent();

                // Cleanup admin notifications listener
                if (adminNotificationListener) {
                    database.ref('adminNotifications').off('child_added', adminNotificationListener);
                    adminNotificationListener = null;
                }

                window.currentUser = null;

                // Hide notifications and friends dropdowns
                document.querySelector('.notifications-dropdown').style.display = 'none';
                document.querySelector('.friends-dropdown').style.display = 'none';
            } else if (user) {
                console.log('User already logged in');
                window.currentUser = user;

                // Show notifications and friends dropdowns
                document.querySelector('.notifications-dropdown').style.display = 'inline-block';
                document.querySelector('.friends-dropdown').style.display = 'inline-block';

                // Load preferences for already logged-in users
                setTimeout(() => loadUserPreferences(), 500);
                setUserOnline();

                // Setup admin notifications listener
                setTimeout(() => setupAdminNotifications(), 1000);

                // Load friend requests for already logged-in users
                setTimeout(() => {
                    if (typeof loadFriendRequests === 'function') {
                        loadFriendRequests();
                    }
                }, 1000);
            } else {
                console.log('No user, no previous user');
                // Set flags for non-logged users immediately
                themeApplied = true;
                layoutApplied = true;
                editorSettingsApplied = true;
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

    // Load Monaco Editor
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        const defaultCode = getDefaultCode('javascript');

        editor = monaco.editor.create(editorElement, {
            value: defaultCode,
            language: 'javascript',
            theme: getMonacoTheme('dark'),
            automaticLayout: true,
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: false },
            wordWrap: 'on',
            tabSize: 2,
            insertSpaces: true,
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            contextmenu: true,
            mouseWheelZoom: true,
            quickSuggestions: {
                other: true,
                comments: true,
                strings: true
            },
            parameterHints: {
                enabled: true
            },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            snippetSuggestions: 'top',
            wordBasedSuggestions: true,
            tabCompletion: 'on',
            suggest: {
                showKeywords: true,
                showSnippets: true,
                showClasses: true,
                showFunctions: true,
                showVariables: true,
                showModules: true,
                showProperties: true,
                showValues: true,
                showMethods: true,
                showWords: true,
                showColors: true,
                showFiles: true,
                showReferences: true,
                showFolders: true,
                showTypeParameters: true,
                showConstants: true,
                showConstructors: true,
                showFields: true,
                showInterfaces: true,
                showIssues: true,
                showUsers: true,
                showUnits: true,
                snippetsPreventQuickSuggestions: false
            }
        });

        // Try to restore previous state
        const restored = loadEditorState();
        if (restored) {
            showNotification('Previous work restored!');
        }

        // Setup auto-save
        setupAutoSave();

        // Register custom snippets for common shortcuts
        registerCustomSnippets();

        // Add keyboard shortcuts with proper override
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
            if (isTabMode) {
                handleTabModeSave();
            } else {
                saveCode();
            }
        });

        // Add new tab shortcut
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, function () {
            if (isTabMode) {
                addNewTab();
            } else {
                showNotification('Switch to Tab Mode to create new tabs');
            }
        });

        // Add close tab shortcut
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, function () {
            if (isTabMode) {
                closeTab(activeTabIndex);
            } else {
                showNotification('Switch to Tab Mode to close tabs');
            }
        });

        // Trigger suggestions on Ctrl+Space
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, function () {
            editor.trigger('', 'editor.action.triggerSuggest', {});
        });

        window.editor = editor;
        window.isEditing = false;

        // Track changes for save indication
        editor.onDidChangeModelContent(function () {
            if (isTabMode && editorTabs[activeTabIndex]) {
                editorTabs[activeTabIndex].hasChanges = true;
                renderTabs();
            } else if (currentSavedFile && !hasUnsavedChanges) {
                hasUnsavedChanges = true;
                updateSaveButtonText();
            }

            // Block changes if in restricted mode and user doesn't have edit rights
            if (currentEditMode === 'restricted' && currentEditor !== window.currentUser?.uid) {
                return;
            }

            // Update live preview if enabled
            if (isLivePreviewEnabled) {
                updateLivePreview();
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

                const code = editor.getValue();
                const language = document.getElementById('languageSelect').value;
                window.socket.emit('code-change', {
                    roomId: window.currentRoom,
                    code: code,
                    language: language
                });
            }
        });

        // Add cursor tracking for freestyle mode
        editor.onDidChangeCursorPosition(function (e) {
            if (isCollaborating && currentEditMode === 'freestyle' && window.socket && window.socket.connected && window.currentRoom) {
                const position = e.position;
                window.socket.emit('cursor-position', {
                    roomId: window.currentRoom,
                    userId: window.currentUser?.uid,
                    userName: window.currentUser?.displayName,
                    line: position.lineNumber - 1,
                    ch: position.column - 1
                });
            }
        });

        console.log('Monaco Editor created successfully');
    });
}

function setupUI() {
    // Language selector
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.addEventListener('change', function (e) {
            const newLanguage = e.target.value;

            // Skip validation during restoration
            if (window.isRestoring) {
                languageSelect.dataset.previousValue = newLanguage;
                if (editor && monaco) {
                    const language = getMonacoLanguage(newLanguage);
                    monaco.editor.setModelLanguage(editor.getModel(), language);
                }
                return;
            }

            // Tab mode specific logic
            if (isTabMode && editorTabs[activeTabIndex]) {
                editorTabs[activeTabIndex].language = newLanguage;
                editorTabs[activeTabIndex].content = getDefaultCode(newLanguage);
                if (editor && monaco) {
                    const language = getMonacoLanguage(newLanguage);
                    monaco.editor.setModelLanguage(editor.getModel(), language);
                    editor.setValue(getDefaultCode(newLanguage));
                }
                renderTabs();
                return;
            }

            // Force load language-specific boilerplate code
            if (editor && monaco) {
                console.log('Switching to language:', newLanguage);
                const language = getMonacoLanguage(newLanguage);
                monaco.editor.setModelLanguage(editor.getModel(), language);

                const boilerplateCode = getDefaultCode(newLanguage);
                console.log('Boilerplate code for', newLanguage, ':', boilerplateCode.substring(0, 50) + '...');
                editor.setValue(boilerplateCode);

                updateLivePreviewVisibility(newLanguage);
                resetRunButton(); // Update button text for new language
                showNotification(`Switched to ${newLanguage.charAt(0).toUpperCase() + newLanguage.slice(1)} with boilerplate code`);
            }

            currentSavedFile = null;
            hasUnsavedChanges = false;
            updateSaveButtonText();
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

    // Live preview button - ensure it exists first
    setTimeout(() => {
        const livePreviewBtn = document.getElementById('livePreview');
        if (livePreviewBtn) {
            livePreviewBtn.addEventListener('click', toggleLivePreview);
            // Show for HTML by default
            const languageSelect = document.getElementById('languageSelect');
            if (languageSelect && languageSelect.value === 'html') {
                livePreviewBtn.style.display = 'flex';
            }
        }
    }, 200);

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
        // Save current scroll position before closing
        const list = document.getElementById('savedCodesList');
        if (list && list.style.display !== 'none') {
            if (currentFolder) {
                savedScrollPositions.folderList = list.scrollTop;
            } else {
                savedScrollPositions.mainList = list.scrollTop;
            }
        }

        // Save preview scroll position if in preview mode
        const previewContent = document.getElementById('codePreviewContent');
        if (previewContent && previewContent.style.display === 'block') {
            savedScrollPositions.preview = previewContent.scrollTop;
        }

        document.getElementById('savedCodesModal').style.display = 'none';
        resetSavedCodesModal();
        cleanupSavedCodesListeners();
    });

    document.getElementById('backToList').addEventListener('click', () => {
        if (document.getElementById('codePreviewContent').style.display === 'block') {
            // Save preview scroll position before going back
            const previewContent = document.getElementById('codePreviewContent');
            if (previewContent) {
                savedScrollPositions.preview = previewContent.scrollTop;
            }
            // From preview back to folder/main list
            showSavedCodesList();
        } else {
            // From folder back to main list
            currentFolder = null;
            showSavedCodesList();
        }
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
        btn.addEventListener('click', function (e) {
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
        btn.addEventListener('click', function (e) {
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
    setTimeout(() => {
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            updateLivePreviewVisibility(languageSelect.value);
        }
    }, 100);

    // Initialize theme and settings
    setTimeout(() => {
        if (window.currentUser) {
            loadUserPreferences();
        } else {
            const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
            applyTheme(savedTheme);
            document.querySelector(`[data-theme="${savedTheme}"]`)?.classList.add('active');
            loadEditorSettings();
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
    document.getElementById('saveFolderBtn').addEventListener('click', showSaveFolderModal);

    // Tab mode modal handlers
    document.getElementById('continueWithCode').addEventListener('click', enableTabModeWithCurrentCode);
    document.getElementById('startNewFile').addEventListener('click', enableTabModeWithNewFile);
    document.getElementById('cancelTabMode').addEventListener('click', () => {
        document.getElementById('tabModeModal').style.display = 'none';
    });

    // Save folder modal handlers
    document.getElementById('confirmSaveFolder').addEventListener('click', saveFolderWithName);
    document.getElementById('cancelSaveFolder').addEventListener('click', () => {
        document.getElementById('saveFolderModal').style.display = 'none';
        document.getElementById('folderNameInput').value = '';
    });

    document.getElementById('folderNameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveFolderWithName();
        }
    });

    // Collaboration toggle
    setupCollaborationToggle();

    // Update load folder handler
    document.getElementById('loadFolder').addEventListener('click', loadFolderInTabMode);

    // Delete and share handlers
    document.getElementById('deleteFolder').addEventListener('click', deleteSavedFolder);
    document.getElementById('shareFolder').addEventListener('click', shareSavedFolder);
    document.getElementById('shareCode').addEventListener('click', shareSavedCode);

    // Custom popup modal handlers
    document.getElementById('popupConfirm').addEventListener('click', () => {
        document.getElementById('customPopupModal').style.display = 'none';
    });
    document.getElementById('popupCancel').addEventListener('click', () => {
        document.getElementById('customPopupModal').style.display = 'none';
    });

    // Share input modal handlers
    document.getElementById('shareInputCancel').addEventListener('click', () => {
        document.getElementById('shareInputModal').style.display = 'none';
    });

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

    // Make custom popup functions globally accessible
    window.showCustomPopup = showCustomPopup;
    window.showShareInput = showShareInput;



    // Initialize friend system
    setTimeout(() => {
        if (document.getElementById('addFriendBtn')) {
            setupFriendSystem();
        }
    }, 100);

    // Close modals when clicking outside
    document.getElementById('customPopupModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('customPopupModal')) {
            document.getElementById('customPopupModal').style.display = 'none';
        }
    });

    document.getElementById('shareInputModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('shareInputModal')) {
            document.getElementById('shareInputModal').style.display = 'none';
        }
    });
}

function toggleTabMode() {
    const tabModeBtn = document.getElementById('tabModeBtn');

    if (!isTabMode) {
        // Show confirmation popup when enabling tab mode
        document.getElementById('tabModeModal').style.display = 'block';
    } else {
        // Disable tab mode
        isTabMode = false;
        tabModeBtn.innerHTML = '<i class="fas fa-folder-open"></i> Tab Mode';
        tabModeBtn.classList.remove('active');
        document.getElementById('tabBar').style.display = 'none';
        editorTabs = [];
        activeTabIndex = 0;
    }
}

function enableTabModeWithCurrentCode() {
    isTabMode = true;
    const tabModeBtn = document.getElementById('tabModeBtn');

    tabModeBtn.innerHTML = '<i class="fas fa-times"></i> Exit Tab Mode';
    tabModeBtn.classList.add('active');
    document.getElementById('tabBar').style.display = 'flex';

    // Initialize with current code
    const currentLang = document.getElementById('languageSelect').value;
    const currentCode = editor ? editor.getValue() : getDefaultCode(currentLang);
    const fileName = getDefaultFileName(currentLang);

    editorTabs = [];
    addTab(fileName, currentCode, currentLang);
    activeTabIndex = 0;
    renderTabs();

    document.getElementById('tabModeModal').style.display = 'none';
    showNotification('Tab mode enabled with current code!');
}

function enableTabModeWithNewFile() {
    isTabMode = true;
    const tabModeBtn = document.getElementById('tabModeBtn');

    tabModeBtn.innerHTML = '<i class="fas fa-times"></i> Exit Tab Mode';
    tabModeBtn.classList.add('active');
    document.getElementById('tabBar').style.display = 'flex';

    // Initialize with new empty tab (no default language)
    editorTabs = [];
    const newTab = addTab('New Tab', '', 'javascript');
    activeTabIndex = 0;
    renderTabs();

    // Set language selector to placeholder and require user selection
    const langSelect = document.getElementById('languageSelect');

    // Add placeholder option if not exists
    if (!langSelect.querySelector('option[value=""]')) {
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = '-- Select Language --';
        placeholderOption.disabled = true;
        langSelect.insertBefore(placeholderOption, langSelect.firstChild);
    }

    langSelect.value = '';
    langSelect.style.animation = 'languagePulse 0.5s ease-in-out infinite';

    // Clear editor content
    if (editor) {
        editor.setValue('');
    }

    // Listen for language change
    const handleLanguageChange = () => {
        if (langSelect.value === '') return;

        langSelect.style.animation = '';
        const selectedLang = langSelect.value;
        let fileName = getDefaultFileName(selectedLang);

        // Update tab with selected language
        editorTabs[activeTabIndex].name = fileName;
        editorTabs[activeTabIndex].language = selectedLang;
        editorTabs[activeTabIndex].content = getDefaultCode(selectedLang);

        // Remove placeholder option
        const placeholder = langSelect.querySelector('option[value=""]');
        if (placeholder) placeholder.remove();

        renderTabs();
        switchToTab(activeTabIndex);
        updateLivePreviewVisibility(selectedLang);

        langSelect.removeEventListener('change', handleLanguageChange);
    };

    langSelect.addEventListener('change', handleLanguageChange);

    document.getElementById('tabModeModal').style.display = 'none';
    showNotification('Tab mode enabled! Please select a language for your first tab.');
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

function getMonacoTheme(theme) {
    const themeMapping = {
        dark: 'vs-dark',
        light: 'vs',
        blue: 'vs-dark',
        green: 'vs-dark'
    };
    return themeMapping[theme] || 'vs-dark';
}

function registerCustomSnippets() {
    // HTML snippets
    monaco.languages.registerCompletionItemProvider('html', {
        provideCompletionItems: function (model, position) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };

            return {
                suggestions: [
                    {
                        label: '.div',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: '<div>\n\t$0\n</div>',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Create a div element',
                        range: range
                    },
                    {
                        label: '.p',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: '<p>$0</p>',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Create a paragraph element',
                        range: range
                    },
                    {
                        label: '.h1',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: '<h1>$0</h1>',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Create an h1 heading',
                        range: range
                    },
                    {
                        label: '.span',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: '<span>$0</span>',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Create a span element',
                        range: range
                    }
                ]
            };
        }
    });

    // Java snippets
    monaco.languages.registerCompletionItemProvider('java', {
        provideCompletionItems: function (model, position) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };

            return {
                suggestions: [
                    {
                        label: 'psvm',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'public static void main(String[] args) {\n\t$0\n}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Create main method',
                        range: range
                    },
                    {
                        label: 'sout',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'System.out.println($0);',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'System.out.println',
                        range: range
                    },
                    {
                        label: 'fori',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t$0\n}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Create for loop',
                        range: range
                    }
                ]
            };
        }
    });

    // JavaScript snippets
    monaco.languages.registerCompletionItemProvider('javascript', {
        provideCompletionItems: function (model, position) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };

            return {
                suggestions: [
                    {
                        label: 'log',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'console.log($0);',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Console log',
                        range: range
                    },
                    {
                        label: 'func',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'function ${1:name}(${2:params}) {\n\t$0\n}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Function declaration',
                        range: range
                    }
                ]
            };
        }
    });

    // Python snippets
    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: function (model, position) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };

            return {
                suggestions: [
                    {
                        label: 'def',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'def ${1:function_name}(${2:params}):\n\t$0',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Function definition',
                        range: range
                    },
                    {
                        label: 'class',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'class ${1:ClassName}:\n\tdef __init__(self${2:, params}):\n\t\t$0',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Class definition',
                        range: range
                    }
                ]
            };
        }
    });

    // C/C++ snippets
    const cppSnippets = {
        provideCompletionItems: function (model, position) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };

            return {
                suggestions: [
                    {
                        label: 'main',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'int main() {\n\t$0\n\treturn 0;\n}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Main function',
                        range: range
                    },
                    {
                        label: 'printf',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'printf("$1\\n"${2:, args});',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Printf statement',
                        range: range
                    }
                ]
            };
        }
    };

    monaco.languages.registerCompletionItemProvider('c', cppSnippets);
    monaco.languages.registerCompletionItemProvider('cpp', cppSnippets);
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
    // Create empty tab first
    const newTab = addTab('New Tab', '', 'javascript');
    activeTabIndex = editorTabs.length - 1;
    renderTabs();

    // Set language selector to placeholder
    const langSelect = document.getElementById('languageSelect');

    // Add placeholder option if not exists
    if (!langSelect.querySelector('option[value=""]')) {
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = '-- Select Language --';
        placeholderOption.disabled = true;
        langSelect.insertBefore(placeholderOption, langSelect.firstChild);
    }

    langSelect.value = '';
    langSelect.style.animation = 'languagePulse 0.5s ease-in-out infinite';

    // Listen for language change
    const handleLanguageChange = () => {
        if (langSelect.value === '') return;

        langSelect.style.animation = '';
        const selectedLang = langSelect.value;
        let fileName = getDefaultFileName(selectedLang);

        // Check if default name already exists
        const existingNames = editorTabs.map(tab => tab.name).filter((name, index) => index !== activeTabIndex);
        if (existingNames.includes(fileName)) {
            let counter = 2;
            const baseName = fileName.split('.')[0];
            const extension = fileName.split('.')[1];
            while (existingNames.includes(fileName)) {
                fileName = `${baseName}${counter}.${extension}`;
                counter++;
            }
        }

        // Update tab with selected language
        editorTabs[activeTabIndex].name = fileName;
        editorTabs[activeTabIndex].language = selectedLang;
        editorTabs[activeTabIndex].content = getDefaultCode(selectedLang);

        // Remove placeholder option
        const placeholder = langSelect.querySelector('option[value=""]');
        if (placeholder) placeholder.remove();

        renderTabs();
        switchToTab(activeTabIndex);
        updateLivePreviewVisibility(selectedLang);

        langSelect.removeEventListener('change', handleLanguageChange);
    };

    langSelect.addEventListener('change', handleLanguageChange);
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
            <div class="tab-actions">
                <button class="tab-menu" onclick="showTabMenu(${index}, event)" title="Tab options">⋯</button>
                <button class="tab-close" onclick="closeTab(${index})" title="Close tab">×</button>
            </div>
        `;
        tabElement.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close') && !e.target.classList.contains('tab-menu')) {
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

    // Load tab content and update language selector
    if (editor && monaco) {
        // Update language selector first to avoid default JS boilerplate
        const languageSelect = document.getElementById('languageSelect');
        languageSelect.value = tab.language;
        languageSelect.dataset.previousValue = tab.language;

        // Set Monaco editor language
        const language = getMonacoLanguage(tab.language);
        monaco.editor.setModelLanguage(editor.getModel(), language);

        // Load the actual file content
        editor.setValue(tab.content);

        updateLivePreviewVisibility(tab.language);
        resetRunButton(); // Update button text for tab language

        // Update live preview if enabled
        if (isLivePreviewEnabled) {
            updateLivePreview();
        }
    }

    renderTabs();
    saveEditorState(); // Save state after tab switch
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

function handleTabModeSave() {
    if (!window.currentUser) {
        showNotification('Please login first to save!');
        return;
    }

    if (currentSavedFolder) {
        // Update existing folder
        updateSavedFolder();
    } else {
        // Save as new folder
        showSaveFolderModal();
    }
}

let currentSavedFolder = null;

function updateSavedFolder() {
    // Save current tab content
    if (editorTabs[activeTabIndex] && editor) {
        editorTabs[activeTabIndex].content = editor.getValue();
    }

    const folderData = {
        name: currentSavedFolder.name,
        files: editorTabs.map(tab => ({
            name: tab.name,
            content: tab.content,
            language: tab.language
        })),
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        lastModified: new Date().toISOString()
    };

    database.ref(`users/${window.currentUser.uid}/savedFolders/${currentSavedFolder.key}`).set(folderData).then(() => {
        // Reset hasChanges for all tabs
        editorTabs.forEach(tab => tab.hasChanges = false);
        renderTabs();
        updateSaveButtonText(); // Update save button to show folder saved
        showNotification(`Updated folder "${currentSavedFolder.name}"!`);
    }).catch((error) => {
        showNotification('Error updating folder: ' + error.message);
    });
}

function showTabMenu(tabIndex, event) {
    event.stopPropagation();

    // Remove existing menu
    const existingMenu = document.getElementById('tabContextMenu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'tabContextMenu';
    menu.className = 'tab-context-menu';
    menu.innerHTML = `
        <div class="menu-item" onclick="renameTab(${tabIndex})">
            <i class="fas fa-edit"></i> Rename
        </div>
    `;

    document.body.appendChild(menu);

    // Position menu
    const rect = event.target.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    menu.style.zIndex = '1000';

    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 10);
}

function renameTab(tabIndex) {
    const tab = editorTabs[tabIndex];
    if (!tab) return;

    const newName = prompt('Enter new file name:', tab.name);
    if (newName && newName.trim() && newName !== tab.name) {
        // Check if name already exists
        const existingNames = editorTabs.map((t, i) => i !== tabIndex ? t.name : null).filter(Boolean);
        if (existingNames.includes(newName.trim())) {
            showNotification('File name already exists!');
            return;
        }

        tab.name = newName.trim();
        tab.hasChanges = true;
        renderTabs();
        showNotification(`Renamed to "${newName.trim()}"`);
    }
}

window.showTabMenu = showTabMenu;
window.renameTab = renameTab;

let currentFolder = null;

function openFolderFiles(folderKey, folderData) {
    // Save current scroll position before switching to folder view
    const list = document.getElementById('savedCodesList');
    if (list && list.style.display !== 'none') {
        savedScrollPositions.mainList = list.scrollTop;
    }

    currentFolder = { key: folderKey, ...folderData };

    document.getElementById('savedCodesTitle').textContent = `${folderData.name} Files`;
    document.getElementById('backToList').style.display = 'inline-block';

    list.innerHTML = '';

    folderData.files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'saved-code-item';
        fileItem.innerHTML = `
            <div class="saved-code-info">
                <div class="saved-code-name">${file.name}</div>
                <div class="saved-code-meta">${file.language} • ${file.content.split('\n').length} lines</div>
            </div>
            <div class="saved-code-language">${file.language}</div>
        `;

        fileItem.addEventListener('click', () => {
            showCodePreview(file, `folder_${folderKey}_${index}`, true);
        });

        list.appendChild(fileItem);
    });

    // Reset folder scroll position to top when first opening
    savedScrollPositions.folderList = 0;
    list.scrollTop = 0;

    document.getElementById('loadFolder').style.display = 'inline-block';
    document.getElementById('shareFolder').style.display = 'inline-block';
    document.getElementById('deleteFolder').style.display = 'inline-block';
}

function loadFolderInTabMode() {
    if (!currentFolder) return;

    // Enable tab mode directly without popup since folder has language info
    if (!isTabMode) {
        isTabMode = true;
        const tabModeBtn = document.getElementById('tabModeBtn');
        tabModeBtn.innerHTML = '<i class="fas fa-times"></i> Exit Tab Mode';
        tabModeBtn.classList.add('active');
        document.getElementById('tabBar').style.display = 'flex';
    }

    // Clear existing tabs
    editorTabs = [];
    activeTabIndex = 0;

    // Load all files as tabs
    currentFolder.files.forEach((file, index) => {
        addTab(file.name, file.content, file.language);
    });

    // Track the loaded folder as current saved folder
    currentSavedFolder = {
        key: currentFolder.key,
        name: currentFolder.name
    };

    // Load first tab properly with correct language and content
    if (editorTabs.length > 0 && editor && monaco) {
        const firstTab = editorTabs[0];

        // Set language selector to first file's language
        const languageSelect = document.getElementById('languageSelect');
        languageSelect.value = firstTab.language;
        languageSelect.dataset.previousValue = firstTab.language;

        // Set Monaco editor language
        const language = getMonacoLanguage(firstTab.language);
        monaco.editor.setModelLanguage(editor.getModel(), language);

        // Load the actual file content
        editor.setValue(firstTab.content);

        updateLivePreviewVisibility(firstTab.language);

        activeTabIndex = 0;
    }

    renderTabs();
    document.getElementById('savedCodesModal').style.display = 'none';
    resetSavedCodesModal();
    cleanupSavedCodesListeners();
    showNotification(`Loaded ${currentFolder.files.length} files in tab mode!`);
}

function deleteSavedFolder() {
    if (!currentFolder) return;

    showCustomPopup(
        'Delete Folder',
        `Delete folder "${currentFolder.name}"?`,
        () => {
            database.ref(`users/${window.currentUser.uid}/savedFolders/${currentFolder.key}`).remove().then(() => {
                showNotification(`Folder "${currentFolder.name}" deleted!`);
                currentFolder = null;
                // Go back to main list after deletion
                showSavedCodesList();
            });
        },
        true
    );
}

function shareSavedFolder() {
    if (!currentFolder) return;

    showShareInput(
        'Share Folder',
        'Enter username to share folder:',
        (recipient) => {
            const shareData = {
                from: window.currentUser.username,
                fromUid: window.currentUser.uid,
                folderName: currentFolder.name,
                files: currentFolder.files,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                read: false
            };

            database.ref(`usernameToUid/${recipient}`).once('value', (snapshot) => {
                const recipientUid = snapshot.val();
                if (recipientUid) {
                    database.ref(`sharedCodes/${recipientUid}`).push(shareData).then(() => {
                        showNotification(`Folder shared with @${recipient}!`);
                    });
                } else {
                    showNotification('Username not found!');
                }
            });
        }
    );
}

function shareSavedCode(codeData) {
    showShareInput(
        'Share Code',
        'Enter username to share code:',
        (recipient) => {
            const shareData = {
                from: window.currentUser.username,
                fromUid: window.currentUser.uid,
                code: codeData.content,
                language: codeData.language,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                read: false
            };

            database.ref(`usernameToUid/${recipient}`).once('value', (snapshot) => {
                const recipientUid = snapshot.val();
                if (recipientUid) {
                    database.ref(`sharedCodes/${recipientUid}`).push(shareData).then(() => {
                        showNotification(`Code shared with @${recipient}!`);
                    });
                } else {
                    showNotification('Username not found!');
                }
            });
        }
    );
}

function deleteFileFromFolder(fileKey, fileName) {
    if (!currentFolder) return;

    showCustomPopup(
        'Delete File',
        `Delete "${fileName}" from folder?`,
        () => {
            const fileIndex = parseInt(fileKey.split('_')[2]);
            currentFolder.files.splice(fileIndex, 1);

            database.ref(`users/${window.currentUser.uid}/savedFolders/${currentFolder.key}`).set({
                name: currentFolder.name,
                files: currentFolder.files,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                lastModified: new Date().toISOString()
            }).then(() => {
                showNotification(`File "${fileName}" deleted from folder!`);
                // Go back to folder list view after deletion
                showSavedCodesList();
            });
        },
        true
    );
}

function showSaveFolderModal() {
    if (!window.currentUser) {
        showNotification('Please login first to save folder!');
        return;
    }

    if (!isTabMode || editorTabs.length === 0) {
        showNotification('No tabs to save!');
        return;
    }

    document.getElementById('saveFolderModal').style.display = 'block';
    document.getElementById('folderNameInput').focus();
}

function saveFolderWithName() {
    const folderName = document.getElementById('folderNameInput').value.trim();

    if (!folderName) {
        showNotification('Please enter a folder name!');
        return;
    }

    if (!window.currentUser) {
        showNotification('Please login first!');
        return;
    }

    const folderData = {
        name: folderName,
        files: editorTabs.map(tab => ({
            name: tab.name,
            content: tab.content,
            language: tab.language
        })),
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        lastModified: new Date().toISOString()
    };

    const folderRef = database.ref(`users/${window.currentUser.uid}/savedFolders`).push();
    folderRef.set(folderData).then(() => {
        // Track the saved folder
        currentSavedFolder = {
            key: folderRef.key,
            name: folderName
        };

        // Reset hasChanges for all tabs
        editorTabs.forEach(tab => tab.hasChanges = false);
        renderTabs();
        updateSaveButtonText(); // Update save button to show folder saved

        document.getElementById('saveFolderModal').style.display = 'none';
        document.getElementById('folderNameInput').value = '';
        showNotification(`Folder "${folderName}" saved with ${editorTabs.length} files!`);
    }).catch((error) => {
        showNotification('Error saving folder: ' + error.message);
    });
}

function setupThemeAndSettings() {
    const blurOverlay = document.getElementById('dropdownBlurOverlay');
    const dropdowns = {
        notifications: { btn: document.getElementById('notificationsBtn'), menu: document.getElementById('notificationsMenu') },
        friends: { btn: document.getElementById('friendsBtn'), menu: document.getElementById('friendsMenu') },
        theme: { btn: document.getElementById('themeToggle'), menu: document.getElementById('themeMenu') },
        layout: { btn: document.getElementById('layoutBtn'), menu: document.getElementById('layoutMenu') },
        settings: { btn: document.getElementById('settingsBtn'), menu: document.getElementById('settingsMenu') },
        profile: { btn: document.getElementById('profileBtn'), menu: document.getElementById('profileMenu') }
    };

    function closeAllDropdowns() {
        Object.values(dropdowns).forEach(dropdown => {
            if (dropdown.menu) {
                dropdown.menu.classList.remove('show');
                dropdown.menu.parentElement.classList.remove('show');
            }
        });
        if (blurOverlay) blurOverlay.classList.remove('show');
    }

    function openDropdown(menu) {
        closeAllDropdowns();
        menu.classList.add('show');
        menu.parentElement.classList.add('show');
        if (blurOverlay) blurOverlay.classList.add('show');
    }

    // Notifications dropdown
    if (dropdowns.notifications.btn && dropdowns.notifications.menu) {
        dropdowns.notifications.btn.addEventListener('click', function (e) {
            e.stopPropagation();
            openDropdown(dropdowns.notifications.menu);
        });
    }

    // Friends dropdown
    if (dropdowns.friends.btn && dropdowns.friends.menu) {
        dropdowns.friends.btn.addEventListener('click', function (e) {
            e.stopPropagation();
            openDropdown(dropdowns.friends.menu);
            loadFriendsList();
        });
    }

    // Theme dropdown
    if (dropdowns.theme.btn && dropdowns.theme.menu) {
        dropdowns.theme.btn.addEventListener('click', function (e) {
            e.stopPropagation();
            openDropdown(dropdowns.theme.menu);
        });

        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', function () {
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
        dropdowns.layout.btn.addEventListener('click', function (e) {
            e.stopPropagation();
            openDropdown(dropdowns.layout.menu);
        });
    }

    // Settings dropdown
    if (dropdowns.settings.btn && dropdowns.settings.menu) {
        dropdowns.settings.btn.addEventListener('click', function (e) {
            e.stopPropagation();
            openDropdown(dropdowns.settings.menu);
        });

        // Prevent settings menu from closing when clicking inside it
        dropdowns.settings.menu.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        setupSettingsHandlers();
    }

    // Profile dropdown
    if (dropdowns.profile.btn && dropdowns.profile.menu) {
        dropdowns.profile.btn.addEventListener('click', function (e) {
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
    const lineWrapToggle = document.getElementById('lineWrapToggle');
    const autoCompleteToggle = document.getElementById('autoCompleteToggle');
    const lineNumbersToggle = document.getElementById('lineNumbersToggle');
    const minimapToggle = document.getElementById('minimapToggle');

    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', function () {
            const fontSize = parseInt(this.value);
            if (editor) {
                editor.updateOptions({ fontSize });
            }
            saveEditorSetting('fontSize', fontSize);
            showNotification(`Font size changed to ${fontSize}px`);
        });
    }

    if (lineWrapToggle) {
        lineWrapToggle.addEventListener('change', function () {
            if (editor) {
                editor.updateOptions({ wordWrap: this.checked ? 'on' : 'off' });
            }
            saveEditorSetting('lineWrap', this.checked);
            showNotification(`Line wrapping ${this.checked ? 'enabled' : 'disabled'}`);
        });
    }

    if (autoCompleteToggle) {
        autoCompleteToggle.addEventListener('change', function () {
            if (editor) {
                editor.updateOptions({
                    quickSuggestions: this.checked,
                    suggestOnTriggerCharacters: this.checked
                });
            }
            saveEditorSetting('autoComplete', this.checked);
            showNotification(`Auto complete ${this.checked ? 'enabled' : 'disabled'}`);
        });
    }

    if (lineNumbersToggle) {
        lineNumbersToggle.addEventListener('change', function () {
            if (editor) {
                editor.updateOptions({
                    lineNumbers: this.checked ? 'on' : 'off'
                });
            }
            saveEditorSetting('lineNumbers', this.checked);
            showNotification(`Line numbers ${this.checked ? 'enabled' : 'disabled'}`);
        });
    }

    if (minimapToggle) {
        minimapToggle.addEventListener('change', function () {
            if (editor && monaco) {
                editor.updateOptions({
                    minimap: { enabled: this.checked }
                });
                saveEditorSetting('minimap', this.checked);
                showNotification(`Minimap ${this.checked ? 'enabled' : 'disabled'}`);
            } else {
                showNotification('Editor not available');
                this.checked = false;
            }
        });
    }
}

function saveEditorSetting(key, value) {
    if (window.currentUser && typeof database !== 'undefined') {
        database.ref(`users/${window.currentUser.uid}/preferences/editor/${key}`).set(value);
    } else {
        localStorage.setItem(`editor_${key}`, JSON.stringify(value));
    }
}

function loadEditorSettings() {
    if (window.currentUser && typeof database !== 'undefined') {
        database.ref(`users/${window.currentUser.uid}/preferences/editor`).once('value', (snapshot) => {
            const settings = snapshot.val() || {};
            // Ensure editor is ready before applying settings
            if (editor) {
                applyEditorSettings(settings);
            } else {
                // Wait for editor to be ready
                setTimeout(() => {
                    if (editor) {
                        applyEditorSettings(settings);
                    }
                }, 500);
            }
        }).catch(e => {
            console.log('Error loading editor settings:', e);
            applyEditorSettings({});
        });
    } else {
        const settings = {
            fontSize: JSON.parse(localStorage.getItem('editor_fontSize') || '14'),
            lineWrap: JSON.parse(localStorage.getItem('editor_lineWrap') || 'true'),
            autoComplete: JSON.parse(localStorage.getItem('editor_autoComplete') || 'true'),
            lineNumbers: JSON.parse(localStorage.getItem('editor_lineNumbers') || 'true'),
            minimap: JSON.parse(localStorage.getItem('editor_minimap') || 'false')
        };
        // Ensure editor is ready before applying settings
        if (editor) {
            applyEditorSettings(settings);
        } else {
            // Wait for editor to be ready
            setTimeout(() => {
                if (editor) {
                    applyEditorSettings(settings);
                }
            }, 500);
        }
    }
}

function applyEditorSettings(settings) {
    const defaults = {
        fontSize: 14,
        lineWrap: true,
        autoComplete: true,
        lineNumbers: true,
        minimap: false
    };

    const finalSettings = { ...defaults, ...settings };

    // Apply to UI controls
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const lineWrapToggle = document.getElementById('lineWrapToggle');
    const autoCompleteToggle = document.getElementById('autoCompleteToggle');
    const lineNumbersToggle = document.getElementById('lineNumbersToggle');
    const minimapToggle = document.getElementById('minimapToggle');

    if (fontSizeSelect) fontSizeSelect.value = finalSettings.fontSize;
    if (lineWrapToggle) lineWrapToggle.checked = finalSettings.lineWrap;
    if (autoCompleteToggle) autoCompleteToggle.checked = finalSettings.autoComplete;
    if (lineNumbersToggle) lineNumbersToggle.checked = finalSettings.lineNumbers;
    if (minimapToggle) minimapToggle.checked = finalSettings.minimap;

    // Apply to editor
    if (editor) {
        editor.updateOptions({
            fontSize: finalSettings.fontSize,
            tabSize: 2,
            insertSpaces: true,
            wordWrap: finalSettings.lineWrap ? 'on' : 'off',
            lineNumbers: finalSettings.lineNumbers ? 'on' : 'off',
            minimap: { enabled: finalSettings.minimap },
            quickSuggestions: finalSettings.autoComplete,
            suggestOnTriggerCharacters: finalSettings.autoComplete
        });
    }
    editorSettingsApplied = true;
}

function setupLayoutControls() {
    // Layout dropdown is now handled in setupThemeAndSettings
    document.querySelectorAll('.layout-option').forEach(option => {
        option.addEventListener('click', function () {
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
            panel.style.overflowY = 'auto';
            panel.style.maxHeight = '100%';
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
            panel.style.maxHeight = '100%';
        });
    }

    if (editor) {
        setTimeout(() => editor.layout(), 100);
    }
}

function setupResizer() {
    const resizer = document.getElementById('resizer');
    const editorContainer = document.querySelector('.editor-container');
    const outputSection = document.querySelector('.output-section');

    if (!resizer || !editorContainer || !outputSection) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', function (e) {
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

    document.addEventListener('mousemove', function (e) {
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

        if (editor) {
            setTimeout(() => editor.layout(), 0);
        }
    });

    document.addEventListener('mouseup', function () {
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
        const language = document.getElementById('languageSelect').value;
        const buttonText = (language === 'css' || language === 'html') ? 'Run' : 'Run (F5)';
        runBtn.innerHTML = `<i class="fas fa-play"></i> ${buttonText}`;
        runBtn.disabled = false;
    }
}

function hasConnectedFiles() {
    if (!isTabMode) return false;

    const htmlTab = editorTabs.find(tab => tab.language === 'html');
    if (!htmlTab) return false;

    const currentTab = editorTabs[activeTabIndex];
    if (!currentTab) return false;

    // Only consider current tab connected if HTML references it by exact filename
    if (currentTab.language === 'css') {
        return htmlTab.content.includes(`href="${currentTab.name}"`) || htmlTab.content.includes(`href='${currentTab.name}'`);
    } else if (currentTab.language === 'javascript') {
        return htmlTab.content.includes(`src="${currentTab.name}"`) || htmlTab.content.includes(`src='${currentTab.name}'`);
    }

    return false;
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

        // For JavaScript, run locally immediately for speed
        if (language === 'javascript') {
            resetRunButton();
            runCodeLocally(code, language);
            return;
        }

        // Fallback after 15 seconds if no server response (longer for server-hosted sites)
        setTimeout(() => {
            if (window.executionId === currentExecutionId) {
                console.log('No server response, running locally');
                resetRunButton();
                runCodeLocally(code, language);
            }
        }, 15000);

        // Show HTML preview immediately for better UX and reset button
        if (language === 'html') {
            resetRunButton();
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

// Global variables for Firebase listeners
let savedCodesListener = null;
let savedFoldersListener = null;

// Scroll position preservation
let savedScrollPositions = {
    mainList: 0,
    folderList: 0,
    preview: 0
};

function showSavedCodes() {
    if (!window.currentUser) {
        showNotification('Please login to view saved codes!');
        return;
    }

    const modal = document.getElementById('savedCodesModal');
    const list = document.getElementById('savedCodesList');

    list.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading...</div>';
    modal.style.display = 'block';

    // Remove existing listeners to prevent duplicates
    if (savedCodesListener) {
        database.ref(`users/${window.currentUser.uid}/savedCodes`).off('value', savedCodesListener);
    }
    if (savedFoldersListener) {
        database.ref(`users/${window.currentUser.uid}/savedFolders`).off('value', savedFoldersListener);
    }

    let codesData = null;
    let foldersData = null;
    let updateTimeout = null;

    function updateList() {
        // Debounce rapid updates
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }

        updateTimeout = setTimeout(() => {
            performUpdate();
        }, 100);
    }

    function performUpdate() {
        list.innerHTML = '';

        let hasContent = false;

        // Add folders first
        if (foldersData && typeof foldersData === 'object' && foldersData !== null && Object.keys(foldersData).length > 0) {
            hasContent = true;
            Object.entries(foldersData).forEach(([key, folderData]) => {
                const item = document.createElement('div');
                item.className = 'saved-code-item folder-item';
                item.innerHTML = `
                    <div class="saved-code-info">
                        <div class="saved-code-name"><i class="fas fa-folder"></i> ${folderData.name}</div>
                        <div class="saved-code-meta">
                            ${new Date(folderData.lastModified).toLocaleDateString()} • 
                            ${folderData.files ? folderData.files.length : 0} files
                        </div>
                    </div>
                    <div class="saved-code-language">Folder</div>
                `;

                item.addEventListener('click', () => openFolderFiles(key, folderData));
                list.appendChild(item);
            });
        }

        // Add individual codes
        if (codesData && typeof codesData === 'object' && codesData !== null && Object.keys(codesData).length > 0) {
            hasContent = true;
            Object.entries(codesData).forEach(([key, codeData]) => {
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

                item.addEventListener('click', () => showCodePreview(codeData, key));

                list.appendChild(item);
            });
        }

        // Show no content message only if both are empty or null
        if (!hasContent) {
            list.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No saved codes or folders found</div>';
        }

        // Restore scroll position after content update
        setTimeout(() => {
            if (list && !currentFolder) {
                list.scrollTop = savedScrollPositions.mainList;
            }
        }, 50);
    }

    // Set up real-time listeners with proper error handling
    savedCodesListener = (snapshot) => {
        codesData = snapshot.val();
        console.log('Codes data updated:', codesData);
        updateList();
    };

    savedFoldersListener = (snapshot) => {
        foldersData = snapshot.val();
        console.log('Folders data updated:', foldersData);
        updateList();
    };

    database.ref(`users/${window.currentUser.uid}/savedCodes`).on('value', savedCodesListener, (error) => {
        console.error('Error loading saved codes:', error);
        codesData = null;
        updateList();
    });

    database.ref(`users/${window.currentUser.uid}/savedFolders`).on('value', savedFoldersListener, (error) => {
        console.error('Error loading saved folders:', error);
        foldersData = null;
        updateList();
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

function showCodePreview(codeData, key, isFromFolder = false) {
    // Save current scroll position before switching views
    const list = document.getElementById('savedCodesList');
    if (list && list.style.display !== 'none') {
        if (currentFolder) {
            savedScrollPositions.folderList = list.scrollTop;
        } else {
            savedScrollPositions.mainList = list.scrollTop;
        }
    }

    document.getElementById('savedCodesTitle').textContent = codeData.name;
    document.getElementById('backToList').style.display = 'inline-block';

    document.getElementById('savedCodesList').style.display = 'none';
    document.getElementById('codePreviewContent').style.display = 'block';
    document.getElementById('codePreviewContent').textContent = codeData.content;

    // Restore preview scroll position
    setTimeout(() => {
        const previewContent = document.getElementById('codePreviewContent');
        if (previewContent) {
            previewContent.scrollTop = savedScrollPositions.preview;
        }
    }, 100);

    document.getElementById('loadCode').style.display = 'inline-block';
    document.getElementById('loadCode').onclick = () => {
        loadSavedCode(codeData, key);
    };

    if (!isFromFolder) {
        document.getElementById('shareCode').style.display = 'inline-block';
        document.getElementById('deleteCode').style.display = 'inline-block';
        document.getElementById('shareCode').onclick = () => shareSavedCode(codeData);
        document.getElementById('deleteCode').onclick = () => deleteSavedCode(key, codeData.name);
    } else {
        document.getElementById('shareCode').style.display = 'inline-block';
        document.getElementById('deleteCode').style.display = 'inline-block';
        document.getElementById('shareCode').onclick = () => shareSavedCode(codeData);
        document.getElementById('deleteCode').onclick = () => deleteFileFromFolder(key, codeData.name);
    }

    document.getElementById('loadFolder').style.display = 'none';
    document.getElementById('deleteFolder').style.display = 'none';
    document.getElementById('shareFolder').style.display = 'none';
}

function showSavedCodesList() {
    if (currentFolder) {
        // Show folder files
        document.getElementById('savedCodesTitle').textContent = `${currentFolder.name} Files`;
        document.getElementById('backToList').style.display = 'inline-block';
        document.getElementById('loadFolder').style.display = 'inline-block';
        document.getElementById('shareFolder').style.display = 'inline-block';
        document.getElementById('deleteFolder').style.display = 'inline-block';
    } else {
        // Show main list
        document.getElementById('savedCodesTitle').textContent = 'Saved Codes';
        document.getElementById('backToList').style.display = 'none';
        document.getElementById('loadFolder').style.display = 'none';
        document.getElementById('shareFolder').style.display = 'none';
        document.getElementById('deleteFolder').style.display = 'none';
        showSavedCodes();
    }

    document.getElementById('savedCodesList').style.display = 'block';
    document.getElementById('codePreviewContent').style.display = 'none';
    document.getElementById('loadCode').style.display = 'none';
    document.getElementById('shareCode').style.display = 'none';
    document.getElementById('deleteCode').style.display = 'none';

    // Restore scroll position
    setTimeout(() => {
        const list = document.getElementById('savedCodesList');
        if (list) {
            const scrollPos = currentFolder ? savedScrollPositions.folderList : savedScrollPositions.mainList;
            list.scrollTop = scrollPos;
        }
    }, 100);
}

function resetSavedCodesModal() {
    currentFolder = null;
    document.getElementById('savedCodesTitle').textContent = 'Saved Codes';
    document.getElementById('backToList').style.display = 'none';
    document.getElementById('savedCodesList').style.display = 'block';
    document.getElementById('codePreviewContent').style.display = 'none';
    document.getElementById('loadCode').style.display = 'none';
    document.getElementById('shareCode').style.display = 'none';
    document.getElementById('deleteCode').style.display = 'none';
    document.getElementById('loadFolder').style.display = 'none';
    document.getElementById('shareFolder').style.display = 'none';
    document.getElementById('deleteFolder').style.display = 'none';

    // Reset scroll positions when modal is closed
    savedScrollPositions = {
        mainList: 0,
        folderList: 0,
        preview: 0
    };
}

function cleanupSavedCodesListeners() {
    if (savedCodesListener && window.currentUser) {
        database.ref(`users/${window.currentUser.uid}/savedCodes`).off('value', savedCodesListener);
        savedCodesListener = null;
    }
    if (savedFoldersListener && window.currentUser) {
        database.ref(`users/${window.currentUser.uid}/savedFolders`).off('value', savedFoldersListener);
        savedFoldersListener = null;
    }
}

function loadSavedCode(codeData, fileKey) {
    if (editor && monaco) {
        const languageSelect = document.getElementById('languageSelect');

        // Set language and content
        languageSelect.value = codeData.language;
        languageSelect.dataset.previousValue = codeData.language;

        const language = getMonacoLanguage(codeData.language);
        monaco.editor.setModelLanguage(editor.getModel(), language);
        editor.setValue(codeData.content);
        updateLivePreviewVisibility(codeData.language);
    }

    // Track the loaded file
    currentSavedFile = {
        key: fileKey,
        name: codeData.name
    };
    hasUnsavedChanges = false;
    updateSaveButtonText();

    // Close modal and reset
    document.getElementById('savedCodesModal').style.display = 'none';
    resetSavedCodesModal();
    cleanupSavedCodesListeners();
    showNotification(`Loaded "${codeData.name}"`);
}

function updateSaveButtonText() {
    const saveText = document.getElementById('saveText');
    if (!saveText) return;

    if (isTabMode && currentSavedFolder) {
        // In tab mode, show folder name
        const hasAnyChanges = editorTabs.some(tab => tab.hasChanges);
        if (hasAnyChanges) {
            saveText.textContent = `Save "${currentSavedFolder.name}"*`;
        } else {
            saveText.textContent = `"${currentSavedFolder.name}" Saved`;
        }
    } else if (currentSavedFile) {
        // In normal mode, show file name
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
            // Go back to list view after deletion
            showSavedCodesList();
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
        editor.updateOptions({ readOnly: false });
        if (currentEditorSpan) currentEditorSpan.textContent = 'Freestyle Mode - All can edit';
    } else if (currentEditMode === 'restricted') {
        if (currentEditor && currentEditor === window.currentUser?.uid) {
            editor.updateOptions({ readOnly: false });
            if (currentEditorSpan) currentEditorSpan.textContent = 'You are editing';
        } else {
            editor.updateOptions({ readOnly: true });
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
window.testRequestButton = function () {
    const currentEditorSpan = document.getElementById('currentEditor');
    if (currentEditorSpan) {
        currentEditorSpan.innerHTML = `<button onclick="requestEdit()" class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Request Edit</button>`;
        console.log('Test button added successfully');
    } else {
        console.log('currentEditor element not found');
    }
};

// Debug function to check connection status
window.checkConnection = function () {
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
window.forceReconnect = function () {
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

function displayConsoleOutput(message, type = 'log') {
    console.log('displayConsoleOutput called with:', message, type);
    const consolePanel = document.getElementById('console');
    if (!consolePanel) {
        console.log('Console panel not found!');
        return;
    }

    const timestamp = new Date().toLocaleTimeString();
    let color = '#ffffff'; // default white
    let icon = '';

    switch (type) {
        case 'error':
            color = '#f44336';
            icon = '❌ ';
            break;
        case 'warn':
            color = '#ff9800';
            icon = '⚠️ ';
            break;
        case 'info':
            color = '#2196f3';
            icon = 'ℹ️ ';
            break;
        case 'success':
            color = '#4caf50';
            icon = '✅ ';
            break;
        default:
            color = '#ffffff';
            icon = '📝 ';
    }

    const outputDiv = document.createElement('div');
    outputDiv.style.cssText = `color: ${color}; margin: 2px 0; font-family: 'Consolas', monospace; font-size: 13px; line-height: 1.4; padding: 2px 0;`;
    outputDiv.innerHTML = `[${timestamp}] ${icon}${message}`;

    consolePanel.appendChild(outputDiv);
    consolePanel.scrollTop = consolePanel.scrollHeight;

    // Switch to console tab to show the output
    switchTab('console');
    console.log('Console output added and tab switched');
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

window.approveEditRequest = function (userId, userName) {
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

window.rejectEditRequest = function (userId) {
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

    input.addEventListener('keypress', function (e) {
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
        let processedHtml = html;

        // In tab mode, resolve file references
        if (isTabMode) {
            processedHtml = resolveFileReferences(html);
        }

        preview.innerHTML = `<iframe srcdoc="${processedHtml.replace(/"/g, '&quot;')}" style="width:100%;height:100%;border:none;"></iframe>`;
        switchTab('preview');
    }
}

function resolveFileReferences(htmlContent) {
    let processedHtml = htmlContent;

    // Clear console before processing JavaScript files
    const consolePanel = document.getElementById('console');
    if (consolePanel) {
        consolePanel.innerHTML = '';
    }

    editorTabs.forEach(tab => {
        if (tab.language === 'css') {
            processedHtml = processedHtml.replace(
                new RegExp(`<link[^>]*href=["']${tab.name}["'][^>]*>`, 'gi'),
                `<style>${tab.content}</style>`
            );
        } else if (tab.language === 'javascript') {
            // Create custom console for JavaScript execution in HTML context
            const customConsole = {
                log: (...args) => {
                    const message = args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                    ).join(' ');
                    displayConsoleOutput(message, 'log');
                },
                error: (...args) => {
                    const message = args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                    ).join(' ');
                    displayConsoleOutput(message, 'error');
                },
                warn: (...args) => {
                    const message = args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                    ).join(' ');
                    displayConsoleOutput(message, 'warn');
                },
                info: (...args) => {
                    const message = args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                    ).join(' ');
                    displayConsoleOutput(message, 'info');
                }
            };

            // Execute JavaScript with custom console and inject the result
            let jsWithConsole = '';
            try {
                const func = new Function('console', tab.content);
                func(customConsole);
                jsWithConsole = tab.content;
            } catch (error) {
                displayConsoleOutput(error.message, 'error');
                jsWithConsole = tab.content;
            }

            processedHtml = processedHtml.replace(
                new RegExp(`<script[^>]*src=["']${tab.name}["'][^>]*></script>`, 'gi'),
                `<script>${jsWithConsole}</script>`
            );
        }
    });

    return processedHtml;
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
                // Clear console before execution
                const consolePanel = document.getElementById('console');
                if (consolePanel) {
                    consolePanel.innerHTML = '';
                }

                // Create a safe execution context with custom console
                const customConsole = {
                    log: (...args) => {
                        const message = args.map(arg =>
                            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                        ).join(' ');
                        displayConsoleOutput(message, 'log');
                    },
                    error: (...args) => {
                        const message = args.map(arg =>
                            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                        ).join(' ');
                        displayConsoleOutput(message, 'error');
                    },
                    warn: (...args) => {
                        const message = args.map(arg =>
                            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                        ).join(' ');
                        displayConsoleOutput(message, 'warn');
                    },
                    info: (...args) => {
                        const message = args.map(arg =>
                            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                        ).join(' ');
                        displayConsoleOutput(message, 'info');
                    }
                };

                try {
                    // Execute code with custom console in scope - immediate execution
                    const func = new Function('console', code);
                    func(customConsole);

                    // If no output was generated, show success message
                    if (consolePanel && consolePanel.children.length === 0) {
                        displayConsoleOutput('Code executed successfully', 'success');
                    }
                } catch (error) {
                    displayConsoleOutput(error.message, 'error');
                }
                break;

            case 'html':
                showPreview(code);
                break;

            case 'css':
                if (isLivePreviewEnabled && hasConnectedFiles()) {
                    // Update HTML preview if connected
                    const htmlTab = editorTabs.find(tab => tab.language === 'html');
                    if (htmlTab) showPreview(htmlTab.content);
                } else {
                    displayOutput('CSS code ready (combine with HTML for preview)');
                }
                break;

            case 'python':
                displayOutputInTerminal('Python requires server connection with Python interpreter installed.', '', getLocalComplexity(code, language));
                break;
            case 'java':
                if (window.socket && window.socket.connected) {
                    displayOutputInTerminal('', 'Java execution failed on server.', getLocalComplexity(code, language));
                } else {
                    displayOutputInTerminal('', 'Java requires server connection with Java compiler installed.', getLocalComplexity(code, language));
                }
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

    if (language === 'html' || (hasConnectedFiles() && (language === 'css' || language === 'javascript'))) {
        if (btn) btn.style.display = 'flex';
        if (isLivePreviewEnabled) {
            if (runBtn) runBtn.disabled = true;
            updateLivePreview();
        }
    } else {
        if (btn) btn.style.display = 'none';
        if (runBtn) runBtn.disabled = false;
        if (isLivePreviewEnabled && !hasConnectedFiles()) {
            if (btn) btn.classList.remove('active');
            isLivePreviewEnabled = false;
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
            livePreviewDisposable = editor.onDidChangeModelContent(updateLivePreview);
        }
        updateLivePreview();
    } else {
        btn.classList.remove('active');
        runBtn.disabled = false;
        showNotification('Live Preview disabled');

        if (livePreviewDisposable) {
            livePreviewDisposable.dispose();
            livePreviewDisposable = null;
        }
    }
}

let livePreviewDisposable = null;

function updateLivePreview() {
    if (!isLivePreviewEnabled) return;

    // Save current tab content first in tab mode
    if (isTabMode && editorTabs[activeTabIndex] && editor) {
        editorTabs[activeTabIndex].content = editor.getValue();
    }

    const language = document.getElementById('languageSelect').value;
    const htmlTab = editorTabs.find(tab => tab.language === 'html');

    if (language === 'html' || (hasConnectedFiles() && htmlTab && (language === 'css' || language === 'javascript'))) {
        // Always use HTML tab content, even when editing CSS/JS
        const htmlCode = htmlTab ? htmlTab.content : (editor ? editor.getValue() : '');
        showPreview(htmlCode);
        switchTab('preview');

        // Update new window if open
        if (previewWindow && !previewWindow.closed) {
            let processedHtml = htmlCode;
            if (isTabMode) {
                processedHtml = resolveFileReferences(htmlCode);
            }
            previewWindow.document.open();
            previewWindow.document.write(processedHtml);
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
        javascript: '// Welcome to CodeSynq!\n// JavaScript - Dynamic Programming Language\n// Press Ctrl+Space for IntelliSense suggestions\n\nconsole.log("Hello from CodeSynq!");\n\n// Example: Variables and Functions\nconst greeting = "Welcome to CodeSynq-JavaScript!";\nfunction showMessage(msg) {\n    console.log(msg);\n}\n\nshowMessage(greeting);',

        python: '# Welcome to CodeSynq!\n# Python - High-level Programming Language\n# Press Ctrl+Space for suggestions\n\nprint("Hello, CodeSynq-Python")\n\n# Example: Variables and Functions\ngreeting = "Welcome to CodeSynq!"\ndef show_message(msg):\n    print(msg)\n\nshow_message(greeting)',

        html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>CodeSynq - HTML Page</title>\n    <style>\n        body { font-family: Arial, sans-serif; margin: 40px; }\n        .container { max-width: 800px; margin: 0 auto; }\n        h1 { color: #333; }\n    </style>\n</head>\n<body>\n    <div class="container">\n        <h1>Hello, World!</h1>\n        <p>Welcome to HTML development with CodeSynq!</p>\n        <button onclick="alert(\'Hello from CodeSynq!\')">Click Me</button>\n    </div>\n</body>\n</html>',

        css: '/* Welcome to CodeSynq! */\n/* CSS - Cascading Style Sheets */\n/* Press Ctrl+Space for property suggestions */\n\n/* Reset and Base Styles */\n* {\n    margin: 0;\n    padding: 0;\n    box-sizing: border-box;\n}\n\nbody {\n    font-family: \'Arial\', sans-serif;\n    line-height: 1.6;\n    color: #333;\n    background: #f4f4f4;\n}\n\n.container {\n    max-width: 1200px;\n    margin: 0 auto;\n    padding: 20px;\n}\n\nh1 {\n    color: #2c3e50;\n    text-align: center;\n    margin-bottom: 30px;\n}',

        java: '// Welcome to CodeSynq!\n// Java - Object-Oriented Programming Language\n// Press Ctrl+Space for suggestions\n\nimport java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from CodeSynq!");\n        \n        // Example: Variables and Methods\n        String greeting = "Welcome to CodeSynq-Java!";\n        showMessage(greeting);\n        \n        // Example: Simple calculation\n        int result = addNumbers(5, 3);\n        System.out.println("5 + 3 = " + result);\n    }\n    \n    public static void showMessage(String msg) {\n        System.out.println(msg);\n    }\n    \n    public static int addNumbers(int a, int b) {\n        return a + b;\n    }\n}',

        c: '// Welcome to CodeSynq!\n// C - Procedural Programming Language\n// Press Ctrl+Space for suggestions\n\n#include <stdio.h>\n#include <stdlib.h>\n\n// Function declarations\nvoid showMessage(const char* msg);\nint addNumbers(int a, int b);\n\nint main() {\n    printf("Hello from CodeSynq!\\n");\n    \n    // Example: Variables and Functions\n    const char* greeting = "Welcome to CodeSynq- C Programming!";\n    showMessage(greeting);\n    \n    // Example: Simple calculation\n    int result = addNumbers(5, 3);\n    printf("5 + 3 = %d\\n", result);\n    \n    return 0;\n}\n\nvoid showMessage(const char* msg) {\n    printf("%s\\n", msg);\n}\n\nint addNumbers(int a, int b) {\n    return a + b;\n}',

        cpp: '// Welcome to CodeSynq!\n// C++ - Object-Oriented Programming Language\n// Press Ctrl+Space for suggestions\n\n#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// Function declarations\nvoid showMessage(const string& msg);\nint addNumbers(int a, int b);\n\nint main() {\n    cout << "Hello from CodeSynq!" << endl;\n    \n    // Example: Variables and Functions\n    string greeting = "Welcome to CodeSynq-C++!";\n    showMessage(greeting);\n    \n    // Example: Simple calculation\n    int result = addNumbers(5, 3);\n    cout << "5 + 3 = " << result << endl;\n    \n    return 0;\n}\n\nvoid showMessage(const string& msg) {\n    cout << msg << endl;\n}\n\nint addNumbers(int a, int b) {\n    return a + b;\n}'
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

    if (editor && monaco) {
        const language = getMonacoLanguage(newLanguage);
        monaco.editor.setModelLanguage(editor.getModel(), language);

        // Load language-specific boilerplate code
        const boilerplateCode = getDefaultCode(newLanguage);
        editor.setValue(boilerplateCode);

        // Show notification about language change
        showNotification(`Switched to ${newLanguage.toUpperCase()} with boilerplate code`);
    }

    updateLivePreviewVisibility(newLanguage);

    // Reset file tracking when switching languages
    currentSavedFile = null;
    hasUnsavedChanges = false;
    updateSaveButtonText();
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

                    const language = getMonacoLanguage(content.language);
                    monaco.editor.setModelLanguage(editor.getModel(), language);
                    updateLivePreviewVisibility(content.language);
                }

                // Restore content
                if (content.code && content.code.trim() !== '') {
                    editor.setValue(content.code);
                    editor.layout();
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

    if (editor && monaco) {
        const monacoTheme = getMonacoTheme(theme);
        monaco.editor.setTheme(monacoTheme);
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

function getDefaultFileName(language) {
    const fileNames = {
        javascript: 'main.js',
        python: 'main.py',
        html: 'index.html',
        css: 'style.css',
        java: 'Main.java',
        c: 'main.c',
        cpp: 'main.cpp'
    };
    return fileNames[language] || 'untitled.txt';
}

// Utility functions
window.getCodeMirrorMode = function (language) {
    // Legacy function for compatibility - now uses Monaco
    return getMonacoLanguage(language);
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

    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

        if (user.profilePic) {
            userItem.innerHTML = `
                <img src="${user.profilePic}" alt="${user.username}" class="user-avatar">
                <div class="user-info">
                    <div class="user-name">${user.username}${user.isHost ? ' (Host)' : ''}</div>
                    <div class="user-status">${user.isHost ? 'Host' : 'Participant'}</div>
                </div>
            `;
        } else {
            const avatar = createCustomAvatar(user.username, 36);
            userItem.appendChild(avatar);
            userItem.innerHTML += `
                <div class="user-info">
                    <div class="user-name">${user.username}${user.isHost ? ' (Host)' : ''}</div>
                    <div class="user-status">${user.isHost ? 'Host' : 'Participant'}</div>
                </div>
            `;
        }

        userList.appendChild(userItem);
    });
}

function loadUserPreferences() {
    if (!window.currentUser || typeof database === 'undefined') {
        // For non-logged users, apply default theme immediately
        const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
        applyTheme(savedTheme);
        document.querySelector(`[data-theme="${savedTheme}"]`)?.classList.add('active');
        themeApplied = true;
        layoutApplied = true;
        editorSettingsApplied = true;
        return;
    }

    updateLoadingProgress(90, 'Loading your preferences...');

    database.ref(`users/${window.currentUser.uid}/preferences`).once('value', (snapshot) => {
        const prefs = snapshot.val();
        console.log('Loaded preferences:', prefs);

        if (prefs) {
            // Apply saved theme
            if (prefs.theme) {
                document.body.setAttribute('data-theme', prefs.theme);
                if (editor) {
                    const editorThemes = {
                        dark: 'vs-dark',
                        light: 'vs',
                        blue: 'vs-dark',
                        green: 'vs-dark'
                    };
                    monaco.editor.setTheme(editorThemes[prefs.theme] || 'vs-dark');
                }
                document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
                document.querySelector(`[data-theme="${prefs.theme}"]`)?.classList.add('active');
                themeApplied = true;
            } else {
                themeApplied = true;
            }

            // Apply saved layout
            if (prefs.layout) {
                setTimeout(() => {
                    applyLayout(prefs.layout);
                    document.querySelectorAll('.layout-option').forEach(opt => opt.classList.remove('active'));
                    document.querySelector(`[data-layout="${prefs.layout}"]`)?.classList.add('active');
                    layoutApplied = true;
                }, 300);
            } else {
                layoutApplied = true;
            }

            // Load editor settings after theme and layout
            setTimeout(() => {
                loadEditorSettings();
                updateLoadingProgress(95, 'Applying settings...');
            }, 400);
        } else {
            // No preferences saved, apply defaults
            const defaultTheme = 'dark';
            applyTheme(defaultTheme);
            document.querySelector(`[data-theme="${defaultTheme}"]`)?.classList.add('active');

            // Load editor settings with defaults
            setTimeout(() => {
                loadEditorSettings();
                themeApplied = true;
                layoutApplied = true;
            }, 400);
        }
    }).catch(e => {
        console.log('Error loading preferences:', e);
        // Fallback to localStorage
        const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
        applyTheme(savedTheme);
        document.querySelector(`[data-theme="${savedTheme}"]`)?.classList.add('active');
        themeApplied = true;
        layoutApplied = true;
        editorSettingsApplied = true;
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

// Create custom avatar with user initials
function createCustomAvatar(username, size = 36) {
    const initials = username.charAt(0).toUpperCase();
    const div = document.createElement('div');
    div.className = size === 40 ? 'chat-friend-avatar' : (size === 36 ? 'user-avatar' : 'request-avatar');
    div.textContent = initials;
    div.style.fontSize = size === 40 ? '16px' : '14px';
    return div;
}

// Friend System Functions
let currentChatFriend = null;

function setupFriendSystem() {
    // Add Friend button
    document.getElementById('addFriendBtn').addEventListener('click', () => {
        document.getElementById('addFriendModal').style.display = 'block';
        document.getElementById('friendEmailInput').focus();
    });

    // Make Community button
    document.getElementById('makeCommunityBtn').addEventListener('click', () => {
        loadFriendsForCommunity();
        document.getElementById('makeCommunityModal').style.display = 'block';
        document.getElementById('communityNameInput').focus();
    });

    // Cancel Add Friend
    document.getElementById('cancelAddFriend').addEventListener('click', () => {
        document.getElementById('addFriendModal').style.display = 'none';
        document.getElementById('friendEmailInput').value = '';
        document.getElementById('friendSearchStatus').textContent = '';
        document.getElementById('sendFriendRequest').disabled = false;
    });

    // Send Friend Request
    document.getElementById('sendFriendRequest').addEventListener('click', sendFriendRequest);

    // Friend Chat Modal
    document.getElementById('closeFriendChat').addEventListener('click', () => {
        document.getElementById('friendChatModal').style.display = 'none';
        currentChatFriend = null;
    });

    // Pin Friend Chat
    document.getElementById('pinFriendChat').addEventListener('click', togglePinFriendChat);

    // Friend Menu
    document.getElementById('friendMenuBtn').addEventListener('click', showFriendInfo);

    // Send Friend Message
    document.getElementById('sendFriendMessage').addEventListener('click', sendFriendMessage);
    document.getElementById('friendMessageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendFriendMessage();
        }
    });

    // Code Share Success Modal
    document.getElementById('addRecipientAsFriend').addEventListener('click', addRecipientAsFriend);
    document.getElementById('skipAddFriend').addEventListener('click', () => {
        document.getElementById('codeShareSuccessModal').style.display = 'none';
    });

    // Community modal handlers
    document.getElementById('cancelCommunity').addEventListener('click', () => {
        document.getElementById('makeCommunityModal').style.display = 'none';
        document.getElementById('communityNameInput').value = '';
    });

    document.getElementById('createCommunity').addEventListener('click', createCommunity);

    // Community Chat Modal
    document.getElementById('closeCommunityChat').addEventListener('click', () => {
        document.getElementById('communityChatModal').style.display = 'none';
        currentCommunity = null;
    });

    // Pin Community Chat
    document.getElementById('pinCommunityChat').addEventListener('click', togglePinCommunityChat);

    // Community Menu
    document.getElementById('communityMenuBtn').addEventListener('click', () => {
        showCommunitySettings();
    });

    // Community Settings Modal
    document.getElementById('closeCommunitySettings').addEventListener('click', () => {
        document.getElementById('communitySettingsModal').style.display = 'none';
    });

    document.getElementById('leaveCommunity').addEventListener('click', leaveCommunity);
    document.getElementById('deleteCommunity').addEventListener('click', deleteCommunity);

    // Messaging permission change
    document.getElementById('messagingPermission').addEventListener('change', updateMessagingPermission);

    // Close member actions dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.member-actions-dropdown') && !e.target.closest('.member-menu-btn')) {
            document.getElementById('memberActionsDropdown').style.display = 'none';
        }
    });

    // Send Community Message
    document.getElementById('sendCommunityMessage').addEventListener('click', sendCommunityMessage);
    document.getElementById('communityMessageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendCommunityMessage();
        }
    });

    // Load friend requests when user logs in
    if (window.currentUser) {
        loadFriendRequests();
        loadUserCommunities();
    }

    // Setup draggable pinned chat widget
    setupPinnedChatWidget();

    // Load friend requests immediately
    loadFriendRequests();

    // Friend Info Modal
    document.getElementById('closeFriendInfo').addEventListener('click', () => {
        document.getElementById('friendInfoModal').style.display = 'none';
    });

    document.getElementById('removeFriend').addEventListener('click', removeFriendFromChat);
}

function sendFriendRequest() {
    const input = document.getElementById('friendEmailInput').value.trim();
    const statusEl = document.getElementById('friendSearchStatus');
    const sendBtn = document.getElementById('sendFriendRequest');

    if (!input) {
        statusEl.textContent = 'Please enter a username';
        statusEl.className = 'friend-search-status error';
        return;
    }

    if (input.includes('@')) {
        statusEl.textContent = 'Please enter username only, not email';
        statusEl.className = 'friend-search-status error';
        return;
    }

    if (input === window.currentUser.username) {
        statusEl.textContent = 'You cannot add yourself as a friend';
        statusEl.className = 'friend-search-status error';
        return;
    }

    statusEl.textContent = 'Searching...';
    statusEl.className = 'friend-search-status loading';
    sendBtn.disabled = true;

    database.ref(`usernameToUid/${input}`).once('value', (snapshot) => {
        const uid = snapshot.val();
        if (uid) {
            database.ref(`users/${uid}`).once('value', (userSnapshot) => {
                if (userSnapshot.exists()) {
                    sendFriendRequestToUser(uid, userSnapshot.val(), statusEl, sendBtn);
                } else {
                    statusEl.textContent = 'Username not found';
                    statusEl.className = 'friend-search-status error';
                    sendBtn.disabled = false;
                }
            });
        } else {
            statusEl.textContent = 'Username not found';
            statusEl.className = 'friend-search-status error';
            sendBtn.disabled = false;
        }
    });
}

function sendFriendRequestToUser(uid, userData, statusEl, sendBtn) {
    statusEl.textContent = 'User found! Sending request...';
    statusEl.className = 'friend-search-status success';

    // Check if already friends or request exists
    database.ref(`friends/${window.currentUser.uid}/${uid}`).once('value', (friendCheck) => {
        if (friendCheck.exists()) {
            statusEl.textContent = 'Already in friends list';
            statusEl.className = 'friend-search-status error';
            sendBtn.disabled = false;
            return;
        }

        database.ref(`friendRequests/${uid}/${window.currentUser.uid}`).once('value', (requestCheck) => {
            if (requestCheck.exists()) {
                statusEl.textContent = 'Friend request already sent';
                statusEl.className = 'friend-search-status error';
                sendBtn.disabled = false;
                return;
            }

            // Send friend request
            const requestData = {
                from: window.currentUser.uid,
                fromName: window.currentUser.displayName || window.currentUser.email.split('@')[0],
                fromEmail: window.currentUser.email,
                fromPhoto: window.currentUser.photoURL || null,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };

            database.ref(`friendRequests/${uid}/${window.currentUser.uid}`).set(requestData).then(() => {
                document.getElementById('addFriendModal').style.display = 'none';
                document.getElementById('friendEmailInput').value = '';
                statusEl.textContent = '';
                sendBtn.disabled = false;
                showNotification('Friend request sent!');
            }).catch((error) => {
                console.error('Error sending friend request:', error);
                statusEl.textContent = 'Error sending request';
                statusEl.className = 'friend-search-status error';
                sendBtn.disabled = false;
            });
        });
    });
}

function loadFriendsList() {
    if (!window.currentUser) return;

    loadUserCommunities();
}

function openFriendChat(friendUid, friendData) {
    currentChatFriend = { uid: friendUid, ...friendData };

    // Update chat header
    const chatAvatar = document.getElementById('chatFriendAvatar');
    if (friendData.photoURL) {
        chatAvatar.src = friendData.photoURL;
        chatAvatar.style.display = 'block';
    } else {
        chatAvatar.style.display = 'none';
        const customAvatar = createCustomAvatar(friendData.name, 40);
        chatAvatar.parentNode.insertBefore(customAvatar, chatAvatar);
    }
    document.getElementById('chatFriendName').textContent = friendData.name;
    // Get real online status from Firebase
    getUserStatus(friendUid, (status) => {
        document.getElementById('chatFriendStatus').textContent = status === 'online' ? 'Online' : 'Offline';
        document.getElementById('chatFriendStatus').className = `friend-status ${status}`;
    });

    // Load chat messages
    loadFriendChatMessages(friendUid);

    // Show chat modal
    document.getElementById('friendChatModal').style.display = 'block';

    // Close friends dropdown
    document.getElementById('friendsMenu').classList.remove('show');
    document.getElementById('dropdownBlurOverlay').classList.remove('show');
}

function loadFriendChatMessages(friendUid) {
    const chatMessages = document.getElementById('friendChatMessages');
    chatMessages.innerHTML = '';

    const chatId = [window.currentUser.uid, friendUid].sort().join('_');

    database.ref(`chats/${chatId}`).orderByChild('timestamp').on('value', (snapshot) => {
        const messages = snapshot.val();

        if (!messages) {
            chatMessages.innerHTML = '<p style="text-align: center; color: var(--text-secondary); font-style: italic;">No messages yet. Start the conversation!</p>';
            return;
        }

        const messageArray = Object.values(messages);
        const lastMessage = messageArray[messageArray.length - 1];

        // Check if this is a new message from the friend and chat is pinned
        if (lastMessage && lastMessage.from === friendUid &&
            window.pinnedChatId === friendUid && window.pinnedChatType === 'friend' &&
            document.getElementById('friendChatModal').style.display !== 'block') {
            triggerPinnedChatAnimation();
        }

        chatMessages.innerHTML = '';
        messageArray.forEach(message => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `friend-message ${message.from === window.currentUser.uid ? 'own' : 'other'}`;

            const messageContent = document.createElement('div');
            messageContent.textContent = message.text;

            const messageTime = document.createElement('div');
            messageTime.className = 'message-time';
            messageTime.textContent = new Date(message.timestamp).toLocaleTimeString();

            messageDiv.appendChild(messageContent);
            messageDiv.appendChild(messageTime);
            chatMessages.appendChild(messageDiv);
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function sendFriendMessage() {
    const input = document.getElementById('friendMessageInput');
    const message = input.value.trim();

    if (!message || !currentChatFriend || !window.currentUser) return;

    const chatId = [window.currentUser.uid, currentChatFriend.uid].sort().join('_');

    const messageData = {
        from: window.currentUser.uid,
        to: currentChatFriend.uid,
        text: message,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    database.ref(`chats/${chatId}`).push(messageData).then(() => {
        input.value = '';
        loadFriendChatMessages(currentChatFriend.uid);
    }).catch((error) => {
        showNotification('Error sending message: ' + error.message);
    });
}

function showCodeShareSuccessModal(recipientEmail) {
    document.getElementById('shareRecipientEmail').textContent = recipientEmail;
    document.getElementById('codeShareSuccessModal').style.display = 'block';
}

// Make it globally accessible
window.showCodeShareSuccessModal = showCodeShareSuccessModal;

function addRecipientAsFriend() {
    const recipientEmail = document.getElementById('shareRecipientEmail').textContent;
    document.getElementById('friendEmailInput').value = recipientEmail;
    document.getElementById('codeShareSuccessModal').style.display = 'none';
    document.getElementById('addFriendModal').style.display = 'block';
}

function loadFriendRequests() {
    if (!window.currentUser) return;

    database.ref(`friendRequests/${window.currentUser.uid}`).on('value', (snapshot) => {
        const requests = snapshot.val();
        const requestsList = document.getElementById('friendRequestsList');
        const badge = document.getElementById('notificationBadge');
        const requestsSection = document.getElementById('friendRequestsSection');

        requestsList.innerHTML = '';

        if (!requests) {
            requestsSection.style.display = 'none';
            badge.style.display = 'none';
            return;
        }

        const requestCount = Object.keys(requests).length;

        if (requestCount === 0) {
            requestsSection.style.display = 'none';
            badge.style.display = 'none';
        } else {
            requestsSection.style.display = 'block';
            badge.textContent = requestCount;
            badge.style.display = 'block';

            Object.entries(requests).forEach(([fromUid, requestData]) => {
                const requestItem = document.createElement('div');
                requestItem.className = 'friend-request-item';

                if (requestData.fromPhoto) {
                    requestItem.innerHTML = `
                        <img src="${requestData.fromPhoto}" alt="${requestData.fromName}" class="request-avatar">
                        <div class="request-info">
                            <div class="request-name">${requestData.fromName}</div>
                            <div class="request-actions">
                                <button onclick="acceptFriendRequest('${fromUid}', '${requestData.fromName}', '${requestData.fromEmail}', '${requestData.fromPhoto}')" class="btn-accept">Accept</button>
                                <button onclick="rejectFriendRequest('${fromUid}')" class="btn-reject">Reject</button>
                            </div>
                        </div>
                    `;
                } else {
                    const avatar = createCustomAvatar(requestData.fromName, 36);
                    requestItem.appendChild(avatar);
                    requestItem.innerHTML += `
                        <div class="request-info">
                            <div class="request-name">${requestData.fromName}</div>
                            <div class="request-actions">
                                <button onclick="acceptFriendRequest('${fromUid}', '${requestData.fromName}', '${requestData.fromEmail}', '${requestData.fromPhoto}')" class="btn-accept">Accept</button>
                                <button onclick="rejectFriendRequest('${fromUid}')" class="btn-reject">Reject</button>
                            </div>
                        </div>
                    `;
                }

                requestsList.appendChild(requestItem);
            });
        }
    });
}

function acceptFriendRequest(fromUid, fromName, fromEmail, fromPhoto) {
    // Add to both users' friends lists
    const friendData1 = {
        name: fromName,
        email: fromEmail,
        photoURL: fromPhoto,
        addedAt: firebase.database.ServerValue.TIMESTAMP
    };

    const friendData2 = {
        name: window.currentUser.displayName,
        email: window.currentUser.email,
        photoURL: window.currentUser.photoURL,
        addedAt: firebase.database.ServerValue.TIMESTAMP
    };

    database.ref(`friends/${window.currentUser.uid}/${fromUid}`).set(friendData1, () => {
        database.ref(`friends/${fromUid}/${window.currentUser.uid}`).set(friendData2, () => {
            // Remove the friend request
            database.ref(`friendRequests/${window.currentUser.uid}/${fromUid}`).remove();
            showNotification(`You are now friends with ${fromName}!`);
        });
    });
}

function rejectFriendRequest(fromUid) {
    database.ref(`friendRequests/${window.currentUser.uid}/${fromUid}`).remove();
    showNotification('Friend request rejected');
}

window.acceptFriendRequest = acceptFriendRequest;
window.rejectFriendRequest = rejectFriendRequest;

// Admin Notification System
function setupAdminNotifications() {
    if (!window.currentUser || typeof database === 'undefined') return;

    // Request notification permission immediately
    requestNotificationPermission();

    // Mark user as online for notifications
    database.ref(`onlineUsers/${window.currentUser.uid}`).set({
        name: window.currentUser.displayName || window.currentUser.email,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });

    // Remove user from online list when they disconnect
    database.ref(`onlineUsers/${window.currentUser.uid}`).onDisconnect().remove();

    // Listen for new admin notifications
    adminNotificationListener = database.ref('adminNotifications').on('child_added', (snapshot) => {
        const notification = snapshot.val();
        const notificationId = snapshot.key;

        // Skip if this is the user who sent the notification
        if (notification.sentBy === window.currentUser.uid) {
            return;
        }

        // Check if user has already seen this notification
        database.ref(`users/${window.currentUser.uid}/seenNotifications/${notificationId}`).once('value', (seenSnapshot) => {
            if (!seenSnapshot.exists()) {
                // Mark as seen
                database.ref(`users/${window.currentUser.uid}/seenNotifications/${notificationId}`).set(true);

                // Show browser notification
                showBrowserNotification(notification);

                // Show in-app notification
                showNotification(notification.message, notification.type || 'info');
            }
        });
    });
}

function requestNotificationPermission() {
    // Check if running on localhost
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

    if (isLocalhost) {
        showNotification('Running on localhost - browser notifications may not work. Using fallback system.', 'warning');
        database.ref(`users/${window.currentUser.uid}/notificationsEnabled`).set(true);
        return;
    }

    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            Notification.requestPermission().then((permission) => {
                if (permission === 'granted') {
                    database.ref(`users/${window.currentUser.uid}/notificationsEnabled`).set(true);
                    showNotification('Browser notifications enabled!', 'success');
                } else {
                    showNotification('Please enable notifications to receive admin updates', 'warning');
                }
            });
        } else if (Notification.permission === 'granted') {
            database.ref(`users/${window.currentUser.uid}/notificationsEnabled`).set(true);
        }
    }
}

function showBrowserNotification(notification) {
    // Check if running on localhost
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

    if (isLocalhost) {
        // Fallback for localhost - show prominent in-app notification
        showLocalhostNotification(notification);
        return;
    }

    if ('Notification' in window && Notification.permission === 'granted') {
        const options = {
            body: notification.message,
            icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiM2MzY2RjEiLz4KPHN2ZyB4PSIxNiIgeT0iMTYiIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIj4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEzIDJMMTMgNkwxMSA2TDExIDJMMTMgMloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xOSA4TDIxIDhMMjEgMTBMMTkgMTBMMTkgOFoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik01IDhMMyA4TDMgMTBMNSAxMEw1IDhaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIgMjJDMTYuNDE4MyAyMiAyMCAxOC40MTgzIDIwIDE0QzIwIDkuNTgxNzIgMTYuNDE4MyA2IDEyIDZDNy41ODE3MiA2IDQgOS41ODE3MiA0IDE0QzQgMTguNDE4MyA3LjU4MTcyIDIyIDEyIDIyWiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHN2Zz4KPC9zdmc+Cjwvc3ZnPgo8L3N2Zz4K',
            badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiM2MzY2RjEiLz4KPHN2ZyB4PSIxNiIgeT0iMTYiIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIj4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHN2Zz4KPC9zdmc+Cjwvc3ZnPgo8L3N2Zz4K',
            tag: `codesynq-${Date.now()}`,
            requireInteraction: notification.priority === 'high',
            silent: false,
            vibrate: notification.priority === 'high' ? [200, 100, 200] : [100]
        };

        try {
            const browserNotification = new Notification(notification.title || 'CodeSynq Admin', options);

            // Auto close after duration based on priority
            const duration = notification.priority === 'high' ? 10000 : notification.priority === 'low' ? 3000 : 6000;
            setTimeout(() => {
                browserNotification.close();
            }, duration);

            // Handle click
            browserNotification.onclick = function () {
                window.focus();
                this.close();

                // If notification has a link, open it
                if (notification.link) {
                    window.open(notification.link, '_blank');
                }
            };

            console.log('Browser notification sent:', notification.title);
        } catch (error) {
            console.error('Error showing browser notification:', error);
            // Fallback to localhost notification if browser notification fails
            showLocalhostNotification(notification);
        }
    } else {
        console.log('Browser notifications not available or not permitted');
        // Fallback to localhost notification
        showLocalhostNotification(notification);
    }
}

function showLocalhostNotification(notification) {
    // Create a prominent notification overlay for localhost testing
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 350px;
        font-family: 'Segoe UI', sans-serif;
        animation: slideIn 0.3s ease-out;
    `;

    overlay.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 20px; margin-right: 10px;">🔔</div>
            <div style="font-weight: bold; font-size: 16px;">${notification.title || 'Admin Notification'}</div>
            <button onclick="this.parentElement.parentElement.remove()" style="margin-left: auto; background: none; border: none; color: white; font-size: 18px; cursor: pointer;">×</button>
        </div>
        <div style="font-size: 14px; line-height: 1.4; margin-bottom: 10px;">${notification.message}</div>
        <div style="font-size: 12px; opacity: 0.8;">📍 Localhost Mode - Browser notifications disabled</div>
        ${notification.link ? `<div style="margin-top: 10px;"><a href="${notification.link}" target="_blank" style="color: #fff; text-decoration: underline;">Open Link</a></div>` : ''}
    `;

    // Add animation keyframes if not already added
    if (!document.getElementById('notificationStyles')) {
        const style = document.createElement('style');
        style.id = 'notificationStyles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(overlay);

    // Auto remove after duration based on priority
    const duration = notification.priority === 'high' ? 10000 : notification.priority === 'low' ? 3000 : 6000;
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => overlay.remove(), 300);
        }
    }, duration);

    console.log('Localhost notification shown:', notification.title);
}

// Admin function to send notifications (for admin panel)
function sendAdminNotification(title, message, type = 'info', priority = 'normal', link = null) {
    if (!window.currentUser || typeof database === 'undefined') {
        console.error('User not logged in or database not available');
        return Promise.reject('User not logged in');
    }

    return new Promise((resolve, reject) => {
        // Check if user has admin privileges
        database.ref(`users/${window.currentUser.uid}/isAdmin`).once('value', (snapshot) => {
            if (snapshot.val() === true) {
                const notificationData = {
                    title: title,
                    message: message,
                    type: type, // 'info', 'success', 'warning', 'error'
                    priority: priority, // 'low', 'normal', 'high'
                    link: link,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    sentBy: window.currentUser.uid,
                    sentByName: window.currentUser.displayName || window.currentUser.email
                };

                // Send notification to database
                database.ref('adminNotifications').push(notificationData).then(() => {
                    // Count online users for feedback
                    database.ref('onlineUsers').once('value', (onlineSnapshot) => {
                        const onlineCount = onlineSnapshot.numChildren();
                        showNotification(`Notification sent to ${onlineCount} online users!`, 'success');
                        resolve({ success: true, onlineUsers: onlineCount });
                    });
                }).catch((error) => {
                    showNotification('Error sending notification: ' + error.message, 'error');
                    reject(error);
                });
            } else {
                showNotification('You do not have admin privileges', 'error');
                reject('No admin privileges');
            }
        });
    });
}

// Make admin function globally accessible for testing
window.sendAdminNotification = sendAdminNotification;

// Test function for localhost
window.testLocalhostNotification = function () {
    showLocalhostNotification({
        title: 'Test Notification',
        message: 'This is a test notification for localhost development. Browser notifications are disabled on localhost.',
        type: 'info',
        priority: 'normal'
    });
};

// Function to make a user admin (for initial setup)
function makeUserAdmin(userEmail) {
    if (!window.currentUser || typeof database === 'undefined') {
        console.error('User not logged in or database not available');
        return;
    }

    database.ref('usernameToUid').orderByValue().once('value', (snapshot) => {
        const users = snapshot.val();
        let targetUid = null;

        // Find user by email
        Object.entries(users || {}).forEach(([username, uid]) => {
            database.ref(`users/${uid}/email`).once('value', (emailSnapshot) => {
                if (emailSnapshot.val() === userEmail) {
                    targetUid = uid;
                    database.ref(`users/${uid}/isAdmin`).set(true).then(() => {
                        console.log(`Made ${userEmail} an admin`);
                        showNotification(`Made ${userEmail} an admin`, 'success');
                    });
                }
            });
        });
    });
}

// Make function globally accessible
window.makeUserAdmin = makeUserAdmin;

// Community System Functions
let currentCommunity = null;
let selectedFriends = new Set();

function loadFriendsForCommunity() {
    if (!window.currentUser) return;

    const friendsList = document.getElementById('friendsSelectionList');
    friendsList.innerHTML = '<p class="no-friends">Loading friends...</p>';
    selectedFriends.clear();

    database.ref(`friends/${window.currentUser.uid}`).once('value', (snapshot) => {
        const friends = snapshot.val();
        friendsList.innerHTML = '';

        if (!friends) {
            friendsList.innerHTML = '<p class="no-friends">No friends to add to community</p>';
            return;
        }

        Object.entries(friends).forEach(([friendUid, friendData]) => {
            const friendItem = document.createElement('div');
            friendItem.className = 'friend-selection-item';
            friendItem.dataset.friendUid = friendUid;

            if (friendData.photoURL) {
                friendItem.innerHTML = `
                    <img src="${friendData.photoURL}" alt="${friendData.name}" class="friend-avatar">
                    <div class="friend-info">
                        <div class="friend-name">${friendData.name}</div>
                    </div>
                `;
            } else {
                const avatar = createCustomAvatar(friendData.name, 36);
                friendItem.appendChild(avatar);
                friendItem.innerHTML += `
                    <div class="friend-info">
                        <div class="friend-name">${friendData.name}</div>
                    </div>
                `;
            }

            friendItem.addEventListener('click', () => {
                if (selectedFriends.has(friendUid)) {
                    selectedFriends.delete(friendUid);
                    friendItem.classList.remove('selected');
                } else {
                    selectedFriends.add(friendUid);
                    friendItem.classList.add('selected');
                }
            });

            friendsList.appendChild(friendItem);
        });
    });
}

function createCommunity() {
    const communityName = document.getElementById('communityNameInput').value.trim();

    if (!communityName) {
        showNotification('Please enter a community name');
        return;
    }

    if (selectedFriends.size === 0) {
        showNotification('Please select at least one friend');
        return;
    }

    const communityId = 'community_' + Date.now();
    const updates = {};

    // Add community to creator
    updates[`userCommunities/${window.currentUser.uid}/${communityId}`] = {
        name: communityName,
        role: 'admin'
    };

    // Add community to all selected friends
    selectedFriends.forEach(friendUid => {
        updates[`userCommunities/${friendUid}/${communityId}`] = {
            name: communityName,
            role: 'member'
        };
    });

    // Save community data
    const members = [window.currentUser.uid, ...Array.from(selectedFriends)];
    updates[`communities/${communityId}`] = {
        name: communityName,
        createdBy: window.currentUser.uid,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        members: members
    };

    database.ref().update(updates).then(() => {
        document.getElementById('makeCommunityModal').style.display = 'none';
        document.getElementById('communityNameInput').value = '';
        selectedFriends.clear();
        showNotification('Community created successfully!');
    }).catch((error) => {
        showNotification('Error creating community: ' + error.message);
    });
}



function loadUserCommunities() {
    if (!window.currentUser) return;

    database.ref(`userCommunities/${window.currentUser.uid}`).on('value', (snapshot) => {
        const communities = snapshot.val();
        updateFriendsListWithCommunities(communities);
    });
}

function updateFriendsListWithCommunities(communities) {
    const friendsList = document.getElementById('friendsList');

    database.ref(`friends/${window.currentUser.uid}`).once('value', (friendsSnapshot) => {
        const friends = friendsSnapshot.val();
        friendsList.innerHTML = '';

        if (communities) {
            Object.entries(communities).forEach(([communityId, communityData]) => {
                const communityItem = document.createElement('div');
                communityItem.className = 'friend-item community-item';
                communityItem.innerHTML = `
                    <div class="friend-avatar" style="background: var(--accent-color); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                        <i class="fas fa-broadcast-tower"></i>
                    </div>
                    <div class="friend-info">
                        <div class="friend-name">${communityData.name}</div>
                        <div class="friend-status">Community • ${communityData.role}</div>
                    </div>
                `;

                communityItem.addEventListener('click', () => {
                    openCommunityChat(communityId, communityData);
                });

                friendsList.appendChild(communityItem);
            });
        }

        if (friends) {
            Object.entries(friends).forEach(([friendUid, friendData]) => {
                const friendItem = document.createElement('div');
                friendItem.className = 'friend-item';

                if (friendData.photoURL) {
                    friendItem.innerHTML = `
                        <img src="${friendData.photoURL}" alt="${friendData.name}" class="friend-avatar">
                        <div class="friend-info">
                            <div class="friend-name">${friendData.name}</div>
                            <div class="friend-status online">Online</div>
                        </div>
                    `;
                } else {
                    const avatar = createCustomAvatar(friendData.name, 36);
                    friendItem.appendChild(avatar);
                    friendItem.innerHTML += `
                        <div class="friend-info">
                            <div class="friend-name">${friendData.name}</div>
                            <div class="friend-status online">Online</div>
                        </div>
                    `;
                }

                friendItem.addEventListener('click', () => {
                    openFriendChat(friendUid, friendData);
                });

                // Check online status
                getUserStatus(friendUid, (status) => {
                    const statusEl = friendItem.querySelector('.friend-status');
                    if (statusEl) {
                        statusEl.textContent = status === 'online' ? 'Online' : 'Offline';
                        statusEl.className = `friend-status ${status}`;
                    }
                });

                friendsList.appendChild(friendItem);
            });
        }

        if (!friends && !communities) {
            friendsList.innerHTML = '<p class="no-friends">No friends or communities yet</p>';
        }
    });
}

function openCommunityChat(communityId, communityData) {
    currentCommunity = { id: communityId, ...communityData };

    document.getElementById('communityName').textContent = communityData.name;

    database.ref(`communities/${communityId}`).once('value', (snapshot) => {
        const fullCommunityData = snapshot.val();
        const members = fullCommunityData.members;
        const memberCount = members ? Object.keys(members).length : 0;
        document.getElementById('communityMemberCount').textContent = `${memberCount} members`;

        // Check messaging permissions and update UI
        const messagingPermission = fullCommunityData.messagingPermission || 'everyone';
        const isAdmin = fullCommunityData.createdBy === window.currentUser.uid;

        const chatInput = document.getElementById('communityMessageInput');
        const sendButton = document.getElementById('sendCommunityMessage');
        const adminLabel = document.getElementById('adminOnlyLabel');

        if (messagingPermission === 'admins' && !isAdmin) {
            chatInput.style.display = 'none';
            sendButton.style.display = 'none';
            adminLabel.style.display = 'block';
        } else {
            chatInput.style.display = 'block';
            sendButton.style.display = 'block';
            adminLabel.style.display = 'none';
        }
    });

    loadCommunityMessages(communityId);
    document.getElementById('communityChatModal').style.display = 'block';
    document.getElementById('friendsMenu').classList.remove('show');
    document.getElementById('dropdownBlurOverlay').classList.remove('show');
}

function showCommunitySettings() {
    if (!currentCommunity) return;

    document.getElementById('communitySettingsTitle').textContent = `${currentCommunity.name} Settings`;

    database.ref(`communities/${currentCommunity.id}`).once('value', (snapshot) => {
        const communityData = snapshot.val();
        if (!communityData) return;

        const isAdmin = communityData.createdBy === window.currentUser.uid;

        // Show delete button only for admins, leave button for everyone
        document.getElementById('deleteCommunity').style.display = isAdmin ? 'inline-block' : 'none';

        // Load messaging permission setting
        const messagingPermission = communityData.messagingPermission || 'everyone';
        document.getElementById('messagingPermission').value = messagingPermission;

        // Show/hide messaging permission dropdown based on admin status
        const securitySettings = document.querySelector('.community-security-settings');
        securitySettings.style.display = isAdmin ? 'block' : 'none';

        loadCommunityMembers(currentCommunity.id, isAdmin);
    });

    document.getElementById('communitySettingsModal').style.display = 'block';
}

function loadCommunityMembers(communityId, isAdmin) {
    const membersList = document.getElementById('communityMembersList');
    membersList.innerHTML = '<p>Loading members...</p>';

    database.ref(`communities/${communityId}`).once('value', (snapshot) => {
        const communityData = snapshot.val();
        if (!communityData || !communityData.members) return;

        membersList.innerHTML = '';

        Object.entries(communityData.members).forEach(([memberUid, memberData]) => {
            const memberItem = document.createElement('div');
            memberItem.className = 'member-item';

            // Check if member is in friends list
            database.ref(`friends/${window.currentUser.uid}/${memberUid}`).once('value', (friendSnapshot) => {
                const isFriend = friendSnapshot.exists();
                const isCurrentUser = memberUid === window.currentUser.uid;
                const memberIsAdmin = memberUid === communityData.createdBy;

                memberItem.innerHTML = `
                    <div class="member-info">
                        <div class="member-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: var(--accent-color); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                            ${memberData.name ? memberData.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                            <div class="member-name">
                                ${isCurrentUser ? 'You' : (memberData.name || 'Unknown')}
                                ${memberIsAdmin ? '<span class="member-role">Admin</span>' : ''}
                                ${isFriend ? '<span class="friend-label">Friend</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="member-actions">
                        ${!isFriend && !isCurrentUser ? `<button class="btn-secondary" onclick="addMemberAsFriend('${memberUid}', '${memberData.name}')">Add Friend</button>` : ''}
                        ${isAdmin && !isCurrentUser ? `
                            <div class="member-menu">
                                <button class="member-menu-btn" onclick="toggleMemberMenu('${memberUid}')">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;

                membersList.appendChild(memberItem);
            });
        });
    });
}

let currentMemberUid = null;

function toggleMemberMenu(memberUid) {
    currentMemberUid = memberUid;
    const dropdown = document.getElementById('memberActionsDropdown');
    const button = event.target.closest('.member-menu-btn');

    if (dropdown.style.display === 'block' && currentMemberUid === memberUid) {
        dropdown.style.display = 'none';
        return;
    }

    // Position dropdown near the button
    const rect = button.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = rect.bottom + 'px';
    dropdown.style.left = (rect.left - 100) + 'px';
    dropdown.style.display = 'block';
}

function makeAdmin() {
    if (!currentMemberUid) return;
    database.ref(`communities/${currentCommunity.id}/createdBy`).set(currentMemberUid);
    showNotification('Admin role transferred!');
    document.getElementById('memberActionsDropdown').style.display = 'none';
    loadCommunityMembers(currentCommunity.id, false);
}

function removeMember() {
    if (!currentMemberUid) return;
    if (confirm('Remove this member from the community?')) {
        const updates = {};
        updates[`communities/${currentCommunity.id}/members/${currentMemberUid}`] = null;
        updates[`userCommunities/${currentMemberUid}/${currentCommunity.id}`] = null;

        database.ref().update(updates).then(() => {
            showNotification('Member removed!');
            document.getElementById('memberActionsDropdown').style.display = 'none';
            loadCommunityMembers(currentCommunity.id, true);
        });
    }
}

function updateMessagingPermission() {
    const permission = document.getElementById('messagingPermission').value;

    database.ref(`communities/${currentCommunity.id}/messagingPermission`).set(permission).then(() => {
        showNotification(`Messaging permission updated to: ${permission}`);

        // Update current chat UI if needed
        if (document.getElementById('communityChatModal').style.display === 'block') {
            openCommunityChat(currentCommunity.id, currentCommunity);
        }
    }).catch((error) => {
        showNotification('Error updating permission: ' + error.message);
    });
}

function addMemberAsFriend(memberUid, memberName) {
    const friendData = {
        name: memberName,
        addedAt: firebase.database.ServerValue.TIMESTAMP
    };

    const myData = {
        name: window.currentUser.displayName,
        email: window.currentUser.email,
        photoURL: window.currentUser.photoURL,
        addedAt: firebase.database.ServerValue.TIMESTAMP
    };

    database.ref(`friends/${window.currentUser.uid}/${memberUid}`).set(friendData);
    database.ref(`friends/${memberUid}/${window.currentUser.uid}`).set(myData);

    showNotification(`Added ${memberName} as friend!`);
    loadCommunityMembers(currentCommunity.id, true);
}



function leaveCommunity() {
    if (confirm('Are you sure you want to leave this community?')) {
        database.ref(`communities/${currentCommunity.id}`).once('value', (snapshot) => {
            const communityData = snapshot.val();
            const isAdmin = communityData.createdBy === window.currentUser.uid;
            const members = communityData.members || {};
            const memberIds = Object.keys(members).filter(id => id !== window.currentUser.uid);

            const updates = {};
            updates[`communities/${currentCommunity.id}/members/${window.currentUser.uid}`] = null;
            updates[`userCommunities/${window.currentUser.uid}/${currentCommunity.id}`] = null;

            // If admin is leaving and there are other members, transfer admin to random member
            if (isAdmin && memberIds.length > 0) {
                const newAdminId = memberIds[Math.floor(Math.random() * memberIds.length)];
                updates[`communities/${currentCommunity.id}/createdBy`] = newAdminId;
            }

            database.ref().update(updates).then(() => {
                document.getElementById('communitySettingsModal').style.display = 'none';
                document.getElementById('communityChatModal').style.display = 'none';
                showNotification(isAdmin && memberIds.length > 0 ? 'Left community! Admin transferred to another member.' : 'Left community!');
                loadUserCommunities();
            });
        });
    }
}

function deleteCommunity() {
    if (confirm('Are you sure you want to delete this community? This action cannot be undone.')) {
        database.ref(`communities/${currentCommunity.id}`).once('value', (snapshot) => {
            const communityData = snapshot.val();
            if (!communityData) return;

            const updates = {};
            updates[`communities/${currentCommunity.id}`] = null;
            updates[`communityChats/${currentCommunity.id}`] = null;

            // Remove from all members
            Object.keys(communityData.members || {}).forEach(memberUid => {
                updates[`userCommunities/${memberUid}/${currentCommunity.id}`] = null;
            });

            database.ref().update(updates).then(() => {
                document.getElementById('communitySettingsModal').style.display = 'none';
                document.getElementById('communityChatModal').style.display = 'none';
                showNotification('Community deleted!');
                loadUserCommunities();
            });
        });
    }
}

window.toggleMemberMenu = toggleMemberMenu;
window.addMemberAsFriend = addMemberAsFriend;
window.makeAdmin = makeAdmin;
window.removeMember = removeMember;

function loadCommunityMessages(communityId) {
    const chatMessages = document.getElementById('communityChatMessages');
    chatMessages.innerHTML = '';

    database.ref(`communityChats/${communityId}`).orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const messages = snapshot.val();

        if (!messages) {
            chatMessages.innerHTML = '<p style="text-align: center; color: var(--text-secondary); font-style: italic;">No messages yet. Start the conversation!</p>';
            return;
        }

        const messageArray = Object.values(messages);
        const lastMessage = messageArray[messageArray.length - 1];

        // Check if this is a new message from someone else and community is pinned
        if (lastMessage && lastMessage.from !== window.currentUser.uid &&
            window.pinnedChatId === communityId && window.pinnedChatType === 'community' &&
            document.getElementById('communityChatModal').style.display !== 'block') {
            triggerPinnedChatAnimation();
        }

        chatMessages.innerHTML = '';
        messageArray.forEach(message => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `community-message ${message.from === window.currentUser.uid ? 'own' : 'other'}`;

            const messageHeader = document.createElement('div');
            messageHeader.className = 'community-message-header';
            messageHeader.textContent = message.from === window.currentUser.uid ? 'You' : message.senderName;

            const messageContent = document.createElement('div');
            messageContent.textContent = message.text;

            const messageTime = document.createElement('div');
            messageTime.className = 'message-time';
            messageTime.textContent = new Date(message.timestamp).toLocaleTimeString();

            if (message.from !== window.currentUser.uid) {
                messageDiv.appendChild(messageHeader);
            }
            messageDiv.appendChild(messageContent);
            messageDiv.appendChild(messageTime);

            chatMessages.appendChild(messageDiv);
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function sendCommunityMessage() {
    const input = document.getElementById('communityMessageInput');
    const message = input.value.trim();

    if (!message || !currentCommunity || !window.currentUser) return;

    // Check messaging permissions
    database.ref(`communities/${currentCommunity.id}`).once('value', (snapshot) => {
        const communityData = snapshot.val();
        const messagingPermission = communityData.messagingPermission || 'everyone';
        const isAdmin = communityData.createdBy === window.currentUser.uid;

        if (messagingPermission === 'admins' && !isAdmin) {
            showNotification('Only admins can send messages in this community');
            return;
        }

        const messageData = {
            from: window.currentUser.uid,
            senderName: window.currentUser.displayName,
            text: message,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        database.ref(`communityChats/${currentCommunity.id}`).push(messageData).then(() => {
            input.value = '';
        }).catch((error) => {
            showNotification('Error sending message: ' + error.message);
        });
    });
}

// Pinned Chat Functionality
let pinnedChat = null;

function togglePinFriendChat() {
    const pinBtn = document.getElementById('pinFriendChat');

    if (pinnedChat && pinnedChat.type === 'friend' && pinnedChat.id === currentChatFriend.uid) {
        unpinChat();
    } else {
        pinChat('friend', currentChatFriend.uid, currentChatFriend.name);
    }

    updatePinButton(pinBtn);
}

function togglePinCommunityChat() {
    const pinBtn = document.getElementById('pinCommunityChat');

    if (pinnedChat && pinnedChat.type === 'community' && pinnedChat.id === currentCommunity.id) {
        unpinChat();
    } else {
        pinChat('community', currentCommunity.id, currentCommunity.name);
    }

    updatePinButton(pinBtn);
}

function pinChat(type, id, name) {
    pinnedChat = { type, id, name };
    window.pinnedChatId = id;
    window.pinnedChatType = type;

    const widget = document.getElementById('pinnedChatWidget');
    const avatar = widget.querySelector('.pinned-chat-avatar');
    const nameEl = widget.querySelector('.pinned-chat-name');

    avatar.textContent = name.charAt(0).toUpperCase();
    nameEl.textContent = name;
    widget.style.display = 'flex';

    showNotification(`${name} pinned`);
}

function unpinChat() {
    pinnedChat = null;
    window.pinnedChatId = null;
    window.pinnedChatType = null;
    document.getElementById('pinnedChatWidget').style.display = 'none';
    showNotification('Chat unpinned');
}

function updatePinButton(btn) {
    if (pinnedChat) {
        btn.classList.add('pinned');
        btn.innerHTML = '<i class="fas fa-thumbtack"></i>';
    } else {
        btn.classList.remove('pinned');
        btn.innerHTML = '<i class="fas fa-thumbtack"></i>';
    }
}

function setupPinnedChatWidget() {
    const widget = document.getElementById('pinnedChatWidget');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    widget.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(window.getComputedStyle(widget).left);
        startTop = parseInt(window.getComputedStyle(widget).top);
        widget.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const newLeft = startLeft + e.clientX - startX;
        const newTop = startTop + e.clientY - startY;

        widget.style.left = Math.max(0, Math.min(window.innerWidth - 60, newLeft)) + 'px';
        widget.style.top = Math.max(0, Math.min(window.innerHeight - 60, newTop)) + 'px';
        widget.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            widget.style.cursor = 'pointer';
        }
    });

    widget.addEventListener('click', (e) => {
        if (!isDragging && pinnedChat) {
            if (pinnedChat.type === 'friend') {
                database.ref(`friends/${window.currentUser.uid}/${pinnedChat.id}`).once('value', (snapshot) => {
                    if (snapshot.exists()) {
                        openFriendChat(pinnedChat.id, snapshot.val());
                    }
                });
            } else if (pinnedChat.type === 'community') {
                database.ref(`userCommunities/${window.currentUser.uid}/${pinnedChat.id}`).once('value', (snapshot) => {
                    if (snapshot.exists()) {
                        openCommunityChat(pinnedChat.id, snapshot.val());
                    }
                });
            }
        }
    });
}

// Friend Info Functions
function showFriendInfo() {
    if (!currentChatFriend) return;

    document.getElementById('friendInfoName').textContent = currentChatFriend.name || 'Unknown';
    document.getElementById('friendInfoEmail').textContent = currentChatFriend.email || 'Not available';
    // Get username from Firebase
    database.ref(`usernames/${currentChatFriend.uid}`).once('value', (snapshot) => {
        const username = snapshot.val();
        document.getElementById('friendInfoUsername').textContent = username ? '@' + username : 'Not available';
    });

    document.getElementById('friendInfoModal').style.display = 'block';
}

function removeFriendFromChat() {
    if (!currentChatFriend || !confirm(`Remove ${currentChatFriend.name} from your friends list?`)) return;

    const updates = {};
    updates[`friends/${window.currentUser.uid}/${currentChatFriend.uid}`] = null;
    updates[`friends/${currentChatFriend.uid}/${window.currentUser.uid}`] = null;

    database.ref().update(updates).then(() => {
        document.getElementById('friendInfoModal').style.display = 'none';
        document.getElementById('friendChatModal').style.display = 'none';
        showNotification(`${currentChatFriend.name} removed from friends`);
        currentChatFriend = null;
    }).catch((error) => {
        showNotification('Error removing friend: ' + error.message);
    });
}

// Pinned Chat Animation Function
function triggerPinnedChatAnimation() {
    const widget = document.getElementById('pinnedChatWidget');
    const avatar = widget.querySelector('.pinned-chat-avatar');

    if (widget.style.display === 'flex') {
        // Add wave animation to avatar
        avatar.classList.add('wave');

        // Add glow animation to widget
        widget.classList.add('new-message');

        // Remove animations after they complete
        setTimeout(() => {
            avatar.classList.remove('wave');
            widget.classList.remove('new-message');
        }, 1000);
    }
}

// Store pinned chat info globally
window.pinnedChatId = null;
window.pinnedChatType = null;

// Custom popup functions
function showCustomPopup(title, message, onConfirm, showCancel = false) {
    document.getElementById('popupTitle').textContent = title;
    document.getElementById('popupMessage').textContent = message;
    document.getElementById('popupCancel').style.display = showCancel ? 'inline-block' : 'none';

    const modal = document.getElementById('customPopupModal');
    modal.style.display = 'block';

    const confirmBtn = document.getElementById('popupConfirm');
    const cancelBtn = document.getElementById('popupCancel');

    const handleConfirm = () => {
        modal.style.display = 'none';
        if (onConfirm) onConfirm();
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    const handleCancel = () => {
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
}

function showShareInput(title, label, onConfirm) {
    document.getElementById('shareInputTitle').textContent = title;
    document.getElementById('shareInputLabel').textContent = label;
    document.getElementById('shareInputField').value = '';

    // Load friends list
    loadShareFriendsList();

    const modal = document.getElementById('shareInputModal');
    modal.style.display = 'block';
    document.getElementById('shareInputField').focus();

    const confirmBtn = document.getElementById('shareInputConfirm');
    const cancelBtn = document.getElementById('shareInputCancel');
    const inputField = document.getElementById('shareInputField');

    const handleConfirm = () => {
        const value = inputField.value.trim();
        if (value) {
            modal.style.display = 'none';
            if (onConfirm) onConfirm(value);
        }
        cleanup();
    };

    const handleCancel = () => {
        modal.style.display = 'none';
        cleanup();
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') handleConfirm();
    };

    const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        inputField.removeEventListener('keypress', handleKeyPress);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    inputField.addEventListener('keypress', handleKeyPress);
}

function loadShareFriendsList() {
    const friendsList = document.getElementById('shareFriendsList');

    if (!window.currentUser) {
        friendsList.innerHTML = '<p class="no-friends">Login to see friends</p>';
        return;
    }

    friendsList.innerHTML = '<p class="loading-friends">Loading friends...</p>';

    database.ref(`friends/${window.currentUser.uid}`).once('value', (snapshot) => {
        const friends = snapshot.val();
        friendsList.innerHTML = '';

        if (!friends) {
            friendsList.innerHTML = '<p class="no-friends">No friends to share with</p>';
            return;
        }

        Object.entries(friends).forEach(([friendUid, friendData]) => {
            const friendItem = document.createElement('div');
            friendItem.className = 'share-friend-item';
            friendItem.innerHTML = `
                <div class="friend-avatar">${friendData.name.charAt(0).toUpperCase()}</div>
                <div class="friend-name">${friendData.name}</div>
            `;

            friendItem.addEventListener('click', () => {
                database.ref(`usernames/${friendUid}`).once('value', (usernameSnapshot) => {
                    const username = usernameSnapshot.val();
                    if (username) {
                        document.getElementById('shareInputField').value = username;
                    }
                });
            });

            friendsList.appendChild(friendItem);
        });
    });
}

function loadFriendRequests() {
    if (!window.currentUser) return;

    database.ref(`friendRequests/${window.currentUser.uid}`).on('value', (snapshot) => {
        const requests = snapshot.val();
        const requestsList = document.getElementById('friendRequestsList');
        const badge = document.getElementById('notificationBadge');
        const requestsSection = document.getElementById('friendRequestsSection');

        if (!requestsList) return;

        requestsList.innerHTML = '';

        if (!requests || Object.keys(requests).length === 0) {
            requestsList.innerHTML = '<p class="no-requests">No friend requests</p>';
            if (badge) badge.style.display = 'none';
            return;
        }

        const requestCount = Object.keys(requests).length;
        if (badge) {
            badge.textContent = requestCount;
            badge.style.display = 'block';
        }

        Object.entries(requests).forEach(([fromUid, requestData]) => {
            const requestItem = document.createElement('div');
            requestItem.className = 'friend-request-item';
            requestItem.innerHTML = `
                <div class="request-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: var(--accent-color); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">${requestData.fromName.charAt(0).toUpperCase()}</div>
                <div class="request-info">
                    <div class="request-name">${requestData.fromName}</div>
                    <div class="request-actions">
                        <button onclick="acceptFriendRequest('${fromUid}', '${requestData.fromName}', '${requestData.fromEmail}', '${requestData.fromPhoto || ''}')" class="btn-accept">Accept</button>
                        <button onclick="rejectFriendRequest('${fromUid}')" class="btn-reject">Reject</button>
                    </div>
                </div>
            `;
            requestsList.appendChild(requestItem);
        });
    });
}
// Set user online status when they login
function setUserOnline() {
    if (!window.currentUser || typeof database === 'undefined') return;

    console.log('Setting user online:', window.currentUser.uid);

    database.ref(`users/${window.currentUser.uid}/status`).set({
        online: true,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        console.log('User status set to online successfully');
    }).catch(error => {
        console.error('Error setting online status:', error);
    });

    // Set offline when user disconnects
    database.ref(`users/${window.currentUser.uid}/status`).onDisconnect().set({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

// Get user online status
function getUserStatus(userId, callback) {
    if (typeof database === 'undefined') {
        callback('offline');
        return;
    }

    database.ref(`users/${userId}/status`).once('value', (snapshot) => {
        const status = snapshot.val();
        console.log('User status for', userId, ':', status);
        if (status && status.online) {
            callback('online');
        } else {
            callback('offline');
        }
    }).catch(error => {
        console.error('Error getting user status:', error);
        callback('offline');
    });
}

// Accept friend request
function acceptFriendRequest(fromUid, fromName, fromEmail, fromPhoto) {
    if (!window.currentUser) return;

    const currentUid = window.currentUser.uid;
    const updates = {};

    // Add to friends list
    updates[`friends/${currentUid}/${fromUid}`] = {
        name: fromName,
        email: fromEmail,
        photo: fromPhoto || '',
        addedAt: firebase.database.ServerValue.TIMESTAMP
    };

    updates[`friends/${fromUid}/${currentUid}`] = {
        name: window.currentUser.displayName,
        email: window.currentUser.email,
        photo: window.currentUser.photoURL || '',
        addedAt: firebase.database.ServerValue.TIMESTAMP
    };

    // Remove friend request
    updates[`friendRequests/${currentUid}/${fromUid}`] = null;

    database.ref().update(updates).then(() => {
        showCustomPopup('Success', `You are now friends with ${fromName}!`);
    }).catch(error => {
        console.error('Error accepting friend request:', error);
        showCustomPopup('Error', 'Failed to accept friend request');
    });
}

// Reject friend request
function rejectFriendRequest(fromUid) {
    if (!window.currentUser) return;

    database.ref(`friendRequests/${window.currentUser.uid}/${fromUid}`).remove()
        .then(() => {
            console.log('Friend request rejected');
        })
        .catch(error => {
            console.error('Error rejecting friend request:', error);
        });
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Initialize Firebase if not already done
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        // Firebase config should be loaded from a separate config file
        console.log('Firebase initialized');
    }

    // Load friend requests if user is logged in
    if (window.currentUser) {
        loadFriendRequests();
        setUserOnline();
    }

    // Set up auth state listener
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                window.currentUser = user;
                loadFriendRequests();
                setUserOnline();
            } else {
                window.currentUser = null;
            }
        });
    }
});