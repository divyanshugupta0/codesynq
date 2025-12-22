const FullScreenManager = {
    isEnabled: true,

    init() {
        if (!this.isEnabled) return;
        this.createOverlay();
        this.bindEvents();

        // Show overlay immediately acting as a "request" to the user
        // If auto-switch works (rare), it will hide automatically
        this.showOverlay();

        // Attempt automatic switch
        this.enterFullScreen();

        // Add a one-time click listener to the document to capture the first interaction
        // This helps if the user clicks somewhere else before the overlay fully grabs attention
        const oneTimeAuto = () => {
            if (!document.fullscreenElement) {
                this.enterFullScreen();
            }
        };
        document.addEventListener('click', oneTimeAuto, { once: true });
    },

    createOverlay() {
        if (document.getElementById('fullscreen-force-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'fullscreen-force-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(13, 17, 23, 0.98);
            z-index: 2147483647; 
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #e6edf3;
            font-family: 'Segoe UI', sans-serif;
            text-align: center;
            backdrop-filter: blur(10px);
        `;

        overlay.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 2rem; color: #4CAF50; animation: pulse 2s infinite;">
                <i class="fas fa-expand-arrows-alt"></i>
            </div>
            <h1 style="margin-bottom: 1rem; font-weight: 600;">Full Screen Mode Required</h1>
            <p style="margin-bottom: 2.5rem; color: #8b949e; max-width: 400px; line-height: 1.6;">
                CodeSynq requires full screen mode to provide the best coding experience. Please enable it to continue.
            </p>
            <button id="force-fs-btn" style="
                padding: 14px 32px;
                background: #238636;
                color: white;
                border: 1px solid rgba(240, 246, 252, 0.1);
                border-radius: 6px;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            ">
                <i class="fas fa-expand" style="margin-right: 8px;"></i> Enter Full Screen
            </button>
            <style>
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                    100% { transform: scale(1); opacity: 1; }
                }
                #force-fs-btn:hover {
                    background: #2ea043;
                    transform: translateY(-2px);
                }
            </style>
        `;

        document.body.appendChild(overlay);

        document.getElementById('force-fs-btn').addEventListener('click', () => {
            this.enterFullScreen();
        });
    },

    bindEvents() {
        // Monitor changes
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                this.showOverlay();
            } else {
                this.hideOverlay();
            }
        });

        // Also check on window resize/focus just to be safe
        window.addEventListener('resize', () => {
            if (!document.fullscreenElement && window.innerHeight < screen.height) {
                // this.showOverlay(); // Maybe too aggressive if user is just resizing window
            }
        });
    },

    enterFullScreen() {
        const docEl = document.documentElement;
        const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;

        if (requestFs) {
            requestFs.call(docEl).then(() => {
                // Success! But don't hide immediately here. 
                // Wait for the 'fullscreenchange' event to trigger hideOverlay().
                // This ensures we are ACTUALLY in fullscreen before hiding.
            }).catch(err => {
                console.warn('Fullscreen denied or failed (likely blocked by browser):', err);
                // Auto switch failed, so show overlay to prompt user
                this.showOverlay();
            });
        }
    },

    showOverlay() {
        const overlay = document.getElementById('fullscreen-force-overlay');
        if (overlay) overlay.style.display = 'flex';
    },

    hideOverlay() {
        const overlay = document.getElementById('fullscreen-force-overlay');
        if (overlay) overlay.style.display = 'none';
    }
};

// Auto-run
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FullScreenManager.init());
} else {
    FullScreenManager.init();
}
