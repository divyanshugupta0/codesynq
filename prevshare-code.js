// Code Sharing Module with Firebase Integration
// Stores all shared codes in Firebase Realtime Database
// Auto-deletes expired shares

class CodeShareManager {
    constructor() {
        this.shareModal = null;
        this.viewModal = null;
        this.mySharesModal = null;
        this.db = null;
        this.initializeFirebase();
        this.initializeUI();
        this.setupEventListeners();
    }

    initializeFirebase() {
        // Wait for Firebase to be available
        const checkFirebase = setInterval(() => {
            if (typeof firebase !== 'undefined' && firebase.database) {
                this.db = firebase.database();
                clearInterval(checkFirebase);
                console.log('✅ Firebase initialized for Code Share');

                // Setup auto-cleanup
                this.setupAutoCleanup();
            }
        }, 100);
    }

    setupAutoCleanup() {
        // Check for expired shares every 5 minutes
        setInterval(() => {
            this.cleanupExpiredShares();
        }, 5 * 60 * 1000);
    }

    async cleanupExpiredShares() {
        if (!this.db || !window.currentUser) return;

        try {
            const now = Date.now();
            const snapshot = await this.db.ref(`users/${window.currentUser.uid}/sharedCodes`).once('value');

            snapshot.forEach((child) => {
                const share = child.val();
                if (share.expiresAt && now > share.expiresAt) {
                    this.deleteShare(child.key, true);
                }
            });
        } catch (error) {
            console.error('Error cleaning up expired shares:', error);
        }
    }

    initializeUI() {
        // Create modals
        this.createShareModal();
        this.createViewModal();
        this.createMySharesModal();
        this.createEditModal();
        this.createPreviewModal();
    }

    createShareModal() {
        const modal = document.createElement('div');
        modal.id = 'shareLinkModal';
        modal.className = 'share-link-modal';
        modal.innerHTML = `
            <div class="share-link-modal-content">
                <div class="share-link-modal-header">
                    <h2><i class="fas fa-link"></i> Share Code via Link</h2>
                    <button class="share-link-close-btn" onclick="codeShareManager.closeShareModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="share-link-modal-body">
                    <div class="share-link-options">
                        <div class="share-link-option">
                            <label>
                                <input type="text" id="shareLinkTitle" placeholder="Title (optional)" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
                            </label>
                        </div>
                        <div class="share-link-option">
                            <label>
                                <input type="checkbox" id="shareLinkWithComments" checked>
                                Include comments
                            </label>
                        </div>
                        <div class="share-link-option">
                            <label>
                                <input type="checkbox" id="shareLinkReadOnly" checked>
                                Read-only (viewers can't edit)
                            </label>
                        </div>
                        <div class="share-link-option">
                            <label>
                                <input type="checkbox" id="shareLinkExpiry">
                                Set expiry time
                            </label>
                            <select id="shareLinkExpiryTime" disabled>
                                <option value="1">1 hour</option>
                                <option value="24">24 hours</option>
                                <option value="168">7 days</option>
                                <option value="720">30 days</option>
                                <option value="0">Never</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="share-link-result-container" style="display: none;">
                        <div class="share-link-result-header">
                            <i class="fas fa-check-circle"></i>
                            <span>Link generated successfully!</span>
                        </div>
                        <div class="share-link-input-box">
                            <input type="text" id="shareLinkUrl" readonly>
                            <button class="share-link-copy-btn" onclick="codeShareManager.copyShareLink()">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                        <div class="share-link-actions">
                            <button class="share-link-action-btn" onclick="codeShareManager.openShareLink()">
                                <i class="fas fa-external-link-alt"></i> Open Link
                            </button>
                            <button class="share-link-action-btn" onclick="codeShareManager.shareViaEmail()">
                                <i class="fas fa-envelope"></i> Email
                            </button>
                            <button class="share-link-action-btn" onclick="codeShareManager.shareViaWhatsApp()">
                                <i class="fab fa-whatsapp"></i> WhatsApp
                            </button>
                        </div>
                        <div class="share-link-stats">
                            <div class="share-link-stat-item">
                                <i class="fas fa-eye"></i>
                                <span id="shareLinkViews">0 views</span>
                            </div>
                            <div class="share-link-stat-item">
                                <i class="fas fa-clock"></i>
                                <span id="shareLinkExpiry">Never expires</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="share-link-modal-footer">
                    <button class="share-link-btn-secondary" onclick="codeShareManager.closeShareModal()">Cancel</button>
                    <button class="share-link-btn-primary" id="generateShareLinkBtn" onclick="codeShareManager.generateShareLink()">
                        <i class="fas fa-link"></i> Generate Link
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.shareModal = modal;
    }

    createViewModal() {
        const modal = document.createElement('div');
        modal.id = 'viewSharedLinkModal';
        modal.className = 'view-shared-link-modal';
        modal.innerHTML = `
            <div class="view-shared-link-modal-content">
                <div class="share-link-modal-header">
                    <div class="shared-link-code-info">
                        <h2><i class="fas fa-code"></i> Shared Code</h2>
                        <div class="shared-link-meta">
                            <span id="sharedLinkLanguage"></span>
                            <span id="sharedLinkDate"></span>
                            <span id="sharedLinkAuthor"></span>
                        </div>
                    </div>
                    <button class="share-link-close-btn" onclick="codeShareManager.closeViewModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="share-link-modal-body">
                    <div class="shared-link-code-actions">
                        <button class="shared-link-action-btn" onclick="codeShareManager.copySharedCode()">
                            <i class="fas fa-copy"></i> Copy Code
                        </button>
                        <button class="shared-link-action-btn" onclick="codeShareManager.forkSharedCode()">
                            <i class="fas fa-code-branch"></i> Fork to Editor
                        </button>
                        <button class="shared-link-action-btn" onclick="codeShareManager.downloadSharedCode()">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                    <div id="sharedLinkCodeEditor" class="shared-link-code-editor"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.viewModal = modal;
    }

