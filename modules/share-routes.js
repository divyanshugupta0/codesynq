/**
 * Code Share Module - Routes with Firebase Integration
 * For production deployment with persistent storage
 * 
 * Usage in server.js:
 * const shareRoutes = require('./modules/share-routes');
 * shareRoutes.setupRoutes(app, admin); // Pass Firebase admin
 */

const crypto = require('crypto');

// Firebase will be passed from server.js
let db = null;

/**
 * Setup all share-related routes with Firebase
 * @param {Express.Application} app - Express app instance
 * @param {FirebaseAdmin} admin - Firebase admin instance (optional for local dev)
 */
function setupRoutes(app, firebaseAdmin = null) {

    // Initialize Firebase if provided
    if (firebaseAdmin) {
        db = firebaseAdmin.database();
        console.log('✅ Firebase integration enabled for Code Share');

        // Setup auto-cleanup for expired shares
        setupAutoCleanup();
    } else {
        console.log('⚠️  Running Code Share without Firebase (in-memory only)');
    }

    /**
     * POST /api/share
     * Create a new shareable code link
     */
    app.post('/api/share', async (req, res) => {
        try {
            const {
                code,
                language,
                includeComments,
                readOnly,
                expiryHours,
                author,
                authorId,
                title
            } = req.body;

            // Validate required fields
            if (!code || !language) {
                return res.status(400).json({
                    success: false,
                    error: 'Code and language are required'
                });
            }

            // Generate unique share ID
            const shareId = crypto.randomBytes(8).toString('hex');

            // Calculate expiry time
            let expiresAt = null;
            if (expiryHours && expiryHours > 0) {
                expiresAt = Date.now() + (expiryHours * 60 * 60 * 1000);
            }

            // Prepare share data
            const shareData = {
                shareId,
                code,
                language,
                includeComments: includeComments !== false,
                readOnly: readOnly !== false,
                expiresAt,
                expiryHours: expiryHours || 0,
                author: author || 'Anonymous',
                authorId: authorId || null,
                title: title || 'Untitled Code',
                createdAt: Date.now(),
                views: 0,
                lastViewed: null
            };

            // Store in Firebase
            if (db) {
                await db.ref(`sharedCodes/${shareId}`).set(shareData);

                // Also store in user's shared codes list if logged in
                if (authorId) {
                    await db.ref(`users/${authorId}/sharedCodes/${shareId}`).set({
                        shareId,
                        title: shareData.title,
                        language,
                        createdAt: shareData.createdAt,
                        expiresAt,
                        views: 0
                    });
                }
            }

            console.log(`✅ Code shared: ${shareId} by ${shareData.author}`);

            res.json({
                success: true,
                shareId,
                expiresAt
            });
        } catch (error) {
            console.error('❌ Error sharing code:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to share code'
            });
        }
    });

    /**
     * GET /api/share/:shareId
     * Retrieve shared code by ID
     */
    app.get('/api/share/:shareId', async (req, res) => {
        try {
            const { shareId } = req.params;

            if (!db) {
                return res.status(503).json({
                    success: false,
                    error: 'Database not available'
                });
            }

            const snapshot = await db.ref(`sharedCodes/${shareId}`).once('value');

            if (!snapshot.exists()) {
                return res.status(404).json({
                    success: false,
                    error: 'Shared code not found'
                });
            }

            const shared = snapshot.val();

            // Check if expired
            if (shared.expiresAt && Date.now() > shared.expiresAt) {
                await deleteExpiredShare(shareId, shared.authorId);
                return res.status(404).json({
                    success: false,
                    error: 'This shared code has expired'
                });
            }

            res.json({
                success: true,
                data: {
                    code: shared.code,
                    language: shared.language,
                    readOnly: shared.readOnly,
                    author: shared.author,
                    title: shared.title,
                    createdAt: shared.createdAt,
                    views: shared.views,
                    expiresAt: shared.expiresAt
                }
            });
        } catch (error) {
            console.error('❌ Error retrieving shared code:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve shared code'
            });
        }
    });

    /**
     * POST /api/share/:shareId/view
     * Increment view count for shared code
     */
    app.post('/api/share/:shareId/view', async (req, res) => {
        try {
            const { shareId } = req.params;

            if (!db) {
                return res.json({ success: true, views: 0 });
            }

            const ref = db.ref(`sharedCodes/${shareId}`);
            const snapshot = await ref.once('value');

            if (!snapshot.exists()) {
                return res.status(404).json({
                    success: false,
                    error: 'Shared code not found'
                });
            }

            const shared = snapshot.val();
            const newViews = (shared.views || 0) + 1;

            await ref.update({
                views: newViews,
                lastViewed: Date.now()
            });

            // Update user's list too
            if (shared.authorId) {
                await db.ref(`users/${shared.authorId}/sharedCodes/${shareId}`).update({
                    views: newViews
                });
            }

            res.json({
                success: true,
                views: newViews
            });
        } catch (error) {
            console.error('❌ Error updating view count:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update view count'
            });
        }
    });

    /**
     * GET /api/my-shares
     * Get all shares by current user
     */
    app.get('/api/my-shares', async (req, res) => {
        try {
            const { userId } = req.query;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID required'
                });
            }

            if (!db) {
                return res.json({ success: true, shares: [] });
            }

            const snapshot = await db.ref(`users/${userId}/sharedCodes`).once('value');
            const shares = [];

            snapshot.forEach((child) => {
                const share = child.val();
                // Only include non-expired shares
                if (!share.expiresAt || Date.now() <= share.expiresAt) {
                    shares.push(share);
                }
            });

            // Sort by creation date (newest first)
            shares.sort((a, b) => b.createdAt - a.createdAt);

            res.json({
                success: true,
                shares
            });
        } catch (error) {
            console.error('❌ Error getting user shares:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get shares'
            });
        }
    });

    /**
     * PUT /api/share/:shareId
     * Update share settings
     */
    app.put('/api/share/:shareId', async (req, res) => {
        try {
            const { shareId } = req.params;
            const { authorId, readOnly, expiryHours } = req.body;

            if (!db) {
                return res.status(503).json({
                    success: false,
                    error: 'Database not available'
                });
            }

            const ref = db.ref(`sharedCodes/${shareId}`);
            const snapshot = await ref.once('value');

            if (!snapshot.exists()) {
                return res.status(404).json({
                    success: false,
                    error: 'Shared code not found'
                });
            }

            const shared = snapshot.val();

            // Verify author
            if (authorId && shared.authorId && authorId !== shared.authorId) {
                return res.status(403).json({
                    success: false,
                    error: 'Unauthorized to edit this share'
                });
            }

            // Calculate new expiry
            let expiresAt = shared.expiresAt;
            if (expiryHours !== undefined) {
                expiresAt = expiryHours > 0 ? Date.now() + (expiryHours * 60 * 60 * 1000) : null;
            }

            // Update share
            const updates = {};
            if (readOnly !== undefined) updates.readOnly = readOnly;
            if (expiresAt !== undefined) {
                updates.expiresAt = expiresAt;
                updates.expiryHours = expiryHours || 0;
            }

            await ref.update(updates);

            // Update user's list
            if (shared.authorId) {
                await db.ref(`users/${shared.authorId}/sharedCodes/${shareId}`).update({
                    expiresAt
                });
            }

            console.log(`✏️ Updated share: ${shareId}`);

            res.json({
                success: true,
                message: 'Share updated successfully'
            });
        } catch (error) {
            console.error('❌ Error updating share:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update share'
            });
        }
    });

    /**
     * DELETE /api/share/:shareId
     * Delete a shared code
     */
    app.delete('/api/share/:shareId', async (req, res) => {
        try {
            const { shareId } = req.params;
            const { authorId } = req.body;

            if (!db) {
                return res.status(503).json({
                    success: false,
                    error: 'Database not available'
                });
            }

            const snapshot = await db.ref(`sharedCodes/${shareId}`).once('value');

            if (!snapshot.exists()) {
                return res.status(404).json({
                    success: false,
                    error: 'Shared code not found'
                });
            }

            const shared = snapshot.val();

            // Verify author
            if (authorId && shared.authorId && authorId !== shared.authorId) {
                return res.status(403).json({
                    success: false,
                    error: 'Unauthorized to delete this share'
                });
            }

            await deleteShare(shareId, shared.authorId);

            res.json({
                success: true,
                message: 'Share deleted successfully'
            });
        } catch (error) {
            console.error('❌ Error deleting share:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete share'
            });
        }
    });

    /**
     * DELETE /api/my-shares/all
     * Delete all shares by user
     */
    app.delete('/api/my-shares/all', async (req, res) => {
        try {
            const { userId } = req.body;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID required'
                });
            }

            if (!db) {
                return res.status(503).json({
                    success: false,
                    error: 'Database not available'
                });
            }

            const snapshot = await db.ref(`users/${userId}/sharedCodes`).once('value');
            const deletePromises = [];

            snapshot.forEach((child) => {
                const shareId = child.key;
                deletePromises.push(deleteShare(shareId, userId));
            });

            await Promise.all(deletePromises);

            console.log(`🗑️ Deleted all shares for user: ${userId}`);

            res.json({
                success: true,
                message: 'All shares deleted successfully',
                count: deletePromises.length
            });
        } catch (error) {
            console.error('❌ Error deleting all shares:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete shares'
            });
        }
    });

    console.log('✅ Code Share routes initialized');
}

