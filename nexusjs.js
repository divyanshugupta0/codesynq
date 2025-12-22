// ===== NexusCode IDE - VS Code Clone using Monaco Editor =====
// Monaco Editor IS the actual VS Code editor engine

// State
const state = {
    workspacePath: null,
    files: new Map(),
    activeFile: null,
    openTabs: [],
    currentPanel: 'explorer',
    sidebarVisible: true,
    panelVisible: true,
    panelMaximized: false,
    sidebarWidth: 250,
    panelHeight: 200,
    isMaximized: false,
    recentFolders: [],
    activeBottomPanel: 'terminal'
};

let monacoEditor = null;
let terminal = null;
let fitAddon = null;

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('NexusCode IDE starting...');

    try {
        await Neutralino.init();
        console.log('Neutralino initialized');
        Neutralino.events.on('windowClose', () => Neutralino.app.exit());
        await loadRecentFolders();
    } catch (err) {
        console.log('Running in browser mode');
    }

    initializeMonaco();
    initializeSystemTerminal();
    initializeUI();
    setupEventListeners();
    // Menu system is handled by menu-system.js
    renderSidebar('explorer');
    renderRecentFolders();

    console.log('NexusCode IDE ready!');
});

// ===== Monaco Editor - The VS Code Engine =====
function initializeMonaco() {
    require.config({
        paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
    });

    require(['vs/editor/editor.main'], function () {
        // VS Code Dark+ theme (exact colors)
        monaco.editor.defineTheme('vs-dark-plus', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
                { token: 'keyword', foreground: '569CD6' },
                { token: 'keyword.control', foreground: 'C586C0' },
                { token: 'string', foreground: 'CE9178' },
                { token: 'string.escape', foreground: 'D7BA7D' },
                { token: 'number', foreground: 'B5CEA8' },
                { token: 'regexp', foreground: 'D16969' },
                { token: 'type', foreground: '4EC9B0' },
                { token: 'class', foreground: '4EC9B0' },
                { token: 'function', foreground: 'DCDCAA' },
                { token: 'variable', foreground: '9CDCFE' },
                { token: 'variable.predefined', foreground: '4FC1FF' },
                { token: 'constant', foreground: '4FC1FF' },
                { token: 'parameter', foreground: '9CDCFE' },
                { token: 'tag', foreground: '569CD6' },
                { token: 'attribute.name', foreground: '9CDCFE' },
                { token: 'attribute.value', foreground: 'CE9178' },
                { token: 'delimiter', foreground: 'D4D4D4' },
                { token: 'delimiter.html', foreground: '808080' },
                { token: 'metatag', foreground: '569CD6' },
            ],
            colors: {
                'editor.background': '#1e1e1e',
                'editor.foreground': '#d4d4d4',
                'editor.lineHighlightBackground': '#2a2d2e',
                'editor.selectionBackground': '#264f78',
                'editor.inactiveSelectionBackground': '#3a3d41',
                'editorCursor.foreground': '#aeafad',
                'editorWhitespace.foreground': '#3b3b3b',
                'editorIndentGuide.background': '#404040',
                'editorIndentGuide.activeBackground': '#707070',
                'editorLineNumber.foreground': '#858585',
                'editorLineNumber.activeForeground': '#c6c6c6',
                'editorBracketMatch.background': '#0064001a',
                'editorBracketMatch.border': '#888888',
                'editor.findMatchBackground': '#515c6a',
                'editor.findMatchHighlightBackground': '#ea5c0055',
                'editorOverviewRuler.border': '#7f7f7f4d',
                'editorGutter.background': '#1e1e1e',
                'editorError.foreground': '#f48771',
                'editorWarning.foreground': '#cca700',
                'editorInfo.foreground': '#75beff',
                'minimap.background': '#1e1e1e',
                'scrollbarSlider.background': '#79797966',
                'scrollbarSlider.hoverBackground': '#646464b3',
                'scrollbarSlider.activeBackground': '#bfbfbf66',
            }
        });

        // Create editor with VS Code-like settings
        monacoEditor = monaco.editor.create(document.getElementById('monacoEditor'), {
            value: '',
            language: 'plaintext',
            theme: 'vs-dark-plus',

            // Font settings
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace",
            fontLigatures: true,
            fontWeight: '400',
            lineHeight: 20,
            letterSpacing: 0,

            // Editor behavior
            automaticLayout: true,
            scrollBeyondLastLine: true,
            smoothScrolling: true,
            cursorBlinking: 'blink',
            cursorSmoothCaretAnimation: 'on',
            cursorStyle: 'line',
            cursorWidth: 2,

            // Minimap
            minimap: {
                enabled: true,
                maxColumn: 120,
                renderCharacters: true,
                showSlider: 'mouseover',
                side: 'right',
                scale: 1
            },

            // Line numbers and decorations
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            glyphMargin: true,
            folding: true,
            foldingHighlight: true,
            foldingStrategy: 'auto',
            showFoldingControls: 'mouseover',

            // Rendering
            renderWhitespace: 'selection',
            renderControlCharacters: false,
            renderLineHighlight: 'all',
            renderLineHighlightOnlyWhenFocus: false,

            // Brackets
            bracketPairColorization: {
                enabled: true,
                independentColorPoolPerBracketType: true
            },
            matchBrackets: 'always',
            guides: {
                bracketPairs: true,
                bracketPairsHorizontal: true,
                highlightActiveBracketPair: true,
                indentation: true,
                highlightActiveIndentation: true
            },

            // Suggestions & IntelliSense
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            quickSuggestionsDelay: 10,
            parameterHints: { enabled: true },

            // Word wrap
            wordWrap: 'off',
            wordWrapColumn: 80,
            wrappingIndent: 'same',

            // Scrollbar
            scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
                useShadows: false,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                verticalScrollbarSize: 14,
                horizontalScrollbarSize: 14,
                arrowSize: 30
            },

            // Other settings
            tabSize: 4,
            insertSpaces: true,
            detectIndentation: true,
            trimAutoWhitespace: true,
            largeFileOptimizations: true,
            padding: { top: 4, bottom: 4 },
            links: true,
            colorDecorators: true,

            // Find widget
            find: {
                addExtraSpaceOnTop: true,
                autoFindInSelection: 'never',
                seedSearchStringFromSelection: 'always'
            },

            // Hover
            hover: {
                enabled: true,
                delay: 300,
                sticky: true
            }
        });

        // Cursor position updates
        monacoEditor.onDidChangeCursorPosition((e) => {
            const position = e.position;
            document.getElementById('cursorPosition').textContent =
                `Ln ${position.lineNumber}, Col ${position.column}`;
        });

        // Selection updates
        monacoEditor.onDidChangeCursorSelection((e) => {
            const selection = e.selection;
            const selectionInfo = document.getElementById('selectionInfo');

            if (!selection.isEmpty()) {
                const startLine = selection.startLineNumber;
                const endLine = selection.endLineNumber;
                const lines = endLine - startLine + 1;
                const model = monacoEditor.getModel();
                const selectedText = model.getValueInRange(selection);
                const chars = selectedText.length;

                selectionInfo.textContent = `(${chars} selected)`;
            } else {
                selectionInfo.textContent = '';
            }
        });

        // Content changes
        monacoEditor.onDidChangeModelContent(() => {
            if (state.activeFile) {
                const fileData = state.files.get(state.activeFile);
                if (fileData) {
                    fileData.modified = fileData.originalContent !== monacoEditor.getValue();
                    renderTabs();
                }
            }
        });

        // Keyboard shortcuts
        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            saveFile();
        });

        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => {
            showCommandPalette();
        });

        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => {
            showCommandPalette('>');
        });

        console.log('Monaco Editor initialized with VS Code theme');

        // Expose editor globally for CodeSynq integration
        window.monacoEditor = monacoEditor;
        window.editor = monacoEditor; // Alias for CodeSynq compatibility
    });
}

