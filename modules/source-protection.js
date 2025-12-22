/**
 * ====================================================
 * SOURCE PROTECTION MODULE - CodeSynq
 * ====================================================
 * 
 * This module provides multiple layers of protection to prevent
 * users from easily viewing the source code of your website.
 * 
 * Features:
 * - Disables right-click context menu
 * - Blocks keyboard shortcuts (Ctrl+U, Ctrl+Shift+I, F12, etc.)
 * - Detects DevTools opening
 * - Disables text selection (optional)
 * - Clears console periodically
 * - Prevents drag operations
 * - Disables print screen (partial)
 * 
 * Usage:
 * 1. Include this script in your HTML: <script src="modules/source-protection.js"></script>
 * 2. Or configure with options: SourceProtection.init({ ... })
 * 
 * NOTE: This provides obfuscation, not true security. Determined users
 * can still access source code. For sensitive logic, keep it server-side.
 * ====================================================
 */

(function () {
    'use strict';

    const SourceProtection = {
        // Default configuration
        config: {
            disableRightClick: true,
            disableKeyboardShortcuts: true,
            detectDevTools: true,
            disableTextSelection: false, // Set to true if you want to disable text selection
            clearConsole: true,
            disableDrag: true,
            showWarnings: true,
            redirectOnDevTools: false,
            redirectUrl: 'about:blank',
            warningMessage: '⚠️ Developer tools are not allowed on this site.',
            consoleWarning: true
        },

        // DevTools detection state
        devToolsOpen: false,
        devToolsCheckInterval: null,

        /**
         * Initialize the source protection module
         * @param {Object} options - Configuration options
         */
        init: function (options = {}) {
            // Merge options with defaults
            this.config = { ...this.config, ...options };

            // Apply protections based on config
            if (this.config.disableRightClick) {
                this.disableRightClick();
            }

            if (this.config.disableKeyboardShortcuts) {
                this.disableKeyboardShortcuts();
            }

            if (this.config.detectDevTools) {
                this.startDevToolsDetection();
            }

            if (this.config.disableTextSelection) {
                this.disableTextSelection();
            }

            if (this.config.clearConsole) {
                this.setupConsoleClear();
            }

            if (this.config.disableDrag) {
                this.disableDragOperations();
            }

            if (this.config.consoleWarning) {
                this.showConsoleWarning();
            }

            // Protect the SourceProtection object itself
            this.protectSelf();

            console.log('%c🛡️ Source Protection Active', 'color: #22c55e; font-weight: bold; font-size: 12px;');
        },

        /**
         * Disable right-click context menu
         */
        disableRightClick: function () {
            document.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (this.config.showWarnings) {
                    this.showNotification('Right-click is disabled on this page.');
                }
                return false;
            });
        },

        /**
         * Disable keyboard shortcuts used to view source
         */
        disableKeyboardShortcuts: function () {
            document.addEventListener('keydown', (e) => {
                // F12 - DevTools
                if (e.key === 'F12') {
                    e.preventDefault();
                    if (this.config.showWarnings) {
                        this.showNotification('Developer tools are disabled.');
                    }
                    return false;
                }

                // Ctrl+Shift+I - DevTools
                if (e.ctrlKey && e.shiftKey && e.key === 'I') {
                    e.preventDefault();
                    return false;
                }

                // Ctrl+Shift+J - Console
                if (e.ctrlKey && e.shiftKey && e.key === 'J') {
                    e.preventDefault();
                    return false;
                }

                // Ctrl+Shift+C - Inspect Element
                if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                    e.preventDefault();
                    return false;
                }

                // Ctrl+U - View Source
                if (e.ctrlKey && e.key === 'u') {
                    e.preventDefault();
                    if (this.config.showWarnings) {
                        this.showNotification('View source is disabled.');
                    }
                    return false;
                }

                // Ctrl+S - Save Page
                if (e.ctrlKey && e.key === 's') {
                    e.preventDefault();
                    if (this.config.showWarnings) {
                        this.showNotification('Saving page is disabled.');
                    }
                    return false;
                }

                // Ctrl+P - Print (which can reveal source)
                if (e.ctrlKey && e.key === 'p') {
                    e.preventDefault();
                    return false;
                }

                // Ctrl+Shift+K - Firefox Console
                if (e.ctrlKey && e.shiftKey && e.key === 'K') {
                    e.preventDefault();
                    return false;
                }

                // Cmd+Option+I - Mac DevTools
                if (e.metaKey && e.altKey && e.key === 'i') {
                    e.preventDefault();
                    return false;
                }

                // Cmd+Option+J - Mac Console
                if (e.metaKey && e.altKey && e.key === 'j') {
                    e.preventDefault();
                    return false;
                }

                // Cmd+Option+U - Mac View Source
                if (e.metaKey && e.altKey && e.key === 'u') {
                    e.preventDefault();
                    return false;
                }
            });

            // Also capture keyup for safety
            document.addEventListener('keyup', (e) => {
                if (e.key === 'F12' ||
                    (e.ctrlKey && (e.key === 'u' || e.key === 's')) ||
                    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C'))) {
                    e.preventDefault();
                    return false;
                }
            });
        },

        /**
         * Start DevTools detection
         */
        startDevToolsDetection: function () {
            const threshold = 160;

            // Method 1: Window size check
            const checkWindowSize = () => {
                const widthThreshold = window.outerWidth - window.innerWidth > threshold;
                const heightThreshold = window.outerHeight - window.innerHeight > threshold;

                if (widthThreshold || heightThreshold) {
                    this.onDevToolsOpen();
                }
            };

            // Method 2: debugger detection with timing
            const checkDebugger = () => {
                const start = performance.now();
                debugger;
                const end = performance.now();

                if (end - start > 100) {
                    this.onDevToolsOpen();
                }
            };

            // Method 3: Console.log override detection
            const element = new Image();
            Object.defineProperty(element, 'id', {
                get: function () {
                    SourceProtection.onDevToolsOpen();
                    return '';
                }
            });

            // Run checks periodically
            this.devToolsCheckInterval = setInterval(() => {
                checkWindowSize();
                // Uncomment below for more aggressive detection (may cause performance issues)
                // checkDebugger();
                console.log('%c', element);
            }, 1000);

            // Also check on resize
            window.addEventListener('resize', checkWindowSize);
        },

        /**
         * Called when DevTools is detected
         */
        onDevToolsOpen: function () {
            if (!this.devToolsOpen) {
                this.devToolsOpen = true;

                if (this.config.showWarnings) {
                    console.clear();
                    console.log('%c⛔ STOP!', 'color: #ef4444; font-size: 50px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);');
                    console.log('%c' + this.config.warningMessage, 'color: #f59e0b; font-size: 16px;');
                }

                if (this.config.redirectOnDevTools) {
                    window.location.href = this.config.redirectUrl;
                }

                // Reset detection after a delay
                setTimeout(() => {
                    this.devToolsOpen = false;
                }, 5000);
            }
        },

        /**
         * Disable text selection
         */
        disableTextSelection: function () {
            document.addEventListener('selectstart', (e) => {
                e.preventDefault();
                return false;
            });

            // Add CSS to prevent selection
            const style = document.createElement('style');
            style.textContent = `
                * {
                    -webkit-user-select: none !important;
                    -moz-user-select: none !important;
                    -ms-user-select: none !important;
                    user-select: none !important;
                }
                input, textarea, [contenteditable="true"] {
                    -webkit-user-select: text !important;
                    -moz-user-select: text !important;
                    -ms-user-select: text !important;
                    user-select: text !important;
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * Setup console clearing
         */
        setupConsoleClear: function () {
            // Clear console periodically
            setInterval(() => {
                if (!this.devToolsOpen) {
                    // Only show essential messages
                    console.clear();
                    if (this.config.consoleWarning) {
                        this.showConsoleWarning();
                    }
                }
            }, 5000);
        },

        /**
         * Disable drag operations
         */
        disableDragOperations: function () {
            document.addEventListener('dragstart', (e) => {
                e.preventDefault();
                return false;
            });

            document.addEventListener('drop', (e) => {
                e.preventDefault();
                return false;
            });
        },

        /**
         * Show console warning message
         */
        showConsoleWarning: function () {
            console.log('%c🛡️ CodeSynq - Protected Environment',
                'background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; font-size: 16px; padding: 10px 20px; border-radius: 5px; font-weight: bold;');
            console.log('%cThis browser feature is intended for developers.',
                'color: #818cf8; font-size: 12px;');
            console.log('%cIf someone told you to paste something here, it\'s likely a scam.',
                'color: #ef4444; font-size: 12px; font-weight: bold;');
        },

        /**
         * Show a notification to the user
         * @param {string} message - Message to display
         */
        showNotification: function (message) {
            // Check if the page has a showNotification function (from the main app)
            if (typeof window.showNotification === 'function') {
                window.showNotification(message, 'warning');
                return;
            }

            // Fallback: Create a simple toast notification
            const existingToast = document.querySelector('.sp-toast');
            if (existingToast) {
                existingToast.remove();
            }

            const toast = document.createElement('div');
            toast.className = 'sp-toast';
            toast.innerHTML = `
                <i class="fas fa-shield-alt" style="margin-right: 8px;"></i>
                ${message}
            `;
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, rgba(30, 35, 45, 0.95), rgba(22, 27, 34, 0.98));
                color: #ffffff;
                padding: 12px 24px;
                border-radius: 12px;
                font-size: 14px;
                font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 999999;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.5), 0 0 20px rgba(129, 140, 248, 0.2);
                animation: sp-toast-in 0.3s ease-out;
                display: flex;
                align-items: center;
            `;

            // Add animation styles if not present
            if (!document.querySelector('#sp-toast-styles')) {
                const style = document.createElement('style');
                style.id = 'sp-toast-styles';
                style.textContent = `
                    @keyframes sp-toast-in {
                        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                        to { opacity: 1; transform: translateX(-50%) translateY(0); }
                    }
                    @keyframes sp-toast-out {
                        from { opacity: 1; transform: translateX(-50%) translateY(0); }
                        to { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(toast);

            // Remove after 3 seconds
            setTimeout(() => {
                toast.style.animation = 'sp-toast-out 0.3s ease-out forwards';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        },

        /**
         * Protect the SourceProtection object from tampering
         */
        protectSelf: function () {
            // Make config non-writable
            Object.freeze(this.config);

            // Attempt to prevent overwriting (not foolproof)
            try {
                Object.defineProperty(window, 'SourceProtection', {
                    value: this,
                    writable: false,
                    configurable: false
                });
            } catch (e) {
                // Property might already be defined
            }
        },

        /**
         * Stop all protections (for development purposes)
         */
        stop: function () {
            if (this.devToolsCheckInterval) {
                clearInterval(this.devToolsCheckInterval);
            }
            console.log('%c🔓 Source Protection Disabled', 'color: #ef4444; font-weight: bold;');
        }
    };

    // Auto-initialize with default settings
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => SourceProtection.init());
    } else {
        SourceProtection.init();
    }

    // Expose to window for manual configuration
    window.SourceProtection = SourceProtection;

})();
