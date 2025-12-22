// ===== Menu System (Simplified & Fixed) =====
(function () {
    'use strict';

    let currentOpenMenu = null;

    function initMenuSystem() {
        console.log('Initializing menu system...');

        // Get all menu items
        const menuItems = document.querySelectorAll('.menu-item');
        console.log('Found menu items:', menuItems.length);

        menuItems.forEach(menuBtn => {
            menuBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const parent = this.parentElement;
                const panel = parent.querySelector('.menu-panel');

                if (!panel) {
                    console.warn('No menu panel found for', this.textContent);
                    return;
                }

                // If clicking the currently open menu, close it
                if (currentOpenMenu === panel) {
                    panel.classList.remove('active');
                    this.classList.remove('active');
                    currentOpenMenu = null;
                } else {
                    // Close any currently open menu
                    if (currentOpenMenu) {
                        currentOpenMenu.classList.remove('active');
                        const prevBtn = currentOpenMenu.parentElement.querySelector('.menu-item');
                        if (prevBtn) prevBtn.classList.remove('active');
                    }

                    // Open this menu
                    panel.classList.add('active');
                    this.classList.add('active');
                    currentOpenMenu = panel;
                }
            });
        });

        // Prevent clicks inside menu panels from bubbling
        const menuPanels = document.querySelectorAll('.menu-panel');
        console.log('Found menu panels:', menuPanels.length);

        menuPanels.forEach(panel => {
            panel.addEventListener('click', function (e) {
                e.stopPropagation();
                // Don't close menu when clicking inside
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', function (e) {
            // Check if click is on or inside a menu dropdown
            const clickedDropdown = e.target.closest('.menu-dropdown');

            if (!clickedDropdown && currentOpenMenu) {
                currentOpenMenu.classList.remove('active');
                const menuBtn = currentOpenMenu.parentElement.querySelector('.menu-item');
                if (menuBtn) menuBtn.classList.remove('active');
                currentOpenMenu = null;
            }
        });

        console.log('Menu system initialized');
    }

    function closeAllMenus() {
        if (currentOpenMenu) {
            currentOpenMenu.classList.remove('active');
            const menuBtn = currentOpenMenu.parentElement.querySelector('.menu-item');
            if (menuBtn) menuBtn.classList.remove('active');
            currentOpenMenu = null;
        }
    }

    // Make closeAllMenus available globally
    window.closeAllMenus = closeAllMenus;

    // === FILE MENU ACTIONS ===
    function setupFileMenu() {
        document.getElementById('newFileMenu')?.addEventListener('click', () => {
            if (typeof createNewFile === 'function') createNewFile();
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('openFolderMenu')?.addEventListener('click', () => {
            // Modified: Open Folder now triggers Saved Codes modal as per request
            if (typeof showSavedCodes === 'function') {
                showSavedCodes();
            } else if (window.codeShareManager) {
                codeShareManager.openSavedModal();
            }
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('saveFileMenu')?.addEventListener('click', () => {
            if (typeof saveCurrentFile === 'function') saveCurrentFile();
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('saveAsMenu')?.addEventListener('click', () => {
            if (typeof saveFileAs === 'function') saveFileAs();
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('saveAllMenu')?.addEventListener('click', () => {
            if (typeof saveAllFiles === 'function') saveAllFiles();
            setTimeout(closeAllMenus, 100);
        });

        // 'seeSavedCodesMenu' removed as it is now handled by 'openFolderMenu'


        document.getElementById('shareCodeMenu')?.addEventListener('click', () => {
            // Open share code modal
            const modal = document.getElementById('shareCodeModal');
            if (modal) modal.style.display = 'flex';
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('closeFileMenu')?.addEventListener('click', () => {
            if (typeof closeCurrentTab === 'function') closeCurrentTab();
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('closeAllMenu')?.addEventListener('click', () => {
            if (typeof closeAllTabs === 'function') closeAllTabs();
            setTimeout(closeAllMenus, 100);
        });
    }

    // === EDIT MENU ACTIONS ===
    function setupEditMenu() {
        document.getElementById('undoMenu')?.addEventListener('click', () => {
            if (window.monacoEditor) monacoEditor.trigger('keyboard', 'undo', null);
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('redoMenu')?.addEventListener('click', () => {
            if (window.monacoEditor) monacoEditor.trigger('keyboard', 'redo', null);
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('findMenu')?.addEventListener('click', () => {
            if (window.monacoEditor) monacoEditor.trigger('keyboard', 'actions.find', null);
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('replaceMenu')?.addEventListener('click', () => {
            if (window.monacoEditor) monacoEditor.trigger('keyboard', 'editor.action.startFindReplaceAction', null);
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('formatMenu')?.addEventListener('click', () => {
            if (window.monacoEditor) monacoEditor.trigger('keyboard', 'editor.action.formatDocument', null);
            setTimeout(closeAllMenus, 100);
        });
    }

    // === VIEW MENU ACTIONS ===
    function setupViewMenu() {
        document.getElementById('commandPaletteMenu')?.addEventListener('click', () => {
            document.getElementById('commandPaletteTrigger')?.click();
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('toggleSidebarMenu')?.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.style.display = sidebar.style.display === 'none' ? '' : 'none';
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('togglePanelMenu')?.addEventListener('click', () => {
            const panel = document.getElementById('terminal-panel-container');
            if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('toggleTerminalMenu')?.addEventListener('click', () => {
            if (typeof setActiveBottomPanel === 'function') setActiveBottomPanel('terminal');
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('changeThemeMenu')?.addEventListener('click', () => {
            document.getElementById('themeToggle')?.click();
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('fullscreenMenu')?.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
            setTimeout(closeAllMenus, 100);
        });
    }

    // === HELP MENU ACTIONS ===
    function setupHelpMenu() {
        document.getElementById('welcomeMenu')?.addEventListener('click', () => {
            if (typeof showWelcome === 'function') showWelcome();
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('aboutMenu')?.addEventListener('click', () => {
            if (typeof showToast === 'function') showToast('NexusCode IDE - Powered by CodeSynq', 'info');
            setTimeout(closeAllMenus, 100);
        });

        document.getElementById('docsMenu')?.addEventListener('click', () => {
            window.open('https://github.com/your-repo/nexuscode', '_blank');
            setTimeout(closeAllMenus, 100);
        });
    }

    // === KEYBOARD SHORTCUTS ===
    document.addEventListener('keydown', (e) => {
        // Ctrl+S - Save
        if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
            e.preventDefault();
            if (typeof saveCurrentFile === 'function') saveCurrentFile();
        }
        // Ctrl+Shift+S - Save As
        if ((e.ctrlKey || e.metaKey) && e.key === 'S' && e.shiftKey) {
            e.preventDefault();
            if (typeof saveFileAs === 'function') saveFileAs();
        }
        // Ctrl+N - New File
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            if (typeof createNewFile === 'function') createNewFile();
        }
        // Ctrl+W - Close File
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            e.preventDefault();
            if (typeof closeCurrentTab === 'function') closeCurrentTab();
        }
        // F5 - Run Code
        if (e.key === 'F5') {
            e.preventDefault();
            if (typeof runCode === 'function') runCode();
        }
        // Ctrl+P - Command Palette
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            document.getElementById('commandPaletteTrigger')?.click();
        }
        // Ctrl+B - Toggle Sidebar
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.style.display = sidebar.style.display === 'none' ? '' : 'none';
        }
        // ESC - Close menus
        if (e.key === 'Escape') {
            closeAllMenus();
        }
    });

    // === LAYOUT FUNCTIONALITY ===
    function setLayout(layout) {
        const editorArea = document.querySelector('.editor-area');
        const terminalContainer = document.getElementById('terminal-panel-container') ||
            document.querySelector('.terminal-panel-container');

        if (!editorArea) return;

        // Update active button
        document.querySelectorAll('.layout-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.layout === layout);
        });

        // Apply layout
        switch (layout) {
            case '50-50':
                if (terminalContainer) {
                    terminalContainer.style.display = '';
                    terminalContainer.style.height = '50%';
                }
                editorArea.style.height = '50%';
                break;
            case '60-40':
                if (terminalContainer) {
                    terminalContainer.style.display = '';
                    terminalContainer.style.height = '40%';
                }
                editorArea.style.height = '60%';
                break;
            case '70-30':
                if (terminalContainer) {
                    terminalContainer.style.display = '';
                    terminalContainer.style.height = '30%';
                }
                editorArea.style.height = '70%';
                break;
            case '40-60':
                if (terminalContainer) {
                    terminalContainer.style.display = '';
                    terminalContainer.style.height = '60%';
                }
                editorArea.style.height = '40%';
                break;
            case 'panel-hidden':
                if (terminalContainer) {
                    terminalContainer.style.display = 'none';
                }
                editorArea.style.height = '100%';
                break;
        }

        // Resize Monaco editor if it exists
        if (window.monacoEditor) {
            setTimeout(() => window.monacoEditor.layout(), 100);
        }

        console.log('Layout changed to:', layout);
    }

    // Make setLayout available globally
    window.setLayout = setLayout;

    function setupLayoutButtons() {
        // Title bar layout buttons
        document.querySelectorAll('.layout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                setLayout(btn.dataset.layout);
            });
        });

        // Menu submenu layout options
        document.querySelectorAll('.layout-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                setLayout(option.dataset.layout);
                setTimeout(closeAllMenus, 100);
            });
        });
    }

    // Initialize everything when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initMenuSystem();
            setupFileMenu();
            setupEditMenu();
            setupViewMenu();
            setupHelpMenu();
            setupLayoutButtons();
        });
    } else {
        initMenuSystem();
        setupFileMenu();
        setupEditMenu();
        setupViewMenu();
        setupHelpMenu();
        setupLayoutButtons();
    }
})();