// ===== System Terminal Integration =====
let terminalProcess = null;
let terminalOutput = '';

function initializeSystemTerminal() {
    const terminalContainer = document.getElementById('terminalContainer');
    if (!terminalContainer) {
        console.log('Terminal container not available');
        return;
    }

    // Create terminal UI
    terminalContainer.innerHTML = `
        <div class="system-terminal">
            <div class="terminal-output" id="terminalOutput"></div>
            <div class="terminal-input-line">
                <span class="terminal-prompt" id="terminalPrompt">$</span>
                <input type="text" class="terminal-command-input" id="terminalCommandInput" placeholder="Type command...">
            </div>
        </div>
    `;

    const input = document.getElementById('terminalCommandInput');
    const output = document.getElementById('terminalOutput');
    const prompt = document.getElementById('terminalPrompt');

    // Set initial prompt
    updateTerminalPrompt();

    // Welcome message
    appendTerminalOutput('╔════════════════════════════════════════════╗', 'info');
    appendTerminalOutput('║     NexusCode System Terminal              ║', 'info');
    appendTerminalOutput('╚════════════════════════════════════════════╝', 'info');
    appendTerminalOutput('', 'info');
    appendTerminalOutput('Type commands to execute on your system.', 'muted');
    appendTerminalOutput('Type "help" for available commands.', 'muted');
    appendTerminalOutput('', 'info');

    // Handle command input
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const command = input.value.trim();
            if (command) {
                await executeSystemCommand(command);
                input.value = '';
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            // TODO: Add command history
        }
    });
}

async function updateTerminalPrompt() {
    const prompt = document.getElementById('terminalPrompt');
    if (!prompt) return;

    try {
        const cwd = state.workspacePath || await Neutralino.os.getPath('downloads');
        const parts = cwd.split(/[/\\]/);
        const currentDir = parts[parts.length - 1] || parts[parts.length - 2] || '~';
        prompt.textContent = `${currentDir} $`;
        prompt.style.color = '#4EC9B0';
    } catch (err) {
        prompt.textContent = '$';
    }
}

async function executeSystemCommand(command) {
    const input = document.getElementById('terminalCommandInput');

    // Echo command
    appendTerminalOutput(`$ ${command}`, 'command');

    // Handle built-in commands
    const cmd = command.split(' ')[0].toLowerCase();

    switch (cmd) {
        case 'clear':
        case 'cls':
            document.getElementById('terminalOutput').innerHTML = '';
            return;

        case 'help':
            appendTerminalOutput('NexusCode Terminal - System Commands:', 'info');
            appendTerminalOutput('  clear, cls  - Clear terminal', 'muted');
            appendTerminalOutput('  cd <dir>    - Change directory', 'muted');
            appendTerminalOutput('  pwd         - Print working directory', 'muted');
            appendTerminalOutput('  exit        - Close terminal', 'muted');
            appendTerminalOutput('', 'muted');
            appendTerminalOutput('All other commands are executed on your system shell.', 'muted');
            return;

        case 'pwd':
            appendTerminalOutput(state.workspacePath || 'No workspace folder open', 'output');
            return;

        case 'cd':
            const newPath = command.substring(3).trim();
            if (newPath) {
                try {
                    // Verify path exists
                    const absolutePath = newPath.startsWith('/') || newPath.match(/^[A-Za-z]:/)
                        ? newPath
                        : `${state.workspacePath}/${newPath}`;

                    await Neutralino.filesystem.readDirectory(absolutePath);
                    state.workspacePath = absolutePath;
                    updateTerminalPrompt();
                    appendTerminalOutput(`Changed directory to: ${absolutePath}`, 'success');

                    // Refresh file explorer if visible
                    if (state.currentPanel === 'explorer') {
                        renderSidebar('explorer');
                    }
                } catch (err) {
                    appendTerminalOutput(`Error: Directory not found - ${newPath}`, 'error');
                }
            } else {
                appendTerminalOutput(state.workspacePath || 'No workspace', 'output');
            }
            return;

        case 'exit':
            appendTerminalOutput('Use Ctrl+J to hide the terminal panel', 'muted');
            return;
    }

    // Execute system command
    try {
        appendTerminalOutput('Executing...', 'muted');

        const result = await Neutralino.os.execCommand(command, {
            background: false,
            stdIn: ''
        });

        if (result.stdOut) {
            appendTerminalOutput(result.stdOut, 'output');
        }
        if (result.stdErr) {
            appendTerminalOutput(result.stdErr, 'error');
        }
        if (result.exitCode !== 0) {
            appendTerminalOutput(`Process exited with code: ${result.exitCode}`, 'error');
        }

    } catch (err) {
        appendTerminalOutput(`Error executing command: ${err.message}`, 'error');
        console.error('Terminal command error:', err);
    }
}

function appendTerminalOutput(text, type = 'output') {
    const output = document.getElementById('terminalOutput');
    if (!output) return;

    const line = document.createElement('div');
    line.className = `terminal-line terminal-${type}`;
    line.textContent = text;
    output.appendChild(line);

    // Auto-scroll to bottom
    output.scrollTop = output.scrollHeight;
}