    createMySharesModal() {
        const modal = document.createElement('div');
        modal.id = 'mySharesModal';
        modal.className = 'share-link-modal';
        modal.innerHTML = `
            <div class="share-link-modal-content" style="max-width: 800px;">
                <div class="share-link-modal-header">
                    <h2><i class="fas fa-history"></i> My Shared Codes</h2>
                    <button class="share-link-close-btn" onclick="codeShareManager.closeMySharesModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="share-link-modal-body">
                    <div id="mySharesList" class="my-shares-list"></div>
                </div>
                <div class="share-link-modal-footer">
                    <button class="share-link-btn-secondary" onclick="codeShareManager.deleteAllShares()" style="background: var(--danger-color, #ef4444);">
                        <i class="fas fa-trash-alt"></i> Delete All
                    </button>
                    <button class="share-link-btn-secondary" onclick="codeShareManager.closeMySharesModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.mySharesModal = modal;
    }

    setupEventListeners() {
        // Expiry checkbox toggle
        document.addEventListener('change', (e) => {
            if (e.target.id === 'shareLinkExpiry') {
                document.getElementById('shareLinkExpiryTime').disabled = !e.target.checked;
            }
        });

        // Check for shared code in URL on page load
        this.checkForSharedCode();
    }

    openShareModal() {
        if (!editor || !editor.getValue()) {
            showNotification('No code to share!', 'error');
            return;
        }

        // Reset modal state
        const container = this.shareModal.querySelector('.share-link-result-container');
        if (container) container.style.display = 'none';

        const generateBtn = document.getElementById('generateShareLinkBtn');
        if (generateBtn) {
            generateBtn.style.display = 'block';
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-link"></i> Generate Link';
        }

        // Clear title
        const titleInput = document.getElementById('shareLinkTitle');
        if (titleInput) titleInput.value = '';

        this.shareModal.style.display = 'flex';
    }

    closeShareModal() {
        this.shareModal.style.display = 'none';
    }

    closeViewModal() {
        this.viewModal.style.display = 'none';
    }

    async openMySharesModal() {
        if (!window.currentUser) {
            showNotification('Please login to view your shared codes', 'error');
            return;
        }

        this.mySharesModal.style.display = 'flex';
        await this.loadMyShares();
    }

    closeMySharesModal() {
        this.mySharesModal.style.display = 'none';
    }

    async generateShareLink() {
        if (!this.db) {
            showNotification('Firebase not initialized. Please wait...', 'error');
            return;
        }

        const code = editor.getValue();
        const language = document.getElementById('languageSelect').value;
        const title = document.getElementById('shareLinkTitle').value || `${language} code`;
        const includeComments = document.getElementById('shareLinkWithComments').checked;
        const readOnly = document.getElementById('shareLinkReadOnly').checked;
        const hasExpiry = document.getElementById('shareLinkExpiry').checked;
        const expiryHours = hasExpiry ? parseInt(document.getElementById('shareLinkExpiryTime').value) : 0;

        const generateBtn = document.getElementById('generateShareLinkBtn');
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            // Generate unique share ID
            const shareId = this.generateShareId();

            // Calculate expiry
            let expiresAt = null;
            if (expiryHours > 0) {
                expiresAt = Date.now() + (expiryHours * 60 * 60 * 1000);
            }

            const shareData = {
                shareId,
                code,
                language,
                title,
                includeComments,
                readOnly,
                expiresAt,
                expiryHours,
                author: window.currentUser ? window.currentUser.displayName || window.currentUser.email : 'Anonymous',
                authorId: window.currentUser ? window.currentUser.uid : null,
                createdAt: Date.now(),
                views: 0,
                lastViewed: null
            };

            // Save to Firebase
            await this.db.ref(`sharedCodes/${shareId}`).set(shareData);

            // Also save to user's list if logged in
            if (window.currentUser) {
                await this.db.ref(`users/${window.currentUser.uid}/sharedCodes/${shareId}`).set({
                    shareId,
                    title,
                    language,
                    createdAt: shareData.createdAt,
                    expiresAt,
                    expiryHours,
                    readOnly,
                    views: 0
                });
            }

            const shareUrl = `${window.location.origin}?share=${shareId}`;

            // Display the link
            document.getElementById('shareLinkUrl').value = shareUrl;
            document.querySelector('.share-link-result-container').style.display = 'block';
            generateBtn.style.display = 'none';

            // Update expiry display
            if (expiryHours > 0) {
                const expiryDate = new Date(expiresAt);
                document.getElementById('shareLinkExpiry').textContent = `Expires: ${expiryDate.toLocaleString()}`;
            } else {
                document.getElementById('shareLinkExpiry').textContent = 'Never expires';
            }

            showNotification('Share link generated successfully!', 'success');

        } catch (error) {
            console.error('Error generating share link:', error);
            showNotification('Failed to generate share link. Please try again.', 'error');
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-link"></i> Generate Link';
        }
    }

    generateShareId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    async loadMyShares() {
        if (!this.db || !window.currentUser) return;

        const listContainer = document.getElementById('mySharesList');
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        try {
            const snapshot = await this.db.ref(`users/${window.currentUser.uid}/sharedCodes`).once('value');
            const shares = [];

            snapshot.forEach((child) => {
                const share = child.val();
                // Only show non-expired shares
                if (!share.expiresAt || Date.now() <= share.expiresAt) {
                    shares.push(share);
                }
            });

            if (shares.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No shared codes yet</div>';
                return;
            }

            // Sort by creation date (newest first)
            shares.sort((a, b) => b.createdAt - a.createdAt);

            listContainer.innerHTML = shares.map(share => this.renderShareItem(share)).join('');

        } catch (error) {
            console.error('Error loading shares:', error);
            listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--danger-color);">Failed to load shares</div>';
        }
    }

    renderShareItem(share) {
        const expiryText = share.expiresAt
            ? `Expires: ${new Date(share.expiresAt).toLocaleString()}`
            : 'Never expires';

        const shareUrl = `${window.location.origin}?share=${share.shareId}`;

        return `
            <div class="share-item" data-share-id="${share.shareId}" onclick="codeShareManager.openPreviewModal('${share.shareId}')" style="cursor: pointer;">
                <div class="share-item-header">
                    <div class="share-item-title">
                        <i class="fas fa-code"></i>
                        <strong>${share.title}</strong>
                        <span class="share-item-language">${share.language}</span>
                    </div>
                    <div class="share-item-actions" onclick="event.stopPropagation();">
                        <button class="share-item-btn" onclick="codeShareManager.copyShareUrl('${shareUrl}')" title="Copy link">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="share-item-btn" onclick="codeShareManager.openEditModal('${share.shareId}')" title="Edit settings">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="share-item-btn" onclick="codeShareManager.deleteShare('${share.shareId}')" title="Delete" style="color: var(--danger-color, #ef4444);">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="share-item-meta">
                    <span><i class="fas fa-calendar"></i> ${new Date(share.createdAt).toLocaleDateString()}</span>
                    <span><i class="fas fa-eye"></i> ${share.views || 0} views</span>
                    <span><i class="fas fa-clock"></i> ${expiryText}</span>
                    <span><i class="fas fa-${share.readOnly ? 'lock' : 'unlock'}"></i> ${share.readOnly ? 'Read-only' : 'Editable'}</span>
                </div>
            </div>
        `;
    }

    copyShareUrl(url) {
        const tempInput = document.createElement('input');
        tempInput.value = url;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        showNotification('Link copied to clipboard!', 'success');
    }


    async deleteShare(shareId, silent = false) {
        if (!this.db || !window.currentUser) return;

        if (!silent && !confirm('Are you sure you want to delete this shared code?')) {
            return;
        }

        try {
            await this.db.ref(`sharedCodes/${shareId}`).remove();
            await this.db.ref(`users/${window.currentUser.uid}/sharedCodes/${shareId}`).remove();

            if (!silent) {
                showNotification('Share deleted successfully!', 'success');
                await this.loadMyShares();
            }

        } catch (error) {
            console.error('Error deleting share:', error);
            if (!silent) showNotification('Failed to delete share', 'error');
        }
    }

    async deleteAllShares() {
        if (!this.db || !window.currentUser) return;

        if (!confirm('⚠️ Are you sure you want to delete ALL your shared codes?\n\nThis action cannot be undone!')) {
            return;
        }

        try {
            const snapshot = await this.db.ref(`users/${window.currentUser.uid}/sharedCodes`).once('value');
            const deletePromises = [];

            snapshot.forEach((child) => {
                const shareId = child.key;
                deletePromises.push(this.db.ref(`sharedCodes/${shareId}`).remove());
            });

            await Promise.all(deletePromises);
            await this.db.ref(`users/${window.currentUser.uid}/sharedCodes`).remove();

            showNotification(`Deleted ${deletePromises.length} shared codes`, 'success');
            await this.loadMyShares();

        } catch (error) {
            console.error('Error deleting all shares:', error);
            showNotification('Failed to delete shares', 'error');
        }
    }

    // ... (rest of the methods remain the same)

    copyShareLink() {
        const linkInput = document.getElementById('shareLinkUrl');
        linkInput.select();
        document.execCommand('copy');

        const copyBtn = event.target.closest('.share-link-copy-btn');
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';

        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
        }, 2000);

        showNotification('Link copied to clipboard!', 'success');
    }

    openShareLink() {
        const link = document.getElementById('shareLinkUrl').value;
        window.open(link, '_blank');
    }

    shareViaEmail() {
        const link = document.getElementById('shareLinkUrl').value;
        const subject = 'Check out this code snippet';
        const body = `I wanted to share this code with you:\n\n${link}`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    shareViaWhatsApp() {
        const link = document.getElementById('shareLinkUrl').value;
        const text = `Check out this code snippet: ${link}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }

