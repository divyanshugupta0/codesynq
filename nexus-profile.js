// Profile functionality for NexusCode (nexuscode.html)
// Uses window.database which is set in nexuscode.html's inline script

/**
 * Compress and convert image to base64 format
 */
function compressImage(file, maxWidth = 500, maxHeight = 500, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (file.size > 10 * 1024 * 1024) {
            reject(new Error('Image size must be less than 10MB'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Load profile picture from Firebase
 */
async function loadProfilePicture() {
    if (!window.currentUser) return;
    if (!window.database) {
        setTimeout(loadProfilePicture, 500);
        return;
    }

    try {
        // Load user data for displayName
        const userSnap = await window.database.ref(`users/${window.currentUser.uid}`).once('value');
        const userData = userSnap.val();

        if (userData && userData.displayName) {
            const nameEl = document.getElementById('profileName');
            if (nameEl) nameEl.textContent = userData.displayName;
        }

        // Load profile picture
        const picSnap = await window.database.ref(`users/${window.currentUser.uid}/profilePicture`).once('value');
        const picData = picSnap.val();

        let imageUrl = null;
        if (picData && picData.data) {
            imageUrl = picData.data;
        } else if (window.currentUser.photoURL) {
            imageUrl = window.currentUser.photoURL;
        }

        const profilePic = document.getElementById('profilePicture');
        const profileBtnImg = document.getElementById('profileBtnImage');
        const profileBtnIcon = document.querySelector('#profileBtn i');
        const removeBtn = document.getElementById('removeProfilePicBtn');

        if (imageUrl) {
            if (profilePic) {
                profilePic.src = imageUrl;
                profilePic.style.display = 'block';
            }
            if (profileBtnImg) {
                profileBtnImg.src = imageUrl;
                profileBtnImg.style.display = 'block';
            }
            if (profileBtnIcon) profileBtnIcon.style.display = 'none';
            if (picData && picData.data && removeBtn) {
                removeBtn.style.display = 'block';
            }
        } else {
            setDefaultProfilePicture();
            if (removeBtn) removeBtn.style.display = 'none';
        }
    } catch (err) {
        console.error('Error loading profile:', err);
        setDefaultProfilePicture();
    }
}

/**
 * Set default avatar with user initial
 */
function setDefaultProfilePicture() {
    if (!window.currentUser) return;

    const initial = (window.currentUser.displayName || window.currentUser.email || 'U').charAt(0).toUpperCase();
    const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23007acc'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='white' font-size='40' font-family='Arial'%3E${initial}%3C/text%3E%3C/svg%3E`;

    const profilePic = document.getElementById('profilePicture');
    const profileBtnImg = document.getElementById('profileBtnImage');
    const profileBtnIcon = document.querySelector('#profileBtn i');

    if (profilePic) {
        profilePic.src = svg;
        profilePic.style.display = 'block';
    }
    if (profileBtnImg) {
        profileBtnImg.src = svg;
        profileBtnImg.style.display = 'block';
    }
    if (profileBtnIcon) profileBtnIcon.style.display = 'none';
}

/**
 * Upload profile picture
 */
async function uploadProfilePicture(file) {
    if (!window.currentUser) {
        showNotification('Please login first', 'error');
        return;
    }
    if (!window.database) {
        showNotification('Database not available', 'error');
        return;
    }

    try {
        showNotification('Compressing image...', 'info');
        const compressed = await compressImage(file);

        showNotification('Uploading...', 'info');
        await window.database.ref(`users/${window.currentUser.uid}/profilePicture`).set({
            data: compressed,
            uploadedAt: firebase.database.ServerValue.TIMESTAMP
        });

        // Update UI
        const profilePic = document.getElementById('profilePicture');
        const profileBtnImg = document.getElementById('profileBtnImage');
        const profileBtnIcon = document.querySelector('#profileBtn i');
        const removeBtn = document.getElementById('removeProfilePicBtn');

        if (profilePic) {
            profilePic.src = compressed;
            profilePic.style.display = 'block';
        }
        if (profileBtnImg) {
            profileBtnImg.src = compressed;
            profileBtnImg.style.display = 'block';
        }
        if (profileBtnIcon) profileBtnIcon.style.display = 'none';
        if (removeBtn) removeBtn.style.display = 'block';

        showNotification('Profile picture updated!', 'success');
    } catch (err) {
        console.error('Upload error:', err);
        showNotification(err.message || 'Upload failed', 'error');
    }
}

/**
 * Remove profile picture
 */
async function removeProfilePicture() {
    if (!window.currentUser || !window.database) return;

    const confirmed = await window.customConfirm('Remove your profile picture?');
    if (!confirmed) return;

    try {
        await window.database.ref(`users/${window.currentUser.uid}/profilePicture`).remove();
        setDefaultProfilePicture();

        const removeBtn = document.getElementById('removeProfilePicBtn');
        if (removeBtn) removeBtn.style.display = 'none';

        showNotification('Profile picture removed', 'success');
    } catch (err) {
        console.error('Remove error:', err);
        showNotification('Failed to remove', 'error');
    }
}

/**
 * Setup profile listeners
 */
function setupProfilePictureListeners() {
    if (window._profileListenersSetup) return;
    window._profileListenersSetup = true;

    const uploadBtn = document.getElementById('uploadProfilePicBtn');
    const removeBtn = document.getElementById('removeProfilePicBtn');
    const fileInput = document.getElementById('profilePictureInput');
    const container = document.getElementById('profilePictureContainer');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
            if (window.currentUser) fileInput.click();
        });
    }

    if (container && fileInput) {
        container.addEventListener('click', () => {
            if (window.currentUser) fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showNotification('Please select an image', 'error');
                fileInput.value = '';
                return;
            }

            await uploadProfilePicture(file);
            fileInput.value = '';
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', removeProfilePicture);
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupProfilePictureListeners);
} else {
    setupProfilePictureListeners();
}

// Export to window
window.loadProfilePicture = loadProfilePicture;
window.uploadProfilePicture = uploadProfilePicture;
window.removeProfilePicture = removeProfilePicture;
window.setDefaultProfilePicture = setDefaultProfilePicture;
window.loadNexusProfile = loadProfilePicture; // Alias for compatibility