// ===== UI Initialization =====
function initializeUI() {
    // Activity bar buttons
    document.querySelectorAll('.activity-btn[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.dataset.panel;
            setActivePanel(panel);
        });
    });

    // Panel tabs
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            setActiveBottomPanel(tab.dataset.panel);
        });
    });

    // Set terminal as default bottom panel
    setActiveBottomPanel('terminal');

    // Set explorer as default panel on load
    setActivePanel('explorer');
}

// ===== Panel Management =====
function setActivePanel(panel) {
    state.currentPanel = panel;

    document.querySelectorAll('.activity-btn[data-panel]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panel === panel);
    });

    renderSidebar(panel);
}

function setActiveBottomPanel(panel) {
    state.activeBottomPanel = panel;

    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.panel === panel);
    });

    document.querySelectorAll('.panel-view').forEach(view => {
        view.classList.remove('active');
    });

    const viewId = panel + 'View';
    const view = document.getElementById(viewId);
    if (view) {
        view.classList.add('active');
    }

    // Fit terminal when switching to it
    if (panel === 'terminal' && fitAddon) {
        setTimeout(() => fitAddon.fit(), 50);
    }
}

function toggleSidebar() {
    state.sidebarVisible = !state.sidebarVisible;
    document.getElementById('sidebar').classList.toggle('hidden', !state.sidebarVisible);
}

function togglePanel() {
    state.panelVisible = !state.panelVisible;
    document.getElementById('bottomPanel').classList.toggle('hidden', !state.panelVisible);
    if (state.panelVisible && fitAddon) {
        setTimeout(() => fitAddon.fit(), 50);
    }
}

// ===== Sidebar Rendering =====
function renderSidebar(panel) {
    const container = document.getElementById('sidebarContent');

    switch (panel) {
        case 'explorer':
            renderExplorerPanel(container);
            break;
        case 'search':
            renderSearchPanel(container);
            break;
        case 'git':
            renderGitPanel(container);
            break;
        case 'debug':
            renderDebugPanel(container);
            break;
        case 'extensions':
            renderExtensionsPanel(container);
            break;
        case 'ai':
            renderAIPanel(container);
            break;
    }
}

function renderAIPanel(container) {
    container.innerHTML = `
        <div class="sidebar-header">
            <span>AI Assistant</span>
        </div>
        <div class="ai-panel-content">
            <div class="ai-empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A1.5 1.5 0 0 0 6 14.5 1.5 1.5 0 0 0 7.5 16 1.5 1.5 0 0 0 9 14.5 1.5 1.5 0 0 0 7.5 13m9 0a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.5 1.5 1.5 0 0 0-1.5-1.5z" />
                </svg>
                <h3>AI Assistant</h3>
                <p>AI functionality coming soon!</p>
                <p class="ai-subtitle">This panel will help you with code explanations, debugging, and optimization.</p>
            </div>
        </div>
    `;
}


function renderExplorerPanel(container) {
    container.innerHTML = `
        <div class="sidebar-header">
            <span>Explorer</span>
            <div class="sidebar-actions">
                <button class="sidebar-action" id="newFileBtn" title="New File">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                </button>
                <button class="sidebar-action" id="newFolderBtn" title="New Folder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                </button>
                <button class="sidebar-action" id="refreshBtn" title="Refresh">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                        <path d="M3 3v5h5"/>
                    </svg>
                </button>
                <button class="sidebar-action" id="collapseAllBtn" title="Collapse All">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="4 14 10 14 10 20"/>
                        <polyline points="20 10 14 10 14 4"/>
                        <line x1="14" y1="10" x2="21" y2="3"/>
                        <line x1="3" y1="21" x2="10" y2="14"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="file-tree" id="fileTree">
            ${state.workspacePath ? '' : `
                <div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">
                    <p style="margin-bottom: 12px;">No folder opened</p>
                    <button class="welcome-link" id="explorerOpenFolder" style="justify-content: center;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                        Open Folder
                    </button>
                </div>
            `}
        </div>
    `;

    // Event listeners
    document.getElementById('newFileBtn')?.addEventListener('click', createNewFile);
    document.getElementById('newFolderBtn')?.addEventListener('click', createNewFolder);
    document.getElementById('refreshBtn')?.addEventListener('click', refreshFileTree);
    document.getElementById('explorerOpenFolder')?.addEventListener('click', openFolder);

    if (state.workspacePath) {
        loadFileTree(state.workspacePath, document.getElementById('fileTree'));
    }
}

function renderSearchPanel(container) {
    container.innerHTML = `
        <div class="sidebar-header">Search</div>
        <div style="padding: 8px;">
            <input type="text" placeholder="Search" style="width: 100%; padding: 6px 8px; background: var(--vscode-input-background); border: 1px solid transparent; border-radius: 2px; color: var(--vscode-foreground);">
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <input type="text" placeholder="files to include" style="flex: 1; padding: 4px 8px; background: var(--vscode-input-background); border: 1px solid transparent; border-radius: 2px; color: var(--vscode-foreground); font-size: 12px;">
            </div>
        </div>
    `;
}

function renderGitPanel(container) {
    container.innerHTML = `
        <div class="sidebar-header">Source Control</div>
        <div style="padding: 8px;">
            <input type="text" placeholder="Message (press Enter to commit)" style="width: 100%; padding: 6px 8px; background: var(--vscode-input-background); border: 1px solid transparent; border-radius: 2px; color: var(--vscode-foreground);">
            <div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">
                No source control providers registered.
            </div>
        </div>
    `;
}

function renderDebugPanel(container) {
    container.innerHTML = `
        <div class="sidebar-header">Run and Debug</div>
        <div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">
            <p style="margin-bottom: 16px;">To customize Run and Debug create a launch.json file.</p>
            <button class="welcome-link" style="justify-content: center;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Run and Debug
            </button>
        </div>
    `;
}

function renderExtensionsPanel(container) {
    container.innerHTML = `
        <div class="sidebar-header">Extensions</div>
        <div style="padding: 8px;">
            <input type="text" placeholder="Search Extensions in Marketplace" style="width: 100%; padding: 6px 8px; background: var(--vscode-input-background); border: 1px solid transparent; border-radius: 2px; color: var(--vscode-foreground);">
            <div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">
                <p>No extensions installed.</p>
            </div>
        </div>
    `;
}