    async checkForSharedCode() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('share');

        if (shareId) {
            await this.loadSharedCode(shareId);
        }
    }

    async loadSharedCode(shareId) {
        if (!this.db) {
            setTimeout(() => this.loadSharedCode(shareId), 500);
            return;
        }

        try {
            const snapshot = await this.db.ref(`sharedCodes/${shareId}`).once('value');

            if (!snapshot.exists()) {
                showNotification('Shared code not found or has expired', 'error');
                return;
            }

            const sharedData = snapshot.val();

            // Check if expired
            if (sharedData.expiresAt && Date.now() > sharedData.expiresAt) {
                await this.db.ref(`sharedCodes/${shareId}`).remove();
                if (sharedData.authorId) {
                    await this.db.ref(`users/${sharedData.authorId}/sharedCodes/${shareId}`).remove();
                }
                showNotification('This shared code has expired', 'error');
                return;
            }

            // Update view count
            const newViews = (sharedData.views || 0) + 1;
            await this.db.ref(`sharedCodes/${shareId}`).update({
                views: newViews,
                lastViewed: Date.now()
            });

            if (sharedData.authorId) {
                await this.db.ref(`users/${sharedData.authorId}/sharedCodes/${shareId}`).update({
                    views: newViews
                });
            }

            // Display in modal
            this.displaySharedCode(sharedData);

        } catch (error) {
            console.error('Error loading shared code:', error);
            showNotification('Failed to load shared code', 'error');
        }
    }

    displaySharedCode(sharedData) {
        // Update metadata
        document.getElementById('sharedLinkLanguage').innerHTML =
            `<i class="fas fa-code"></i> ${sharedData.language.toUpperCase()}`;
        document.getElementById('sharedLinkDate').innerHTML =
            `<i class="fas fa-calendar"></i> ${new Date(sharedData.createdAt).toLocaleDateString()}`;
        document.getElementById('sharedLinkAuthor').innerHTML =
            `<i class="fas fa-user"></i> ${sharedData.author}`;

        // Create Monaco editor for viewing
        const editorContainer = document.getElementById('sharedLinkCodeEditor');
        editorContainer.innerHTML = '';

        require(['vs/editor/editor.main'], function () {
            const sharedEditor = monaco.editor.create(editorContainer, {
                value: sharedData.code,
                language: getMonacoLanguage(sharedData.language),
                theme: getMonacoTheme('dark'),
                readOnly: sharedData.readOnly,
                automaticLayout: true,
                fontSize: 14,
                lineNumbers: 'on',
                minimap: { enabled: false },
                wordWrap: 'on',
                scrollBeyondLastLine: false
            });

            window.sharedCodeEditor = sharedEditor;
            window.currentSharedData = sharedData;
        });

        this.viewModal.style.display = 'flex';
    }

    copySharedCode() {
        if (window.sharedCodeEditor) {
            const code = window.sharedCodeEditor.getValue();
            navigator.clipboard.writeText(code);
            showNotification('Code copied to clipboard!', 'success');
        }
    }

    forkSharedCode() {
        if (window.currentSharedData && editor) {
            editor.setValue(window.currentSharedData.code);
            document.getElementById('languageSelect').value = window.currentSharedData.language;

            const language = getMonacoLanguage(window.currentSharedData.language);
            monaco.editor.setModelLanguage(editor.getModel(), language);

            this.closeViewModal();
            showNotification('Code forked to editor!', 'success');
        }
    }

    downloadSharedCode() {
        if (window.currentSharedData) {
            const code = window.currentSharedData.code;
            const language = window.currentSharedData.language;
            const extension = this.getFileExtension(language);
            const filename = `shared_code_${Date.now()}.${extension}`;

            const blob = new Blob([code], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            showNotification('Code downloaded!', 'success');
        }
    }

    getFileExtension(language) {
        const extensions = {
            'javascript': 'js',
            'python': 'py',
            'java': 'java',
            'c': 'c',
            'cpp': 'cpp',
            'html': 'html',
            'css': 'css',
            'typescript': 'ts',
            'php': 'php',
            'ruby': 'rb',
            'go': 'go',
            'rust': 'rs',
            'swift': 'swift',
            'kotlin': 'kt'
        };
        return extensions[language] || 'txt';
    }

    createEditModal() {
        const modal = document.createElement('div');
        modal.id = 'editShareModal';
        modal.className = 'share-link-modal';
        modal.innerHTML = `
            <div class="share-link-modal-content" style="max-width: 500px;">
                <div class="share-link-modal-header">
                    <h2><i class="fas fa-edit"></i> Edit Share Settings</h2>
                    <button class="share-link-close-btn" onclick="codeShareManager.closeEditModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="share-link-modal-body">
                    <div class="share-link-options">
                        <div class="share-link-option">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">
                                <i class="fas fa-heading"></i> Title
                            </label>
                            <input type="text" id="editShareTitle" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
                        </div>
                        <div class="share-link-option">
                            <label>
                                <input type="checkbox" id="editShareReadOnly">
                                Read-only (viewers can't edit)
                            </label>
                        </div>
                        <div class="share-link-option">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">
                                <i class="fas fa-clock"></i> Expiry Time
                            </label>
                            <select id="editShareExpiryTime" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
                                <option value="0">Never</option>
                                <option value="1">1 hour</option>
                                <option value="24">24 hours</option>
                                <option value="168">7 days</option>
                                <option value="720">30 days</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="share-link-modal-footer">
                    <button class="share-link-btn-secondary" onclick="codeShareManager.closeEditModal()">Cancel</button>
                    <button class="share-link-btn-primary" id="saveEditBtn" onclick="codeShareManager.saveEdit()">
                        <i class="fas fa-save"></i> Save Changes
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.editModal = modal;
    }

    createPreviewModal() {
        const modal = document.createElement('div');
        modal.id = 'previewShareModal';
        modal.className = 'view-shared-link-modal';
        modal.innerHTML = `
            <div class="view-shared-link-modal-content">
                <div class="share-link-modal-header">
                    <div class="shared-link-code-info">
                        <h2><i class="fas fa-code"></i> <span id="previewTitle">Code Preview</span></h2>
                        <div class="shared-link-meta">
                            <span id="previewLanguage"></span>
                            <span id="previewDate"></span>
                            <span id="previewViews"></span>
                        </div>
                    </div>
                    <button class="share-link-close-btn" onclick="codeShareManager.closePreviewModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="share-link-modal-body">
                    <div class="shared-link-code-actions">
                        <button class="shared-link-action-btn" onclick="codeShareManager.copyPreviewCode()">
                            <i class="fas fa-copy"></i> Copy Code
                        </button>
                        <button class="shared-link-action-btn" onclick="codeShareManager.forkPreviewCode()">
                            <i class="fas fa-code-branch"></i> Fork to Editor
                        </button>
                        <button class="shared-link-action-btn" onclick="codeShareManager.downloadPreviewCode()">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                    <div id="previewCodeEditor" class="shared-link-code-editor"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.previewModal = modal;
    }

    closeEditModal() {
        this.editModal.style.display = 'none';
    }

    closePreviewModal() {
        this.previewModal.style.display = 'none';
    }

    async openEditModal(shareId) {
        if (!this.db || !window.currentUser) return;

        try {
            const snapshot = await this.db.ref(`users/${window.currentUser.uid}/sharedCodes/${shareId}`).once('value');
            const share = snapshot.val();

            if (!share) {
                showNotification('Share not found', 'error');
                return;
            }

            // Store current share ID
            this.currentEditShareId = shareId;

            // Populate form
            document.getElementById('editShareTitle').value = share.title || '';
            document.getElementById('editShareReadOnly').checked = share.readOnly || false;
            document.getElementById('editShareExpiryTime').value = share.expiryHours || 0;

            this.editModal.style.display = 'flex';
        } catch (error) {
            console.error('Error opening edit modal:', error);
            showNotification('Failed to load share settings', 'error');
        }
    }

    async saveEdit() {
        if (!this.db || !window.currentUser || !this.currentEditShareId) return;

        const saveBtn = document.getElementById('saveEditBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            const title = document.getElementById('editShareTitle').value;
            const readOnly = document.getElementById('editShareReadOnly').checked;
            const expiryHours = parseInt(document.getElementById('editShareExpiryTime').value) || 0;
            const expiresAt = expiryHours > 0 ? Date.now() + (expiryHours * 60 * 60 * 1000) : null;

            // Update in Firebase
            await this.db.ref(`sharedCodes/${this.currentEditShareId}`).update({
                title,
                readOnly,
                expiresAt,
                expiryHours
            });

            await this.db.ref(`users/${window.currentUser.uid}/sharedCodes/${this.currentEditShareId}`).update({
                title,
                readOnly,
                expiresAt,
                expiryHours
            });

            showNotification('Share updated successfully!', 'success');
            this.closeEditModal();
            await this.loadMyShares();

        } catch (error) {
            console.error('Error saving edit:', error);
            showNotification('Failed to save changes', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        }
    }

    async openPreviewModal(shareId) {
        if (!this.db) return;

        try {
            const snapshot = await this.db.ref(`sharedCodes/${shareId}`).once('value');

            if (!snapshot.exists()) {
                showNotification('Share not found', 'error');
                return;
            }

            const shareData = snapshot.val();

            // Check if expired
            if (shareData.expiresAt && Date.now() > shareData.expiresAt) {
                showNotification('This share has expired', 'error');
                return;
            }

            // Store current preview data
            window.currentPreviewData = shareData;

            // Update metadata
            document.getElementById('previewTitle').textContent = shareData.title || 'Code Preview';
            document.getElementById('previewLanguage').innerHTML =
                `<i class="fas fa-code"></i> ${shareData.language.toUpperCase()}`;
            document.getElementById('previewDate').innerHTML =
                `<i class="fas fa-calendar"></i> ${new Date(shareData.createdAt).toLocaleDateString()}`;
            document.getElementById('previewViews').innerHTML =
                `<i class="fas fa-eye"></i> ${shareData.views || 0} views`;

            // Create Monaco editor for viewing
            const editorContainer = document.getElementById('previewCodeEditor');
            editorContainer.innerHTML = '';

            require(['vs/editor/editor.main'], function () {
                const previewEditor = monaco.editor.create(editorContainer, {
                    value: shareData.code,
                    language: getMonacoLanguage(shareData.language),
                    theme: getMonacoTheme('dark'),
                    readOnly: true,
                    automaticLayout: true,
                    fontSize: 14,
                    lineNumbers: 'on',
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    scrollBeyondLastLine: false
                });

                window.previewCodeEditor = previewEditor;
            });

            this.previewModal.style.display = 'flex';

        } catch (error) {
            console.error('Error opening preview:', error);
            showNotification('Failed to load preview', 'error');
        }
    }

    copyPreviewCode() {
        if (window.previewCodeEditor) {
            const code = window.previewCodeEditor.getValue();
            navigator.clipboard.writeText(code);
            showNotification('Code copied to clipboard!', 'success');
        }
    }

    forkPreviewCode() {
        if (window.currentPreviewData && editor) {
            editor.setValue(window.currentPreviewData.code);
            document.getElementById('languageSelect').value = window.currentPreviewData.language;

            const language = getMonacoLanguage(window.currentPreviewData.language);
            monaco.editor.setModelLanguage(editor.getModel(), language);

            this.closePreviewModal();
            showNotification('Code forked to editor!', 'success');
        }
    }

    downloadPreviewCode() {
        if (window.currentPreviewData) {
            const code = window.currentPreviewData.code;
            const language = window.currentPreviewData.language;
            const extension = this.getFileExtension(language);
            const filename = `${window.currentPreviewData.title || 'code'}.${extension}`;

            const blob = new Blob([code], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            showNotification('Code downloaded!', 'success');
        }
    }
}

// Initialize when DOM is ready
let codeShareManager;
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        codeShareManager = new CodeShareManager();
        window.codeShareManager = codeShareManager;
    }, 1000);
});