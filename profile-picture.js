// Profile Picture Upload Functionality for CodeSynq
// Handles image upload, compression, base64 conversion, and Firebase storage

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Compress and convert image to base64 format
 * @param {File} file - The image file to compress
 * @param {number} maxWidth - Maximum width for the compressed image
 * @param {number} maxHeight - Maximum height for the compressed image
 * @param {number} quality - JPEG quality (0-1)
 * @returns {Promise<string>} - Base64 encoded image string
 */
function compressImage(file, maxWidth = 500, maxHeight = 500, quality = 0.8) {
    return new Promise((resolve, reject) => {
        // Check file size
        if (file.size > MAX_FILE_SIZE) {
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

                // Calculate new dimensions while maintaining aspect ratio
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

                // Convert to base64 with compression
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);

                // Check if compressed size is reasonable (< 1MB base64)
                const sizeInBytes = (compressedBase64.length * 3) / 4;
                if (sizeInBytes > 1024 * 1024) {
                    // Try with lower quality
                    const lowerQuality = canvas.toDataURL('image/jpeg', 0.6);
                    resolve(lowerQuality);
                } else {
                    resolve(compressedBase64);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Upload profile picture to Firebase Realtime Database
 * @param {File} file - The image file to upload
 */
async function uploadProfilePicture(file) {
    if (!window.currentUser) {
        if (typeof showNotification === 'function') {
            showNotification('Please login to upload profile picture', 'error');
        } else {
            alert('Please login to upload profile picture');
        }
        return;
    }

    try {
        if (typeof showNotification === 'function') {
            showNotification('Compressing image...', 'info');
        }

        // Compress image to base64
        const compressedImage = await compressImage(file);

        if (typeof showNotification === 'function') {
            showNotification('Uploading profile picture...', 'info');
        }

        // Save to Firebase Realtime Database
        await database.ref(`users/${window.currentUser.uid}/profilePicture`).set({
            data: compressedImage,
            uploadedAt: firebase.database.ServerValue.TIMESTAMP
        });

        // Update UI in dropdown
        const profilePicElement = document.getElementById('profilePicture');
        if (profilePicElement) {
            profilePicElement.src = compressedImage;
        }

        // Update header button
        const profileBtnImage = document.getElementById('profileBtnImage');
        const profileBtnIcon = document.querySelector('#profileBtn i');
        const profileBtn = document.getElementById('profileBtn');
        if (profileBtnImage && profileBtnIcon && profileBtn) {
            profileBtnImage.src = compressedImage;
            profileBtnImage.style.display = 'block';
            profileBtnIcon.style.display = 'none';
            profileBtn.classList.add('has-image');
        }

        // Show remove button
        const removeBtn = document.getElementById('removeProfilePicBtn');
        if (removeBtn) {
            removeBtn.style.display = 'block';
        }

        // Update currentUser object
        window.currentUser.profilePicture = compressedImage;

        if (typeof showNotification === 'function') {
            showNotification('Profile picture updated successfully!', 'success');
        } else {
            alert('Profile picture updated successfully!');
        }
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        if (typeof showNotification === 'function') {
            showNotification(error.message || 'Failed to upload profile picture', 'error');
        } else {
            alert(error.message || 'Failed to upload profile picture');
        }
    }
}

/**
 * Load profile picture from Firebase Realtime Database
 */
async function loadProfilePicture() {
    if (!window.currentUser || typeof database === 'undefined') return;

    try {
        let imageUrl = null;

        // Priority 1: Uploaded image from Firebase (if user updated)
        const snapshot = await database.ref(`users/${window.currentUser.uid}/profilePicture`).once('value');
        const profilePicData = snapshot.val();
        if (profilePicData && profilePicData.data) {
            imageUrl = profilePicData.data;
        } else if (window.currentUser.photoURL) {
            // Priority 2: Google photoURL
            imageUrl = window.currentUser.photoURL;
        }

        const removeBtn = document.getElementById('removeProfilePicBtn');

        if (imageUrl) {
            // Display the profile picture in dropdown
            const profilePicElement = document.getElementById('profilePicture');
            if (profilePicElement) {
                profilePicElement.src = imageUrl;
                profilePicElement.style.display = 'block';
            }

            // Display in header button
            const profileBtnImage = document.getElementById('profileBtnImage');
            const profileBtnIcon = document.querySelector('#profileBtn i');
            const profileBtn = document.getElementById('profileBtn');
            if (profileBtnImage && profileBtnIcon && profileBtn) {
                profileBtnImage.src = imageUrl;
                profileBtnImage.style.display = 'block';
                profileBtnIcon.style.display = 'none';
                profileBtn.classList.add('has-image');
            }

            // Show remove button only if custom profile picture exists
            if (profilePicData && profilePicData.data && removeBtn) {
                removeBtn.style.display = 'block';
            }

            window.currentUser.profilePicture = imageUrl;
        } else {
            // Priority 3: Show avatar with user's initial
            setDefaultProfilePicture();
            if (removeBtn) removeBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading profile picture:', error);
        setDefaultProfilePicture();
    }
}

/**
 * Set default profile picture with user's initial (avatar)
 */
function setDefaultProfilePicture() {
    if (!window.currentUser) return;

    const initial = (window.currentUser.displayName || window.currentUser.email || 'U').charAt(0).toUpperCase();
    const defaultSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23007acc'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='white' font-size='40' font-family='Arial'%3E${initial}%3C/text%3E%3C/svg%3E`;

    // Display avatar in dropdown
    const profilePicElement = document.getElementById('profilePicture');
    if (profilePicElement) {
        profilePicElement.src = defaultSvg;
        profilePicElement.style.display = 'block';
    }

    // Display avatar in header button
    const profileBtnImage = document.getElementById('profileBtnImage');
    const profileBtnIcon = document.querySelector('#profileBtn i');
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtnImage && profileBtnIcon && profileBtn) {
        profileBtnImage.src = defaultSvg;
        profileBtnImage.style.display = 'block';
        profileBtnIcon.style.display = 'none';
        profileBtn.classList.add('has-image');
    }
}

/**
 * Remove profile picture
 */
async function removeProfilePicture() {
    if (!window.currentUser) return;

    const confirmed = await window.customConfirm('Are you sure you want to remove your profile picture?');
    if (!confirmed) return;

    try {
        await database.ref(`users/${window.currentUser.uid}/profilePicture`).remove();
        setDefaultProfilePicture();
        document.getElementById('removeProfilePicBtn').style.display = 'none';
        if (typeof showNotification === 'function') {
            showNotification('Profile picture removed', 'success');
        }
    } catch (error) {
        console.error('Error removing profile picture:', error);
        if (typeof showNotification === 'function') {
            showNotification('Failed to remove profile picture', 'error');
        }
    }
}

/**
 * Setup event listeners for profile picture upload
 */
function setupProfilePictureListeners() {
    const uploadBtn = document.getElementById('uploadProfilePicBtn');
    const removeBtn = document.getElementById('removeProfilePicBtn');
    const fileInput = document.getElementById('profilePictureInput');
    const pictureContainer = document.getElementById('profilePictureContainer');

    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            if (window.currentUser) {
                fileInput.click();
            } else {
                if (typeof showNotification === 'function') {
                    showNotification('Please login to upload profile picture', 'error');
                } else {
                    alert('Please login to upload profile picture');
                }
            }
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', removeProfilePicture);
    }

    if (pictureContainer) {
        pictureContainer.addEventListener('click', () => {
            if (window.currentUser) {
                fileInput.click();
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                // Validate file type
                if (!file.type.startsWith('image/')) {
                    if (typeof showNotification === 'function') {
                        showNotification('Please select an image file', 'error');
                    } else {
                        alert('Please select an image file');
                    }
                    fileInput.value = '';
                    return;
                }

                await uploadProfilePicture(file);
                // Clear input so same file can be selected again
                fileInput.value = '';
            }
        });
    }
}

// Initialize profile picture functionality when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupProfilePictureListeners);
} else {
    // DOM already loaded
    setupProfilePictureListeners();
}

// Export functions to window object for use in other files
window.loadProfilePicture = loadProfilePicture;
window.uploadProfilePicture = uploadProfilePicture;
window.setDefaultProfilePicture = setDefaultProfilePicture;
window.removeProfilePicture = removeProfilePicture;