// ===== File Tree =====
async function loadFileTree(dirPath, container, depth = 0) {
    try {
        const entries = await Neutralino.filesystem.readDirectory(dirPath);

        entries.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'DIRECTORY' ? -1 : 1;
            return a.entry.localeCompare(b.entry);
        });

        for (const entry of entries) {
            if (entry.entry.startsWith('.') && entry.entry !== '.gitignore') continue;

            const itemPath = `${dirPath}/${entry.entry}`;
            const isDirectory = entry.type === 'DIRECTORY';

            const item = document.createElement('div');
            item.className = 'tree-item';
            item.dataset.path = itemPath;
            item.dataset.type = isDirectory ? 'directory' : 'file';

            // Indentation
            let indent = '';
            for (let i = 0; i < depth; i++) {
                indent += '<span class="tree-indent"></span>';
            }

            item.innerHTML = `
                ${indent}
                ${isDirectory ? `
                    <span class="tree-arrow">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </span>
                ` : '<span class="tree-indent"></span>'}
                <span class="tree-icon ${getIconClass(entry.entry, isDirectory)}">
                    ${getFileIcon(entry.entry, isDirectory)}
                </span>
                <span class="tree-label">${entry.entry}</span>
            `;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                handleTreeClick(item, itemPath, isDirectory, depth);
            });

            item.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (!isDirectory) {
                    openFile(itemPath);
                }
            });

            container.appendChild(item);
        }
    } catch (err) {
        console.error('Error loading file tree:', err);
    }
}

function handleTreeClick(item, path, isDirectory, depth) {
    // Select item
    document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');

    if (isDirectory) {
        const isExpanded = item.classList.toggle('expanded');

        // Remove children
        let next = item.nextElementSibling;
        while (next && next.querySelectorAll('.tree-indent').length > depth) {
            const toRemove = next;
            next = next.nextElementSibling;
            toRemove.remove();
        }

        // Load children if expanding
        if (isExpanded) {
            const tempContainer = document.createDocumentFragment();
            loadFileTree(path, {
                appendChild: (child) => {
                    item.insertAdjacentElement('afterend', child);
                }
            }, depth + 1);
        }
    }
}

// ===== File Operations =====
async function openFile(filePath) {
    try {
        // Check if already open
        if (state.files.has(filePath)) {
            state.activeFile = filePath;
            const fileData = state.files.get(filePath);
            monacoEditor.setValue(fileData.content);
            const lang = getMonacoLanguage(filePath);
            monaco.editor.setModelLanguage(monacoEditor.getModel(), lang);
            updateEditorState(filePath);
            renderTabs();
            return;
        }

        const content = await Neutralino.filesystem.readFile(filePath);

        state.files.set(filePath, {
            content: content,
            originalContent: content,
            modified: false,
            language: getMonacoLanguage(filePath)
        });

        if (!state.openTabs.includes(filePath)) {
            state.openTabs.push(filePath);
        }

        state.activeFile = filePath;
        monacoEditor.setValue(content);

        const lang = getMonacoLanguage(filePath);
        monaco.editor.setModelLanguage(monacoEditor.getModel(), lang);

        updateEditorState(filePath);
        renderTabs();
        renderBreadcrumb(filePath);
        showEditor();

    } catch (err) {
        console.error('Error opening file:', err);
        showToast(`Failed to open file: ${err.message}`, 'error');
    }
}

async function saveFile() {
    if (!state.activeFile) return;

    try {
        const content = monacoEditor.getValue();
        await Neutralino.filesystem.writeFile(state.activeFile, content);

        const fileData = state.files.get(state.activeFile);
        if (fileData) {
            fileData.content = content;
            fileData.originalContent = content;
            fileData.modified = false;
        }

        renderTabs();
        showToast('File saved', 'success');
    } catch (err) {
        console.error('Error saving file:', err);
        showToast(`Failed to save: ${err.message}`, 'error');
    }
}

async function openFolder() {
    try {
        const result = await Neutralino.os.showFolderDialog('Open Folder');
        if (result) {
            state.workspacePath = result;
            const folderName = result.split(/[/\\]/).pop();
            document.getElementById('workspaceName').textContent = folderName;
            document.title = `${folderName} - NexusCode`;

            addToRecent(result);
            renderSidebar('explorer');
            showToast(`Opened ${folderName}`, 'info');
        }
    } catch (err) {
        console.error('Error opening folder:', err);
        showToast('Failed to open folder', 'error');
    }
}

async function createNewFile() {
    if (!state.workspacePath) {
        showToast('Open a folder first', 'warning');
        return;
    }

    const name = prompt('New file name:');
    if (!name) return;

    try {
        const path = `${state.workspacePath}/${name}`;
        await Neutralino.filesystem.writeFile(path, '');
        refreshFileTree();
        openFile(path);
        showToast(`Created ${name}`, 'success');
    } catch (err) {
        showToast(`Failed to create file: ${err.message}`, 'error');
    }
}

async function createNewFolder() {
    if (!state.workspacePath) {
        showToast('Open a folder first', 'warning');
        return;
    }

    const name = prompt('New folder name:');
    if (!name) return;

    try {
        const path = `${state.workspacePath}/${name}`;
        await Neutralino.filesystem.createDirectory(path);
        refreshFileTree();
        showToast(`Created ${name}`, 'success');
    } catch (err) {
        showToast(`Failed to create folder: ${err.message}`, 'error');
    }
}

function refreshFileTree() {
    renderSidebar('explorer');
}

// ===== Editor State =====
function updateEditorState(filePath) {
    const lang = getMonacoLanguage(filePath);
    const displayName = getLanguageDisplayName(lang);

    document.getElementById('languageMode').textContent = displayName;
    document.getElementById('encoding').textContent = 'UTF-8';
    document.getElementById('eolType').textContent = 'LF';
}

function showEditor() {
    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('monacoEditor').classList.add('visible');
}

function showWelcome() {
    document.getElementById('welcomeScreen').classList.remove('hidden');
    document.getElementById('monacoEditor').classList.remove('visible');
}