/**
 * Helper function to delete a share
 */
async function deleteShare(shareId, authorId) {
    if (!db) return;

    await db.ref(`sharedCodes/${shareId}`).remove();

    if (authorId) {
        await db.ref(`users/${authorId}/sharedCodes/${shareId}`).remove();
    }

    console.log(`🗑️ Deleted share: ${shareId}`);
}

/**
 * Helper function to delete expired share
 */
async function deleteExpiredShare(shareId, authorId) {
    await deleteShare(shareId, authorId);
    console.log(`⏰ Auto-deleted expired share: ${shareId}`);
}

/**
 * Setup automatic cleanup of expired shares
 * Runs every hour
 */
function setupAutoCleanup() {
    if (!db) return;

    setInterval(async () => {
        try {
            const now = Date.now();
            const snapshot = await db.ref('sharedCodes').once('value');
            const deletePromises = [];

            snapshot.forEach((child) => {
                const share = child.val();
                if (share.expiresAt && now > share.expiresAt) {
                    deletePromises.push(deleteExpiredShare(child.key, share.authorId));
                }
            });

            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
                console.log(`🧹 Auto-cleanup: Deleted ${deletePromises.length} expired shares`);
            }
        } catch (error) {
            console.error('❌ Error in auto-cleanup:', error);
        }
    }, 60 * 60 * 1000); // Every hour

    console.log('🧹 Auto-cleanup scheduled for expired shares');
}

module.exports = {
    setupRoutes
};
