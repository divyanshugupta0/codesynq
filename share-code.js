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
        this.createReceivedModal();
        this.createEditModal();
        this.createPreviewModal();
        this.createProfileModal();
        this.createViewersModal();
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
                        <div id="sharedLinkUrlRow" style="display: none; margin-top: 6px; font-size: 0.85rem; color: var(--text-secondary); align-items: center; gap: 8px;">
                            <span id="sharedLinkUrlText" style="word-break: break-all;"></span>
                            <button id="sharedLinkCopyBtn" onclick="codeShareManager.copySharedLink()" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: inherit; display: inline-flex; align-items: center; gap: 4px;" title="Copy Link">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <button class="share-link-close-btn" onclick="codeShareManager.closeViewModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="share-link-modal-body" style="display: flex; flex-direction: column; height: 80vh; overflow: hidden; padding: 0;">
                    <div class="shared-link-code-actions" style="padding: 10px 20px; flex-shrink: 0;">
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
                    <div id="sharedLinkCodeEditor" class="shared-link-code-editor" style="flex: 1; width: 100%; border-top: 1px solid var(--border-color); min-height: 0;"></div>
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
                    <span onclick="event.stopPropagation(); codeShareManager.showViewers('${share.shareId}')" style="cursor: pointer; text-decoration: underline;" title="Click to see who viewed"><i class="fas fa-eye"></i> ${share.views || 0} views</span>
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

        if (!silent) {
            const confirmed = await customConfirm('Are you sure you want to delete this shared code?');
            if (!confirmed) return;
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

        const confirmed = await customConfirm('⚠️ Are you sure you want to delete ALL your shared codes?\n\nThis action cannot be undone!');
        if (!confirmed) return;

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

    createReceivedModal() {
        const modal = document.createElement('div');
        modal.id = 'receivedCodesModal';
        modal.className = 'share-link-modal';
        modal.innerHTML = `
            <div class="share-link-modal-content" style="max-width: 800px;">
                <div class="share-link-modal-header">
                    <h2><i class="fas fa-inbox"></i> Received Codes</h2>
                    <button class="share-link-close-btn" onclick="codeShareManager.closeReceivedModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="share-link-modal-body">
                    <div id="receivedCodesList" class="my-shares-list"></div>
                </div>
                <div class="share-link-modal-footer">
                    <button class="share-link-btn-secondary" onclick="codeShareManager.closeReceivedModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.receivedModal = modal;
    }

    closeReceivedModal() {
        this.receivedModal.style.display = 'none';
    }

    async openReceivedModal() {
        if (!window.currentUser) {
            showNotification('Please login to view received codes', 'error');
            return;
        }

        this.receivedModal.style.display = 'flex';
        const listContainer = document.getElementById('receivedCodesList');
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        try {
            // Fetch directly shared codes (from index.html flow)
            // They are at sharedCodes/{uid}/{pushId}
            const snapshot = await this.db.ref(`sharedCodes/${window.currentUser.uid}`).once('value');
            const codes = [];

            if (snapshot.exists()) {
                const data = snapshot.val();

                // We need to fetch sender profiles for pictures
                const fromUids = new Set();
                Object.values(data).forEach(share => {
                    if (share.fromUid) fromUids.add(share.fromUid);
                });

                const profiles = {};
                await Promise.all(Array.from(fromUids).map(async uid => {
                    try {
                        // Fetch both profilePicture (custom upload) and photoURL (OAuth)
                        const [profilePicSnap, photoSnap] = await Promise.all([
                            this.db.ref(`users/${uid}/profilePicture`).once('value'),
                            this.db.ref(`users/${uid}/photoURL`).once('value')
                        ]);
                        const profilePicData = profilePicSnap.val();
                        const photoURL = photoSnap.val();
                        // Prioritize custom uploaded profile picture
                        if (profilePicData && profilePicData.data) {
                            profiles[uid] = { photoURL: profilePicData.data };
                        } else if (photoURL) {
                            profiles[uid] = { photoURL: photoURL };
                        }
                    } catch (e) { console.warn('Error fetching profile:', e); }
                }));

                Object.entries(data).forEach(([key, share]) => {
                    // Filter expired codes if they have expiry (future proofing)
                    if (share.expiresAt && Date.now() > share.expiresAt) return;

                    // Normalize data for display
                    codes.push({
                        ...share,
                        shareId: key,
                        title: share.folderName || `${share.language || 'Code'} snippet`,
                        author: share.from || 'Unknown',
                        authorPic: profiles[share.fromUid] ? profiles[share.fromUid].photoURL : null,
                        createdAt: share.timestamp
                    });
                });
            }

            if (codes.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No received codes</div>';
                return;
            }

            // Sort by creation date (newest first)
            codes.sort((a, b) => b.createdAt - a.createdAt);

            listContainer.innerHTML = codes.map(share => this.renderReceivedItem(share)).join('');

        } catch (error) {
            console.error('Error loading received codes:', error);
            listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--danger-color);">Failed to load received codes</div>';
        }
    }

    renderReceivedItem(share) {
        // Map to format expected by openPreviewModal if needed, 
        // but since we just display here, we use the local format.
        // We'll attach data to the element to be used by viewSharedCode-like logic

        // Use a generic placeholder if no pic
        // Use a generic placeholder if no pic
        const picUrl = share.authorPic || `https://ui-avatars.com/api/?name=${share.author.replace(/\s+/g, '+')}&background=0D8ABC&color=fff&size=40`;
        const isUnread = !share.read;
        const unreadClass = isUnread ? 'unread-item' : '';
        const newBadge = isUnread ? '<span class="new-indicator" style="background: var(--accent-color); color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.7rem; margin-left: 8px; vertical-align: middle;">NEW</span>' : '';

        return `
            <div class="share-item ${unreadClass}" onclick="codeShareManager.viewReceivedCode('${share.shareId}')" style="cursor: pointer; position: relative; ${isUnread ? 'border-left: 3px solid var(--accent-color); background: var(--bg-primary);' : ''}">
                <div class="share-item-header">
                    <div class="share-item-title">
                        <img src="${picUrl}" draggable="false" ondragstart="return false" oncontextmenu="return false" onclick="event.stopPropagation(); codeShareManager.openProfileCard('${share.fromUid}')" style="width: 30px; height: 30px; border-radius: 50%; margin-right: 10px; object-fit: cover; cursor: pointer; -webkit-user-drag: none;" title="View Profile">
                        <div>
                            <strong>${share.title} ${newBadge}</strong>
                            <div style="font-size: 0.8em; color: var(--text-secondary);">by <span onclick="event.stopPropagation(); codeShareManager.openProfileCard('${share.fromUid}')" style="cursor: pointer; text-decoration: underline;">${share.author}</span></div>
                        </div>
                    </div>
                    <div class="share-item-actions" onclick="event.stopPropagation();">
                        <span class="share-item-language">${share.language || 'Folder'}</span>
                        <button onclick="event.stopPropagation(); codeShareManager.deleteReceivedCode('${share.shareId}', '${share.title.replace(/'/g, "\\'")}')" style="background: transparent; border: none; color: var(--danger-color, #ef4444); cursor: pointer; padding: 4px 8px; font-size: 0.9rem;" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="share-item-meta">
                    <span><i class="fas fa-calendar"></i> ${new Date(share.createdAt).toLocaleDateString()} ${new Date(share.createdAt).toLocaleTimeString()}</span>
                </div>
            </div>
        `;
    }

    async viewReceivedCode(shareId) {
        // Reuse existing view logic but adapt data
        try {
            const snapshot = await this.db.ref(`sharedCodes/${window.currentUser.uid}/${shareId}`).once('value');
            if (!snapshot.exists()) return;

            const data = snapshot.val();

            // Mark as read
            if (!data.read) {
                this.db.ref(`sharedCodes/${window.currentUser.uid}/${shareId}`).update({ read: true });
            }

            // If it's a folder, handled differently (optional, based on index.html logic)
            if (data.folderName) {
                // Use the global viewSharedFolder from index.html if available
                if (window.viewSharedFolder) {
                    window.viewSharedFolder(shareId, data);
                    this.closeReceivedModal();
                    return;
                }
            }

            // Adapt to standard share data format for displaySharedCode
            const standardData = {
                code: data.code,
                language: data.language,
                title: `Code from ${data.from}`,
                author: data.from,
                authorId: data.fromUid,
                createdAt: data.timestamp,
                readOnly: true, // Received codes are read-only
                authorPic: null, // Will be fetched if needed, or we can pass it if we had it stored
                originalShareId: data.originalShareId || shareId // Use stored originalShareId or fallback to shareId
            };

            // Fetch author pic again for the view - prioritize profilePicture over photoURL
            if (data.fromUid) {
                try {
                    const [profilePicSnap, photoSnap] = await Promise.all([
                        this.db.ref(`users/${data.fromUid}/profilePicture`).once('value'),
                        this.db.ref(`users/${data.fromUid}/photoURL`).once('value')
                    ]);
                    const profilePicData = profilePicSnap.val();
                    if (profilePicData && profilePicData.data) {
                        standardData.authorPic = profilePicData.data;
                    } else if (photoSnap.exists()) {
                        standardData.authorPic = photoSnap.val();
                    }
                } catch (e) {
                    // Ignore
                }
            }

            this.displaySharedCode(standardData);
            this.closeReceivedModal();

        } catch (error) {
            console.error("Error viewing received code:", error);
            showNotification("Error opening code", "error");
        }
    }

    async deleteReceivedCode(shareId, title) {
        if (!window.currentUser || !this.db) return;

        // Use customConfirm if available, otherwise fallback to confirm
        const confirmDelete = typeof customConfirm === 'function'
            ? () => customConfirm(`Are you sure you want to delete "${title}" from your inbox?`)
            : () => Promise.resolve(confirm(`Are you sure you want to delete "${title}" from your inbox?`));

        try {
            const confirmed = await confirmDelete();
            if (!confirmed) return;

            await this.db.ref(`sharedCodes/${window.currentUser.uid}/${shareId}`).remove();
            showNotification('Code deleted from inbox', 'success');

            // Refresh the received list
            this.openReceivedModal();
        } catch (error) {
            console.error('Error deleting received code:', error);
            showNotification('Failed to delete code', 'error');
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
                try {
                    await this.db.ref(`sharedCodes/${shareId}`).remove();

                    if (sharedData.authorId) {
                        this.db.ref(`users/${sharedData.authorId}/sharedCodes/${shareId}`).remove()
                            .catch(e => console.warn('Could not remove expired share from author profile:', e.code));
                    }
                } catch (e) {
                    console.warn('Error cleanup expired share:', e);
                }

                showNotification('This shared code has expired', 'error');
                return;
            }

            // Fetch author profile picture if available - prioritize custom upload over OAuth
            if (sharedData.authorId) {
                try {
                    const [profilePicSnap, photoSnap] = await Promise.all([
                        this.db.ref(`users/${sharedData.authorId}/profilePicture`).once('value'),
                        this.db.ref(`users/${sharedData.authorId}/photoURL`).once('value')
                    ]);
                    const profilePicData = profilePicSnap.val();

                    // Prioritize custom uploaded profile picture over OAuth photoURL
                    if (profilePicData && profilePicData.data) {
                        sharedData.authorPic = profilePicData.data;
                    } else if (photoSnap.exists()) {
                        sharedData.authorPic = photoSnap.val();
                    }
                } catch (e) {
                    // Ignore errors fetching profile
                }
            }

            // Display in modal immediately so user sees content
            this.displaySharedCode(sharedData);

            // Auto-save to 'Received Codes' (Inbox) if logged in and not author
            // Only save if not already saved (check first)
            if (window.currentUser && sharedData.authorId && sharedData.authorId !== window.currentUser.uid) {
                const inboxRef = this.db.ref(`sharedCodes/${window.currentUser.uid}/${shareId}`);

                // Check if already exists in inbox
                const existingSnap = await inboxRef.once('value');
                if (!existingSnap.exists()) {
                    // Only save if not already in inbox
                    const inboxData = {
                        from: sharedData.author || 'Unknown',
                        fromUid: sharedData.authorId,
                        code: sharedData.code,
                        language: sharedData.language,
                        timestamp: Date.now(),
                        expiresAt: sharedData.expiresAt || null,
                        authorPic: sharedData.authorPic || null,
                        read: true,
                        originalShareId: shareId
                    };
                    inboxRef.set(inboxData).catch(e => console.warn('Auto-save to inbox failed:', e));
                }
            }

            // Update view count (best effort)
            try {
                const newViews = (sharedData.views || 0) + 1;

                // Update global share record
                await this.db.ref(`sharedCodes/${shareId}`).update({
                    views: newViews,
                    lastViewed: Date.now()
                });

                // Track unique viewers if user is logged in
                if (window.currentUser && sharedData.authorId && sharedData.authorId !== window.currentUser.uid) {
                    const viewerData = {
                        uid: window.currentUser.uid,
                        displayName: window.currentUser.displayName || window.currentUser.email || 'Anonymous',
                        photoURL: window.currentUser.photoURL || null,
                        viewedAt: Date.now()
                    };

                    // Store viewer under the global share record (use uid as key to prevent duplicates)
                    // This path is readable and we can write with proper auth
                    this.db.ref(`sharedCodes/${shareId}/viewers/${window.currentUser.uid}`).set(viewerData).catch(e => {
                        console.warn('Could not track viewer:', e.code);
                    });
                }

                // Try to update author's record if it's a different user
                // This might fail due to rules, so we catch it specifically
                if (sharedData.authorId) {
                    this.db.ref(`users/${sharedData.authorId}/sharedCodes/${shareId}`).update({
                        views: newViews
                    }).catch(e => {
                        // Ignore permission errors for cross-user writes
                        console.warn('Could not update author view count:', e.code);
                    });
                }
            } catch (updateError) {
                console.warn('Error updating view statistics:', updateError);
            }

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

        let authorHtml = `<i class="fas fa-user"></i> ${sharedData.author}`;
        if (sharedData.authorPic) {
            authorHtml = `<img src="${sharedData.authorPic}" draggable="false" ondragstart="return false" oncontextmenu="return false" onclick="codeShareManager.openProfileCard('${sharedData.authorId}')" style="width: 20px; height: 20px; border-radius: 50%; vertical-align: middle; margin-right: 5px; cursor: pointer; -webkit-user-drag: none;" title="View Profile"> <span onclick="codeShareManager.openProfileCard('${sharedData.authorId}')" style="cursor: pointer; text-decoration: underline;">${sharedData.author}</span>`;
        } else if (sharedData.authorId) {
            // Link to profile even if no pic
            const placeholder = `https://ui-avatars.com/api/?name=${sharedData.author.replace(/\s+/g, '+')}&background=0D8ABC&color=fff&size=20`;
            authorHtml = `<img src="${placeholder}" draggable="false" ondragstart="return false" oncontextmenu="return false" onclick="codeShareManager.openProfileCard('${sharedData.authorId}')" style="width: 20px; height: 20px; border-radius: 50%; vertical-align: middle; margin-right: 5px; cursor: pointer; -webkit-user-drag: none;" title="View Profile"> <span onclick="codeShareManager.openProfileCard('${sharedData.authorId}')" style="cursor: pointer; text-decoration: underline;">${sharedData.author}</span>`;
        }
        document.getElementById('sharedLinkAuthor').innerHTML = authorHtml;

        // Create Monaco editor for viewing
        const editorContainer = document.getElementById('sharedLinkCodeEditor');

        // Dispose existing editor to prevent context attribute errors
        if (window.sharedCodeEditor) {
            if (typeof window.sharedCodeEditor.dispose === 'function') {
                window.sharedCodeEditor.dispose();
            }
            window.sharedCodeEditor = null;
        }
        editorContainer.innerHTML = '';
        editorContainer.removeAttribute('data-keybinding-context');

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

        // Set the share link URL for display
        const shareId = sharedData.shareId || sharedData.originalShareId;
        if (shareId) {
            const shareUrl = `${window.location.origin}?share=${shareId}`;
            window.currentShareUrl = shareUrl;
            document.getElementById('sharedLinkUrlText').textContent = shareUrl;
            document.getElementById('sharedLinkUrlRow').style.display = 'flex';
        } else {
            window.currentShareUrl = null;
            document.getElementById('sharedLinkUrlRow').style.display = 'none';
        }

        this.viewModal.style.display = 'flex';
    }

    copySharedCode() {
        if (window.sharedCodeEditor) {
            const code = window.sharedCodeEditor.getValue();
            navigator.clipboard.writeText(code);
            showNotification('Code copied to clipboard!', 'success');
        }
    }

    copySharedLink() {
        if (window.currentShareUrl) {
            navigator.clipboard.writeText(window.currentShareUrl);
            showNotification('Share link copied to clipboard!', 'success');
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
                <div class="share-link-modal-body" style="display: flex; flex-direction: column; height: 80vh; overflow: hidden; padding: 0;">
                    <div class="shared-link-code-actions" style="padding: 10px 20px; flex-shrink: 0;">
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
                    <div id="previewCodeEditor" class="shared-link-code-editor" style="flex: 1; width: 100%; border-top: 1px solid var(--border-color); min-height: 0;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.previewModal = modal;
    }

    createProfileModal() {
        const modal = document.createElement('div');
        modal.id = 'userProfileModal';
        modal.className = 'share-link-modal'; // Reuse existing modal style
        modal.style.zIndex = '10002'; // Higher than other modals
        modal.innerHTML = `
            <div class="share-link-modal-content" style="max-width: 400px; text-align: center;">
                <div class="share-link-modal-header" style="justify-content: flex-end; border-bottom: none;">
                    <button class="share-link-close-btn" onclick="codeShareManager.closeProfileModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="share-link-modal-body" style="padding: 0 20px 30px;">
                    <div class="profile-card-image-container" style="position: relative; width: 120px; height: 120px; margin: 0 auto 20px;">
                        <img id="profileCardImage" src="" draggable="false" ondragstart="return false" oncontextmenu="return false" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 4px solid var(--accent-color); box-shadow: 0 4px 15px rgba(0,0,0,0.3); user-select: none; -webkit-user-drag: none;">
                        <div id="profileCardStatusDot" style="position: absolute; bottom: 5px; right: 5px; width: 24px; height: 24px; border-radius: 50%; background: #44b700; border: 3px solid var(--bg-secondary); display: none;"></div>
                    </div>
                    
                    <h2 id="profileCardName" style="margin: 0; font-size: 1.5rem; color: var(--text-primary);"></h2>
                    <div id="profileCardUsername" style="color: var(--text-secondary); margin-bottom: 15px; font-size: 1rem;"></div>
                    
                    <div id="profileCardStatus" style="background: var(--bg-primary); padding: 10px; border-radius: 8px; margin-bottom: 20px; font-style: italic; color: var(--text-secondary); display: none;"></div>
                    
                    <div id="profileCardActions" style="margin-bottom: 20px; display: none;">
                        <button id="profileAddFriendBtn" class="share-link-btn-primary" style="width: 100%; border-radius: 20px;">
                            <i class="fas fa-user-plus"></i> Add Friend
                        </button>
                        <button id="profileAlreadyFriendBtn" class="share-link-btn-secondary" style="width: 100%; border-radius: 20px; cursor: default; opacity: 0.7;" disabled>
                            <i class="fas fa-check"></i> Already Friends
                        </button>
                        <div id="profileRequestSentMsg" style="color: var(--success-color); margin-top: 10px; display: none;">
                           <i class="fas fa-check-circle"></i> Request Sent!
                        </div>
                    </div>

                    <div class="profile-card-stats" style="display: flex; justify-content: space-around; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
                        <div class="stat-item">
                            <div style="font-weight: bold; font-size: 1.2rem; color: var(--accent-color);" id="profileJoinedDate">-</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Joined</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.profileModal = modal;
    }

    createViewersModal() {
        const modal = document.createElement('div');
        modal.id = 'viewersModal';
        modal.className = 'share-link-modal';
        modal.style.zIndex = '10003';
        modal.innerHTML = `
            <div class="share-link-modal-content" style="max-width: 400px;">
                <div class="share-link-modal-header">
                    <h2><i class="fas fa-eye"></i> Viewers</h2>
                    <button class="share-link-close-btn" onclick="codeShareManager.closeViewersModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="share-link-modal-body" style="padding: 0;">
                    <div id="viewersList" style="display: flex; flex-direction: column; gap: 12px; max-height: 350px; overflow-y: auto; padding: 15px;">
                        <div style="text-align: center; color: var(--text-secondary);">Loading...</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.viewersModal = modal;
    }

    closeViewersModal() {
        if (this.viewersModal) {
            this.viewersModal.style.display = 'none';
        }
    }

    async showViewers(shareId) {
        if (!this.db || !shareId) return;

        // Show modal with loading state
        this.viewersModal.style.display = 'flex';
        const viewersList = document.getElementById('viewersList');
        viewersList.innerHTML = '<div style="text-align: center; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        try {
            // Fetch viewers from global sharedCodes record
            const viewersSnap = await this.db.ref(`sharedCodes/${shareId}/viewers`).once('value');

            if (!viewersSnap.exists()) {
                viewersList.innerHTML = '<div style="text-align: center; color: var(--text-secondary);"><i class="fas fa-user-slash"></i> No viewers yet</div>';
                return;
            }

            const viewers = viewersSnap.val();
            const viewerEntries = Object.values(viewers);

            if (viewerEntries.length === 0) {
                viewersList.innerHTML = '<div style="text-align: center; color: var(--text-secondary);"><i class="fas fa-user-slash"></i> No viewers yet</div>';
                return;
            }

            // Sort by viewedAt (most recent first)
            viewerEntries.sort((a, b) => (b.viewedAt || 0) - (a.viewedAt || 0));

            // Build viewers list HTML
            let html = '';
            for (const viewer of viewerEntries) {
                const displayName = viewer.displayName || 'Anonymous';
                let photoURL = viewer.photoURL;

                // Try to fetch updated profile picture
                try {
                    const [profilePicSnap, photoSnap] = await Promise.all([
                        this.db.ref(`users/${viewer.uid}/profilePicture`).once('value'),
                        this.db.ref(`users/${viewer.uid}/photoURL`).once('value')
                    ]);
                    const profilePicData = profilePicSnap.val();
                    if (profilePicData && profilePicData.data) {
                        photoURL = profilePicData.data;
                    } else if (photoSnap.exists()) {
                        photoURL = photoSnap.val();
                    }
                } catch (e) {
                    // Use stored photoURL if fetch fails
                }

                if (!photoURL) {
                    photoURL = `https://ui-avatars.com/api/?name=${displayName.replace(/\s+/g, '+')}&background=0D8ABC&color=fff&size=40`;
                }

                const viewedDate = viewer.viewedAt ? new Date(viewer.viewedAt).toLocaleDateString() : '';

                html += `
                    <div style="display: flex; align-items: center; gap: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 8px; cursor: pointer;" onclick="codeShareManager.closeViewersModal(); codeShareManager.openProfileCard('${viewer.uid}')">
                        <img src="${photoURL}" draggable="false" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; -webkit-user-drag: none;" alt="${displayName}">
                        <div style="flex: 1;">
                            <div style="font-weight: 500; color: var(--text-primary);">${displayName}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Viewed ${viewedDate}</div>
                        </div>
                    </div>
                `;
            }

            viewersList.innerHTML = html;

        } catch (error) {
            console.error('Error fetching viewers:', error);
            viewersList.innerHTML = '<div style="text-align: center; color: var(--text-secondary);"><i class="fas fa-exclamation-triangle"></i> Failed to load viewers</div>';
        }
    }

    closeProfileModal() {
        this.profileModal.style.display = 'none';
    }

    async openProfileCard(uid) {
        if (!this.db || !uid) return;

        // Show loading state
        this.profileModal.style.display = 'flex';
        document.getElementById('profileCardName').textContent = 'Loading...';
        document.getElementById('profileCardImage').src = 'https://ui-avatars.com/api/?name=Loading&background=0D8ABC&color=fff';
        document.getElementById('profileCardStatus').style.display = 'none';

        try {
            // Fetch allowed public fields manually to avoid permission errors
            // We can read 'username', 'displayName', 'photoURL', 'status' based on rules
            const userRef = this.db.ref(`users/${uid}`);

            const [usernameSnap, displayNameSnap, photoSnap, statusSnap, profilePicSnap] = await Promise.all([
                userRef.child('username').once('value'),
                userRef.child('displayName').once('value'),
                userRef.child('photoURL').once('value'),
                userRef.child('status').once('value'),
                userRef.child('profilePicture').once('value')
            ]);

            const username = usernameSnap.val() || 'unknown';
            const displayName = displayNameSnap.val() || username;
            const photoURL = photoSnap.val();
            const status = statusSnap.val();
            const profilePicData = profilePicSnap.val();

            // Prioritize custom uploaded profile picture over OAuth photoURL
            let profileImageUrl;
            if (profilePicData && profilePicData.data) {
                profileImageUrl = profilePicData.data;
            } else if (photoURL) {
                profileImageUrl = photoURL;
            } else {
                // Generate avatar from initials
                const initial = (displayName || username || 'U').charAt(0).toUpperCase();
                profileImageUrl = `https://ui-avatars.com/api/?name=${initial}&background=0D8ABC&color=fff&size=150`;
            }

            // Update UI
            document.getElementById('profileCardName').textContent = displayName;
            document.getElementById('profileCardUsername').textContent = `@${username}`;
            document.getElementById('profileCardImage').src = profileImageUrl;

            let statusText = null;
            if (typeof status === 'string') {
                statusText = status;
            } else if (status && typeof status === 'object') {
                // Handle complex status objects (e.g. presence data)
                statusText = status.message || status.text || status.state || null;
            }

            if (statusText) {
                const statusEl = document.getElementById('profileCardStatus');
                statusEl.textContent = `"${statusText}"`;
                statusEl.style.display = 'block';
            }

            // Friend Check & Add Friend Button Logic
            const actionContainer = document.getElementById('profileCardActions');
            const addBtn = document.getElementById('profileAddFriendBtn');
            const friendsBtn = document.getElementById('profileAlreadyFriendBtn');
            const sentMsg = document.getElementById('profileRequestSentMsg');

            actionContainer.style.display = 'none';
            addBtn.style.display = 'none';
            friendsBtn.style.display = 'none';
            sentMsg.style.display = 'none';

            if (window.currentUser && window.currentUser.uid !== uid) {
                actionContainer.style.display = 'block';

                // Check if already friends
                const friendshipSnap = await this.db.ref(`friends/${window.currentUser.uid}/${uid}`).once('value');
                if (friendshipSnap.exists()) {
                    friendsBtn.style.display = 'block';
                } else {
                    // Check if request already sent (optional optimization, but good for UI)
                    const requestSnap = await this.db.ref(`friendRequests/${uid}/${window.currentUser.uid}`).once('value');
                    if (requestSnap.exists()) {
                        sentMsg.style.display = 'block';
                        sentMsg.innerHTML = '<i class="fas fa-clock"></i> Request Pending';
                    } else {
                        addBtn.style.display = 'block';
                        addBtn.onclick = () => this.sendFriendRequestFromProfile(uid);
                    }
                }
            }

            // For Joined Date, we might not have permission to read 'createdAt' or it might not be in the allowed list.
            // If we didn't add it to rules, we leave it as placeholder or hide it.
            // Let's hide it for now to be safe.
            document.querySelector('.profile-card-stats').style.display = 'none';

        } catch (error) {
            console.error('Error opening profile card:', error);
            showNotification('Failed to load profile', 'error');
            this.closeProfileModal();
        }
    }

    async sendFriendRequestFromProfile(targetUid) {
        if (!window.currentUser || !this.db) return;

        const btn = document.getElementById('profileAddFriendBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        btn.disabled = true;

        try {
            // Re-use logic similar to main app's send friend request
            // We write to friendRequests/{targetUid}/{currentUid}
            const requestRef = this.db.ref(`friendRequests/${targetUid}/${window.currentUser.uid}`);

            const userData = {
                email: window.currentUser.email,
                uid: window.currentUser.uid,
                status: 'pending',
                timestamp: Date.now()
            };

            // Try to get username/photo if we have it in global state, else just send basics
            // The receiver will likely fetch profile on their end anyway

            await requestRef.set(userData);

            btn.style.display = 'none';
            document.getElementById('profileRequestSentMsg').style.display = 'block';
            showNotification('Friend request sent!', 'success');

        } catch (error) {
            console.error('Error sending friend request:', error);
            showNotification('Failed to send request', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
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
            window.currentPreviewShareId = shareId;

            // Update metadata
            document.getElementById('previewTitle').textContent = shareData.title || 'Code Preview';
            document.getElementById('previewLanguage').innerHTML =
                `<i class="fas fa-code"></i> ${shareData.language.toUpperCase()}`;
            document.getElementById('previewDate').innerHTML =
                `<i class="fas fa-calendar"></i> ${new Date(shareData.createdAt).toLocaleDateString()}`;

            // Make views clickable to show viewers
            const viewsElement = document.getElementById('previewViews');
            viewsElement.innerHTML = `<i class="fas fa-eye"></i> ${shareData.views || 0} views`;
            viewsElement.style.cursor = 'pointer';
            viewsElement.style.textDecoration = 'underline';
            viewsElement.title = 'Click to see who viewed';
            viewsElement.onclick = () => this.showViewers(shareId);

            // Create Monaco editor for viewing
            const editorContainer = document.getElementById('previewCodeEditor');

            // Dispose existing editor to prevent context attribute errors
            if (window.previewCodeEditor) {
                if (typeof window.previewCodeEditor.dispose === 'function') {
                    window.previewCodeEditor.dispose();
                }
                window.previewCodeEditor = null;
            }
            editorContainer.innerHTML = '';
            editorContainer.removeAttribute('data-keybinding-context');

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