// ===== Tabs =====
function renderTabs() {
    const tabsBar = document.getElementById('tabsBar');
    tabsBar.innerHTML = '';

    state.openTabs.forEach(path => {
        const fileData = state.files.get(path);
        const fileName = path.split(/[/\\]/).pop();
        const isActive = path === state.activeFile;

        const tab = document.createElement('div');
        tab.className = `tab${isActive ? ' active' : ''}${fileData?.modified ? ' modified' : ''}`;

        tab.innerHTML = `
            <span class="tab-icon ${getIconClass(fileName, false)}">${getFileIcon(fileName, false)}</span>
            <span class="tab-label">${fileName}</span>
            <button class="tab-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        tab.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                openFile(path);
            }
        });

        tab.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(path);
        });

        tabsBar.appendChild(tab);
    });
}

function closeTab(path) {
    const index = state.openTabs.indexOf(path);
    if (index === -1) return;

    state.openTabs.splice(index, 1);
    state.files.delete(path);

    if (state.activeFile === path) {
        if (state.openTabs.length > 0) {
            openFile(state.openTabs[Math.min(index, state.openTabs.length - 1)]);
        } else {
            state.activeFile = null;
            showWelcome();
        }
    }

    renderTabs();
}

// ===== Breadcrumb =====
function renderBreadcrumb(filePath) {
    const breadcrumb = document.getElementById('breadcrumbBar');
    const parts = filePath.split(/[/\\]/);

    breadcrumb.innerHTML = parts.map((part, i) => `
        <span class="breadcrumb-item">${part}</span>
        ${i < parts.length - 1 ? '<span class="breadcrumb-separator">›</span>' : ''}
    `).join('');
}

// ===== Recent Folders =====
async function loadRecentFolders() {
    try {
        const data = await Neutralino.storage.getData('recentFolders');
        state.recentFolders = JSON.parse(data) || [];
    } catch {
        state.recentFolders = [];
    }
}

async function addToRecent(path) {
    state.recentFolders = state.recentFolders.filter(p => p !== path);
    state.recentFolders.unshift(path);
    state.recentFolders = state.recentFolders.slice(0, 10);

    try {
        await Neutralino.storage.setData('recentFolders', JSON.stringify(state.recentFolders));
    } catch { }

    renderRecentFolders();
}

function renderRecentFolders() {
    const list = document.getElementById('recentList');
    if (!list) return;

    if (state.recentFolders.length === 0) {
        list.innerHTML = '<p class="no-recent">No recent folders</p>';
        return;
    }

    list.innerHTML = state.recentFolders.slice(0, 5).map(path => {
        const name = path.split(/[/\\]/).pop();
        return `
            <button class="welcome-link" data-path="${path}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                ${name}
            </button>
        `;
    }).join('');

    list.querySelectorAll('[data-path]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.workspacePath = btn.dataset.path;
            const name = btn.dataset.path.split(/[/\\]/).pop();
            document.getElementById('workspaceName').textContent = name;
            document.title = `${name} - NexusCode`;
            renderSidebar('explorer');
        });
    });
}

// ===== Command Palette =====
function showCommandPalette(prefix = '') {
    const overlay = document.getElementById('commandPaletteOverlay');
    const input = document.getElementById('commandInput');

    overlay.classList.add('visible');
    input.value = prefix;
    input.focus();

    renderCommands(prefix);
}

function hideCommandPalette() {
    document.getElementById('commandPaletteOverlay').classList.remove('visible');
}

function renderCommands(query) {
    const results = document.getElementById('commandResults');

    const commands = [
        { icon: 'folder', label: 'Open Folder...', action: openFolder, shortcut: 'Ctrl+K Ctrl+O' },
        { icon: 'file', label: 'New File', action: createNewFile, shortcut: 'Ctrl+N' },
        { icon: 'save', label: 'Save', action: saveFile, shortcut: 'Ctrl+S' },
        { icon: 'toggle', label: 'Toggle Sidebar', action: toggleSidebar, shortcut: 'Ctrl+B' },
        { icon: 'toggle', label: 'Toggle Panel', action: togglePanel, shortcut: 'Ctrl+J' },
        { icon: 'terminal', label: 'Focus Terminal', action: () => setActiveBottomPanel('terminal'), shortcut: 'Ctrl+`' },
    ];

    const filtered = query.startsWith('>')
        ? commands.filter(c => c.label.toLowerCase().includes(query.slice(1).toLowerCase()))
        : commands;

    results.innerHTML = filtered.map(cmd => `
        <div class="command-item" data-label="${cmd.label}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="command-item-label">${cmd.label}</span>
            <span class="command-item-shortcut">${cmd.shortcut || ''}</span>
        </div>
    `).join('');

    results.querySelectorAll('.command-item').forEach((item, i) => {
        item.addEventListener('click', () => {
            filtered[i].action();
            hideCommandPalette();
        });
    });
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');

    const icons = {
        success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
        error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
        warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${icons[type] || icons.info}
        </svg>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 200);
    }, 3000);
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Window controls
    document.getElementById('minimizeBtn')?.addEventListener('click', async () => {
        try { await Neutralino.window.minimize(); } catch { }
    });

    document.getElementById('maximizeBtn')?.addEventListener('click', async () => {
        try {
            if (state.isMaximized) {
                await Neutralino.window.unmaximize();
            } else {
                await Neutralino.window.maximize();
            }
            state.isMaximized = !state.isMaximized;
        } catch { }
    });

    document.getElementById('closeBtn')?.addEventListener('click', async () => {
        try { await Neutralino.app.exit(); } catch { window.close(); }
    });

    // Layout toggles
    document.getElementById('toggleSidebar')?.addEventListener('click', toggleSidebar);
    document.getElementById('togglePanel')?.addEventListener('click', togglePanel);
    document.getElementById('closePanelBtn')?.addEventListener('click', togglePanel);

    // Command palette
    document.getElementById('commandPaletteTrigger')?.addEventListener('click', () => showCommandPalette());
    document.getElementById('commandPaletteOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'commandPaletteOverlay') hideCommandPalette();
    });
    document.getElementById('commandInput')?.addEventListener('input', (e) => renderCommands(e.target.value));
    document.getElementById('commandInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideCommandPalette();
    });

    // Welcome screen actions
    document.getElementById('welcomeNewFile')?.addEventListener('click', createNewFile);
    document.getElementById('welcomeOpenFile')?.addEventListener('click', openFolder);
    document.getElementById('welcomeOpenFolder')?.addEventListener('click', openFolder);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
        if (e.ctrlKey && e.key === 'j') {
            e.preventDefault();
            togglePanel();
        }
        if (e.ctrlKey && e.key === '`') {
            e.preventDefault();
            if (!state.panelVisible) togglePanel();
            setActiveBottomPanel('terminal');
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            showCommandPalette('>');
        }
        if (e.ctrlKey && e.key === 'p') {
            e.preventDefault();
            showCommandPalette();
        }
        if (e.key === 'Escape') {
            hideCommandPalette();
        }
    });

    // Sidebar resize
    setupResize('sidebarResizer', 'sidebar', 'width', 150, 500);
    setupResize('panelResizer', 'bottomPanel', 'height', 100, 500);
}

