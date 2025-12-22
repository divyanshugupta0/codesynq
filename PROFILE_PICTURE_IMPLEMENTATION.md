# Profile Picture Upload Implementation Guide

## Overview
This guide explains how to add profile picture upload functionality to the CodeSynq application. The profile picture will be:
1. Uploaded by the user (max 10MB)
2. Compressed and converted to base64 text format
3. Stored in Firebase Realtime Database
4. Loaded and displayed when the user logs in

## Step 1: Update HTML (index.html)

Find the profile dropdown section (around line 207-218) and replace it with:

```html
<div class="profile-dropdown">
    <button id="profileBtn" class="btn-icon" title="User Profile"><i class="fas fa-user"></i></button>
    <div id="profileMenu" class="dropdown-menu">
        <div class="profile-info">
            <div class="profile-picture-container" id="profilePictureContainer">
                <img id="profilePicture" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23007acc'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='white' font-size='40' font-family='Arial'%3EU%3C/text%3E%3C/svg%3E" alt="Profile Picture" class="profile-picture">
                <div class="profile-picture-overlay">
                    <i class="fas fa-camera"></i>
                </div>
            </div>
            <span id="profileName">User</span>
            <span id="profileEmail">user@email.com</span>
            <span id="profileUsername">@username</span>
        </div>
        <input type="file" id="profilePictureInput" accept="image/*" style="display: none;">
        <button id="uploadProfilePicBtn" title="Upload or update profile picture"><i class="fas fa-camera"></i> Upload Profile Picture</button>
        <button id="changeUsernameBtn" title="Change your username"><i class="fas fa-edit"></i> Change Username</button>
        <button onclick="signOut()" title="Sign out of your account"><i class="fas fa-sign-out-alt"></i> Sign Out</button>
    </div>
</div>
```

## Step 2: Add CSS Styling (style.css)

Add these styles at the end of your style.css file:

```css
/* Profile Picture Styles */
.profile-picture-container {
    position: relative;
    width: 100px;
    height: 100px;
    margin: 0 auto 15px;
    cursor: pointer;
    border-radius: 50%;
    overflow: hidden;
    border: 3px solid var(--primary-color);
    transition: all 0.3s ease;
}

.profile-picture-container:hover {
    transform: scale(1.05);
    box-shadow: 0 0 20px rgba(0, 122, 204, 0.5);
}

.profile-picture {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.profile-picture-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.profile-picture-container:hover .profile-picture-overlay {
    opacity: 1;
}

.profile-picture-overlay i {
    color: white;
    font-size: 24px;
}

#uploadProfilePicBtn {
    width: 100%;
    padding: 10px;
    margin-bottom: 8px;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

#uploadProfilePicBtn:hover {
    background: var(--primary-hover);
    transform: translateY(-2px);
}
```

## Step 3: Add JavaScript Functionality

Create a new file called `profile-picture.js` in your project root with the following code:

```javascript
// Profile Picture Upload Functionality

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Compress and convert image to base64
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
                resolve(compressedBase64);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// Upload profile picture to Firebase
async function uploadProfilePicture(file) {
    if (!window.currentUser) {
        showNotification('Please login to upload profile picture', 'error');
        return;
    }

    try {
        showNotification('Compressing image...', 'info');
        
        // Compress image to base64
        const compressedImage = await compressImage(file);
        
        showNotification('Uploading profile picture...', 'info');
        
        // Save to Firebase Realtime Database
        await database.ref(`users/${window.currentUser.uid}/profilePicture`).set({
            data: compressedImage,
            uploadedAt: firebase.database.ServerValue.TIMESTAMP
        });

        // Update UI
        document.getElementById('profilePicture').src = compressedImage;
        
        // Update currentUser object
        window.currentUser.profilePicture = compressedImage;
        
        showNotification('Profile picture updated successfully!', 'success');
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        showNotification(error.message || 'Failed to upload profile picture', 'error');
    }
}

// Load profile picture from Firebase
async function loadProfilePicture() {
    if (!window.currentUser) return;

    try {
        const snapshot = await database.ref(`users/${window.currentUser.uid}/profilePicture`).once('value');
        const profilePicData = snapshot.val();

        if (profilePicData && profilePicData.data) {
            // Display the profile picture
            document.getElementById('profilePicture').src = profilePicData.data;
            window.currentUser.profilePicture = profilePicData.data;
        } else {
            // Set default profile picture with user's initial
            setDefaultProfilePicture();
        }
    } catch (error) {
        console.error('Error loading profile picture:', error);
        setDefaultProfilePicture();
    }
}

// Set default profile picture
function setDefaultProfilePicture() {
    if (!window.currentUser) return;
    
    const initial = (window.currentUser.displayName || window.currentUser.email || 'U').charAt(0).toUpperCase();
    const defaultSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23007acc'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='white' font-size='40' font-family='Arial'%3E${initial}%3C/text%3E%3C/svg%3E`;
    
    document.getElementById('profilePicture').src = defaultSvg;
}

// Setup event listeners
function setupProfilePictureListeners() {
    const uploadBtn = document.getElementById('uploadProfilePicBtn');
    const fileInput = document.getElementById('profilePictureInput');
    const pictureContainer = document.getElementById('profilePictureContainer');

    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });
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
                await uploadProfilePicture(file);
                // Clear input so same file can be selected again
                fileInput.value = '';
            }
        });
    }
}

// Initialize profile picture functionality
document.addEventListener('DOMContentLoaded', () => {
    setupProfilePictureListeners();
});

// Export functions for use in other files
window.loadProfilePicture = loadProfilePicture;
window.uploadProfilePicture = uploadProfilePicture;
```

## Step 4: Update index.html to include the new script

Add this line before the closing `</body>` tag in index.html (after the other script tags):

```html
<script src="profile-picture.js"></script>
```

## Step 5: Update the Firebase auth state handler

In your index.html file, find the `updateUIForLoggedInUser()` function (around line 549) and add this line at the end:

```javascript
// Load profile picture
setTimeout(() => loadProfilePicture(), 500);
```

## Step 6: Update the user data structure

In the `checkUserUsername()` function in index.html (around line 517), update the user object creation to include profile picture:

```javascript
window.currentUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email.split('@')[0],
    username: username,
    photoURL: user.photoURL || null,
    profilePicture: null // Will be loaded separately
};
```

## Testing

1. Login to your application
2. Click on the profile dropdown
3. Click on "Upload Profile Picture" button or click on the profile picture itself
4. Select an image (max 10MB)
5. The image will be compressed and uploaded
6. Refresh the page - the profile picture should persist

## How it Works

1. **Upload**: User selects an image file
2. **Validation**: Checks if file size is under 10MB
3. **Compression**: Image is resized (max 500x500) and compressed to JPEG with 80% quality
4. **Conversion**: Compressed image is converted to base64 text format
5. **Storage**: Base64 string is stored in Firebase Realtime Database under `users/{uid}/profilePicture`
6. **Loading**: On login, the base64 string is retrieved and set as the image source
7. **Display**: Browser converts base64 back to image and displays it

## Database Structure

```
users/
  {userId}/
    profilePicture/
      data: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
      uploadedAt: 1234567890
```

## Notes

- Images are compressed to reduce storage size
- Base64 encoding increases size by ~33%, but compression compensates for this
- Maximum recommended base64 size in Firebase is ~1MB (original image ~750KB after compression)
- The 10MB limit is for the original file; after compression it will be much smaller