function setupResize(resizerId, targetId, property, min, max) {
    const resizer = document.getElementById(resizerId);
    const target = document.getElementById(targetId);
    if (!resizer || !target) return;

    let isResizing = false;
    let startPos = 0;
    let startSize = 0;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startPos = property === 'width' ? e.clientX : e.clientY;
        startSize = property === 'width' ? target.offsetWidth : target.offsetHeight;
        document.body.style.cursor = property === 'width' ? 'col-resize' : 'row-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const diff = property === 'width'
            ? e.clientX - startPos
            : startPos - e.clientY;

        const newSize = Math.max(min, Math.min(max, startSize + diff));
        target.style[property] = `${newSize}px`;

        if (fitAddon) fitAddon.fit();
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = '';
    });
}

// ===== Utility Functions =====
function getFileIcon(filename, isDirectory) {
    if (isDirectory) {
        return `<svg viewBox="0 0 24 24" fill="currentColor" class="icon-folder">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>`;
    }

    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
    </svg>`;
}

function getIconClass(filename, isDirectory) {
    if (isDirectory) return 'icon-folder';

    const ext = filename.split('.').pop().toLowerCase();
    const classes = {
        js: 'icon-js', jsx: 'icon-js', mjs: 'icon-js',
        ts: 'icon-ts', tsx: 'icon-ts',
        html: 'icon-html', htm: 'icon-html',
        css: 'icon-css', scss: 'icon-css', less: 'icon-css',
        json: 'icon-json',
        md: 'icon-md',
        py: 'icon-py',
        gitignore: 'icon-git'
    };

    return classes[ext] || 'icon-file';
}

function getMonacoLanguage(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const languages = {
        // JavaScript/TypeScript
        js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
        ts: 'typescript', tsx: 'typescript', mts: 'typescript',

        // Web
        html: 'html', htm: 'html', xhtml: 'html',
        css: 'css', scss: 'scss', sass: 'scss', less: 'less',
        vue: 'html', svelte: 'html',

        // Data formats
        json: 'json', jsonc: 'json',
        xml: 'xml', svg: 'xml', xsl: 'xml',
        yaml: 'yaml', yml: 'yaml',
        toml: 'ini', ini: 'ini',

        // Documentation
        md: 'markdown', markdown: 'markdown', mdx: 'markdown',
        txt: 'plaintext', log: 'plaintext',

        // Python
        py: 'python', pyw: 'python', pyi: 'python',

        // Java/Kotlin
        java: 'java',
        kt: 'kotlin', kts: 'kotlin',

        // C/C++/C#
        c: 'c', h: 'c',
        cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
        cs: 'csharp',

        // Other languages
        go: 'go',
        rs: 'rust',
        rb: 'ruby', rake: 'ruby', gemspec: 'ruby',
        php: 'php', phtml: 'php',
        swift: 'swift',
        r: 'r',
        lua: 'lua',
        perl: 'perl', pl: 'perl', pm: 'perl',

        // Database
        sql: 'sql', mysql: 'sql', pgsql: 'sql',

        // Shell
        sh: 'shell', bash: 'shell', zsh: 'shell',
        ps1: 'powershell', psm1: 'powershell',
        bat: 'bat', cmd: 'bat',

        // Config files
        dockerfile: 'dockerfile',
        makefile: 'makefile',
        cmake: 'cmake',

        // GraphQL
        graphql: 'graphql', gql: 'graphql'
    };

    // Also check for special filenames
    const filename = filePath.split(/[/\\]/).pop().toLowerCase();
    const specialFiles = {
        'dockerfile': 'dockerfile',
        'makefile': 'makefile',
        'cmakelists.txt': 'cmake',
        '.gitignore': 'ignore',
        '.dockerignore': 'ignore',
        '.env': 'dotenv',
        '.env.local': 'dotenv',
        '.env.development': 'dotenv',
        '.env.production': 'dotenv'
    };

    return specialFiles[filename] || languages[ext] || 'plaintext';
}

function getLanguageDisplayName(lang) {
    const names = {
        javascript: 'JavaScript',
        typescript: 'TypeScript',
        html: 'HTML',
        css: 'CSS',
        scss: 'SCSS',
        less: 'Less',
        json: 'JSON',
        markdown: 'Markdown',
        python: 'Python',
        java: 'Java',
        kotlin: 'Kotlin',
        cpp: 'C++',
        c: 'C',
        csharp: 'C#',
        go: 'Go',
        rust: 'Rust',
        ruby: 'Ruby',
        php: 'PHP',
        swift: 'Swift',
        r: 'R',
        lua: 'Lua',
        perl: 'Perl',
        sql: 'SQL',
        xml: 'XML',
        yaml: 'YAML',
        ini: 'INI',
        shell: 'Shell Script',
        powershell: 'PowerShell',
        bat: 'Batch',
        dockerfile: 'Dockerfile',
        makefile: 'Makefile',
        cmake: 'CMake',
        graphql: 'GraphQL',
        ignore: 'Ignore File',
        dotenv: 'Environment',
        plaintext: 'Plain Text'
    };
    return names[lang] || lang.charAt(0).toUpperCase() + lang.slice(1);
}

// ===== Menu System =====
function setupMenus() {
    const menuItems = document.querySelectorAll('.menu-item');

    menuItems.forEach(menuItem => {
        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            const menuType = menuItem.dataset.menu;
            showMenu(menuType, menuItem);
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', () => {
        hideAllMenus();
    });
}

function showMenu(menuType, triggerElement) {
    hideAllMenus();

    const menu = createMenuDropdown(menuType);
    if (!menu) return;

    // Position menu below trigger
    const rect = triggerElement.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom}px`;
    menu.classList.add('visible');

    document.body.appendChild(menu);
}

function hideAllMenus() {
    document.querySelectorAll('.menu-dropdown').forEach(m => m.remove());
}

function createMenuDropdown(menuType) {
    const menu = document.createElement('div');
    menu.className = 'menu-dropdown';
    menu.addEventListener('click', (e) => e.stopPropagation());

    const menus = {
        file: [
            { label: 'New File', shortcut: 'Ctrl+N', action: createNewFile },
            { label: 'New Folder', action: createNewFolder },
            { separator: true },
            { label: 'Open File...', shortcut: 'Ctrl+O', action: openFolder },
            { label: 'Open Folder...', shortcut: 'Ctrl+K Ctrl+O', action: openFolder },
            { separator: true },
            { label: 'Save', shortcut: 'Ctrl+S', action: saveFile },
            { label: 'Save All', shortcut: 'Ctrl+K S', action: saveAllFiles },
            { separator: true },
            { label: 'Close Editor', shortcut: 'Ctrl+W', action: () => state.activeFile && closeTab(state.activeFile) },
            { label: 'Close All Editors', action: closeAllTabs },
            { separator: true },
            {
                label: 'Exit', action: async () => {
                    try { await Neutralino.app.exit(); } catch { window.close(); }
                }
            }
        ],
        edit: [
            { label: 'Undo', shortcut: 'Ctrl+Z', action: () => monacoEditor?.trigger('keyboard', 'undo') },
            { label: 'Redo', shortcut: 'Ctrl+Y', action: () => monacoEditor?.trigger('keyboard', 'redo') },
            { separator: true },
            { label: 'Cut', shortcut: 'Ctrl+X' },
            { label: 'Copy', shortcut: 'Ctrl+C' },
            { label: 'Paste', shortcut: 'Ctrl+V' },
            { separator: true },
            { label: 'Find', shortcut: 'Ctrl+F', action: () => monacoEditor?.trigger('keyboard', 'actions.find') },
            { label: 'Replace', shortcut: 'Ctrl+H', action: () => monacoEditor?.trigger('keyboard', 'editor.action.startFindReplaceAction') }
        ],
        view: [
            { label: 'Command Palette...', shortcut: 'Ctrl+Shift+P', action: () => showCommandPalette('>') },
            { separator: true },
            { label: 'Explorer', shortcut: 'Ctrl+Shift+E', action: () => setActivePanel('explorer') },
            { label: 'Search', shortcut: 'Ctrl+Shift+F', action: () => setActivePanel('search') },
            { label: 'Source Control', shortcut: 'Ctrl+Shift+G', action: () => setActivePanel('git') },
            { label: 'Extensions', shortcut: 'Ctrl+Shift+X', action: () => setActivePanel('extensions') },
            { separator: true },
            { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: toggleSidebar },
            { label: 'Toggle Panel', shortcut: 'Ctrl+J', action: togglePanel },
            { separator: true },
            {
                label: 'Terminal', shortcut: 'Ctrl+`', action: () => {
                    if (!state.panelVisible) togglePanel();
                    setActiveBottomPanel('terminal');
                }
            }
        ],
        terminal: [
            {
                label: 'New Terminal', shortcut: 'Ctrl+Shift+`', action: () => {
                    if (!state.panelVisible) togglePanel();
                    setActiveBottomPanel('terminal');
                    document.getElementById('terminalCommandInput')?.focus();
                }
            },
            { separator: true },
            {
                label: 'Clear Terminal', action: () => {
                    document.getElementById('terminalOutput').innerHTML = '';
                }
            }
        ],
        help: [
            { label: 'Show All Commands', shortcut: 'Ctrl+Shift+P', action: () => showCommandPalette('>') },
            { separator: true },
            {
                label: 'About NexusCode', action: () => {
                    showToast('NexusCode IDE v1.0 - Built with Monaco Editor & Neutralino', 'info');
                }
            }
        ]
    };

    const items = menus[menuType] || [];

    menu.innerHTML = items.map(item => {
        if (item.separator) {
            return '<div class="menu-separator"></div>';
        }

        return `
            <div class="menu-dropdown-item" ${item.action ? 'data-has-action="true"' : ''}>
                <span class="menu-item-label">${item.label}</span>
                ${item.shortcut ? `<span class="menu-item-shortcut">${item.shortcut}</span>` : ''}
            </div>
        `;
    }).join('');

    // Add click handlers
    menu.querySelectorAll('.menu-dropdown-item[data-has-action]').forEach((item, index) => {
        const actionItems = items.filter(i => !i.separator && i.action);
        const menuItem = actionItems[index];
        if (menuItem && menuItem.action) {
            item.addEventListener('click', () => {
                menuItem.action();
                hideAllMenus();
            });
        }
    });

    return menu;
}

async function saveAllFiles() {
    for (const [path, fileData] of state.files) {
        if (fileData.modified) {
            try {
                await Neutralino.filesystem.writeFile(path, fileData.content);
                fileData.originalContent = fileData.content;
                fileData.modified = false;
            } catch (err) {
                showToast(`Failed to save ${path.split(/[/\\]/).pop()}`, 'error');
            }
        }
    }
    renderTabs();
    showToast('All files saved', 'success');
}

function closeAllTabs() {
    state.openTabs = [];
    state.files.clear();
    state.activeFile = null;
    renderTabs();
    showWelcome();
}

// ===== Dropdown Management =====
// Handle status bar notification dropdown
document.addEventListener('DOMContentLoaded', () => {
    const statusBarNotif = document.getElementById('statusBarNotification');
    const statusNotifDropdown = document.getElementById('statusNotificationDropdown');
    const dropdownOverlay = document.getElementById('dropdownBlurOverlay');

    if (statusBarNotif && statusNotifDropdown) {
        // Toggle dropdown on click
        statusBarNotif.addEventListener('click', (e) => {
            e.stopPropagation();

            // Close all other dropdowns
            closeAllDropdowns();

            // Toggle this dropdown
            const isActive = statusNotifDropdown.classList.toggle('active');

            if (isActive) {
                dropdownOverlay?.classList.add('active');
            } else {
                dropdownOverlay?.classList.remove('active');
            }
        });
    }

    // Handle title bar dropdowns
    setupTitleBarDropdowns();

    // Close dropdowns when clicking outside
    if (dropdownOverlay) {
        dropdownOverlay.addEventListener('click', closeAllDropdowns);
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllDropdowns();
        }
    });
});

function setupTitleBarDropdowns() {
    // Notifications dropdown in title bar
    const notifBtn = document.getElementById('notificationsBtn');
    const notifMenu = document.getElementById('notificationsMenu');

    if (notifBtn && notifMenu) {
        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllDropdowns();
            notifMenu.classList.toggle('active');
            document.getElementById('dropdownBlurOverlay')?.classList.toggle('active', notifMenu.classList.contains('active'));
        });
    }

    // Friends dropdown
    const friendsBtn = document.getElementById('friendsBtn');
    const friendsMenu = document.getElementById('friendsMenu');

    if (friendsBtn && friendsMenu) {
        friendsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllDropdowns();
            friendsMenu.classList.toggle('active');
            document.getElementById('dropdownBlurOverlay')?.classList.toggle('active', friendsMenu.classList.contains('active'));
        });
    }

    // Theme dropdown
    const themeBtn = document.getElementById('themeToggle');
    const themeMenu = document.getElementById('themeMenu');

    if (themeBtn && themeMenu) {
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllDropdowns();
            themeMenu.classList.toggle('active');
            document.getElementById('dropdownBlurOverlay')?.classList.toggle('active', themeMenu.classList.contains('active'));
        });
    }

    // Profile dropdown
    const accountBtn = document.getElementById('accountBtn');
    const profileMenu = document.getElementById('profileMenu');

    if (accountBtn && profileMenu) {
        accountBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllDropdowns();
            profileMenu.classList.toggle('active');
            document.getElementById('dropdownBlurOverlay')?.classList.toggle('active', profileMenu.classList.contains('active'));
        });
    }
}

function closeAllDropdowns() {
    // Close all dropdown menus EXCEPT menu-panel (File/Edit/View/Help menus)
    document.querySelectorAll('.dropdown-menu, .notification-dropdown').forEach(dropdown => {
        // Skip menu-panel elements - they're handled by menu-system.js
        if (!dropdown.classList.contains('menu-panel')) {
            dropdown.classList.remove('active');
        }
    });

    // Hide overlay
    const overlay = document.getElementById('dropdownBlurOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Update notification badge count
function updateNotificationBadge(count) {
    const titleBadge = document.getElementById('notificationBadge');
    const statusBadge = document.getElementById('statusNotificationBadge');

    if (count > 0) {
        if (titleBadge) {
            titleBadge.textContent = count;
            titleBadge.style.display = 'flex';
        }
        if (statusBadge) {
            statusBadge.textContent = count;
            statusBadge.style.display = 'flex';
        }
    } else {
        if (titleBadge) titleBadge.style.display = 'none';
        if (statusBadge) statusBadge.style.display = 'none';
    }
}

// Export functions for use in other modules
window.closeAllDropdowns = closeAllDropdowns;
window.updateNotificationBadge = updateNotificationBadge;

// ===== CodeSynq Bridge Functions =====
// These functions make NexusCode compatible with CodeSynq modules

// Expose editor globally for CodeSynq modules
window.getEditor = function () {
    return monacoEditor;
};

// Alias for CodeSynq compatibility
window.editor = null;
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.editor = monacoEditor;
    }, 2000); // Wait for Monaco to initialize
});

// Save Code Modal handler
window.saveCode = function () {
    const modal = document.getElementById('saveCodeModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('fileNameInput');
        if (input) input.focus();
    }
};

// Show Saved Codes Modal
window.showSavedCodes = function () {
    const modal = document.getElementById('savedCodesModal');
    if (modal) {
        modal.style.display = 'flex';
        // Load saved codes from Firebase if user is logged in
        if (window.currentUser && window.database) {
            loadSavedCodesFromFirebase();
        }
    }
};

// Load saved codes from Firebase
function loadSavedCodesFromFirebase() {
    const listContainer = document.getElementById('savedCodesList');
    if (!listContainer || !window.currentUser) return;

    listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Loading...</p>';

    window.database.ref(`users/${window.currentUser.uid}/savedCodes`).once('value')
        .then(snapshot => {
            const codes = snapshot.val();
            if (!codes) {
                listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No saved codes yet</p>';
                return;
            }

            listContainer.innerHTML = '';
            Object.entries(codes).forEach(([key, code]) => {
                const item = document.createElement('div');
                item.className = 'saved-code-item';
                item.innerHTML = `
                    <div class="code-info">
                        <span class="code-name">${code.name || 'Untitled'}</span>
                        <span class="code-lang">${code.language || 'javascript'}</span>
                    </div>
                    <div class="code-actions">
                        <button onclick="loadSavedCode('${key}')" class="btn-icon" title="Load"><i class="fas fa-download"></i></button>
                        <button onclick="deleteSavedCode('${key}')" class="btn-icon" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                listContainer.appendChild(item);
            });
        })
        .catch(err => {
            console.error('Failed to load saved codes:', err);
            listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Failed to load</p>';
        });
}

// Load a saved code into editor
window.loadSavedCode = function (codeKey) {
    if (!window.currentUser || !window.database) return;

    window.database.ref(`users/${window.currentUser.uid}/savedCodes/${codeKey}`).once('value')
        .then(snapshot => {
            const code = snapshot.val();
            if (code && monacoEditor) {
                monacoEditor.setValue(code.content || '');
                showToast('Code loaded!', 'success');
                document.getElementById('savedCodesModal').style.display = 'none';
            }
        });
};

// Delete a saved code
window.deleteSavedCode = function (codeKey) {
    if (!window.currentUser || !window.database) return;

    if (confirm('Are you sure you want to delete this code?')) {
        window.database.ref(`users/${window.currentUser.uid}/savedCodes/${codeKey}`).remove()
            .then(() => {
                showToast('Code deleted', 'success');
                loadSavedCodesFromFirebase(); // Refresh list
            });
    }
};

// Execute code - wrapper for CodeSynq
window.executeCode = function () {
    if (!monacoEditor) return;
    const code = monacoEditor.getValue();
    const language = monacoEditor.getModel()?.getLanguageId() || 'javascript';

    // For web languages, use live preview or console
    if (['javascript', 'html', 'css'].includes(language)) {
        try {
            console.log('Executing:', code.substring(0, 100) + '...');
            eval(code);
            showToast('Code executed in console', 'success');
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    } else {
        showToast('Server-side execution not available', 'warning');
    }
};

// Show toast notifications
window.showToast = function (message, type = 'info') {
    // Check if a toast function already exists
    if (typeof window.showAlert === 'function') {
        window.showAlert(message, type);
        return;
    }

    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        z-index: 10001;
        animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Modal close handlers
document.addEventListener('DOMContentLoaded', () => {
    // Save Code Modal
    document.getElementById('cancelSave')?.addEventListener('click', () => {
        document.getElementById('saveCodeModal').style.display = 'none';
    });

    document.getElementById('confirmSave')?.addEventListener('click', () => {
        const fileName = document.getElementById('fileNameInput')?.value;
        if (fileName && monacoEditor && window.currentUser && window.database) {
            const code = monacoEditor.getValue();
            const language = monacoEditor.getModel()?.getLanguageId() || 'javascript';

            window.database.ref(`users/${window.currentUser.uid}/savedCodes`).push({
                name: fileName,
                content: code,
                language: language,
                timestamp: Date.now()
            }).then(() => {
                showToast('Code saved!', 'success');
                document.getElementById('saveCodeModal').style.display = 'none';
            });
        }
    });

    // Saved Codes Modal
    document.getElementById('closeSavedCodes')?.addEventListener('click', () => {
        document.getElementById('savedCodesModal').style.display = 'none';
    });

    // Share Code Modal
    document.getElementById('cancelShare')?.addEventListener('click', () => {
        document.getElementById('shareCodeModal').style.display = 'none';
    });
});
