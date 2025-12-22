# 🔗 Code Share Module

A standalone module for sharing code snippets via shareable links in CodeNexus/CodeSynq.

## 📋 Features

- ✅ Generate shareable links for code snippets
- ✅ Set expiry times (1 hour, 24 hours, 7 days, 30 days, or never)
- ✅ Read-only or editable sharing options
- ✅ View count tracking
- ✅ Copy, fork, and download shared code
- ✅ Share via Email, WhatsApp
- ✅ Beautiful UI with animations
- ✅ Automatic cleanup of expired shares

## 📁 Module Files

```
modules/
├── share-routes.js      # Backend API routes
├── share-styles.css     # CSS styling
share-code.js            # Frontend JavaScript
share-server.js          # Standalone server (optional)
```

## 🚀 Setup Instructions

### Option 1: Integrate into Existing Server (Recommended for Render)

Since Render's free tier supports only one web service, integrate the module into your existing `server.js`:

#### Step 1: Add to `server.js`

Add these lines to your `server.js` file **after** the express app initialization:

```javascript
// Add this near the top with other requires
const shareRoutes = require('./modules/share-routes');

// Add this after app.use(express.static(...))
shareRoutes.setupRoutes(app);
```

**Example:**
```javascript
const express = require('express');
const app = express();

app.use(express.static(path.join(__dirname)));
app.use(express.json()); // Make sure this is present

// Setup share routes
const shareRoutes = require('./modules/share-routes');
shareRoutes.setupRoutes(app);

// ... rest of your server code
```

#### Step 2: Add CSS to `index.html`

Add the stylesheet link in your `index.html` file inside the `<head>` section:

```html
<link rel="stylesheet" href="modules/share-styles.css">
```

#### Step 3: Add JavaScript to `index.html`

Add the script tag before the closing `</body>` tag:

```html
<script src="share-code.js"></script>
</body>
```

#### Step 4: Restart Server

```bash
npm start
```

### Option 2: Run as Standalone Server (For Local Development)

If you want to run the share module on a separate port locally:

```bash
node share-server.js
```

This will start the share API on port 3001. Update the frontend to use:
```javascript
const API_URL = 'http://localhost:3001/api';
```

## 📡 API Endpoints

### POST `/api/share`
Create a new shareable code link

**Request Body:**
```json
{
  "code": "console.log('Hello World');",
  "language": "javascript",
  "includeComments": true,
  "readOnly": true,
  "expiryHours": 24,
  "author": "John Doe",
  "authorId": "user123",
  "title": "My Code Snippet"
}
```

**Response:**
```json
{
  "success": true,
  "shareId": "a1b2c3d4e5f6g7h8",
  "expiresAt": 1701234567890
}
```

### GET `/api/share/:shareId`
Retrieve shared code by ID

**Response:**
```json
{
  "success": true,
  "data": {
    "code": "console.log('Hello World');",
    "language": "javascript",
    "readOnly": true,
    "author": "John Doe",
    "title": "My Code Snippet",
    "createdAt": 1701234567890,
    "views": 5,
    "expiresAt": 1701234567890
  }
}
```

### POST `/api/share/:shareId/view`
Increment view count

**Response:**
```json
{
  "success": true,
  "views": 6
}
```

### GET `/api/share-stats`
Get statistics about shared codes

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalShares": 10,
    "activeShares": 8,
    "expiredShares": 2,
    "totalViews": 45,
    "averageViews": "4.50"
  }
}
```

### DELETE `/api/share/:shareId`
Delete a shared code (requires author verification)

**Request Body:**
```json
{
  "authorId": "user123"
}
```

## 🎨 Usage

### Sharing Code

1. Write or paste code in the editor
2. Click the **"Share Code"** button in the toolbar
3. Configure sharing options:
   - Include comments
   - Read-only mode
   - Set expiry time
4. Click **"Generate Link"**
5. Copy and share the generated link

### Viewing Shared Code

1. Open a shared link (e.g., `https://yourapp.com?share=a1b2c3d4`)
2. The shared code modal will automatically open
3. Options available:
   - **Copy Code**: Copy to clipboard
   - **Fork to Editor**: Load into your editor
   - **Download**: Save as a file

## 🔧 Customization

### Change Expiry Options

Edit `share-code.js` line 69-74:

```javascript
<select id="shareExpiryTime" disabled>
    <option value="1">1 hour</option>
    <option value="24">24 hours</option>
    <option value="168">7 days</option>
    <option value="720">30 days</option>
    <option value="0">Never</option>
</select>
```

### Change Styling

Edit `modules/share-styles.css` to customize colors, animations, etc.

### Add Database Persistence

Currently, shared codes are stored in memory (Map). For production, integrate with Firebase or MongoDB:

**Example with Firebase:**

```javascript
// In share-routes.js
const admin = require('firebase-admin');
const db = admin.firestore();

// Replace Map operations with Firestore
app.post('/api/share', async (req, res) => {
    const shareId = crypto.randomBytes(8).toString('hex');
    await db.collection('sharedCode').doc(shareId).set(shareData);
    // ...
});
```

## 🐛 Troubleshooting

### Share button not appearing
- Check if `share-code.js` is loaded
- Verify the toolbar element exists with class `.toolbar`
- Check browser console for errors

### API endpoints returning 404
- Ensure `share-routes.js` is properly imported in `server.js`
- Verify `express.json()` middleware is added
- Check server logs for route initialization message

### Shared links not working
- Verify the share ID is correct
- Check if the share has expired
- Ensure the server is running

### Styles not applying
- Confirm `share-styles.css` is linked in `index.html`
- Check browser DevTools for CSS loading errors
- Clear browser cache

## 📊 Storage Considerations

### Memory Storage (Current Implementation)
- ✅ Fast and simple
- ✅ No database setup required
- ❌ Data lost on server restart
- ❌ Not suitable for production with multiple instances

### Recommended for Production
- **Firebase Firestore**: Real-time, scalable, free tier available
- **MongoDB Atlas**: Document database, free tier available
- **PostgreSQL**: Relational database, good for complex queries

## 🔒 Security Notes

1. **Input Validation**: The module validates required fields but doesn't sanitize code content
2. **Author Verification**: DELETE endpoint checks authorId but can be bypassed
3. **Rate Limiting**: Consider adding rate limiting to prevent abuse
4. **CORS**: Currently allows all origins - restrict in production

## 📈 Future Enhancements

- [ ] Syntax highlighting in share preview
- [ ] Password-protected shares
- [ ] Share analytics dashboard
- [ ] QR code generation for shares
- [ ] Embed code widget
- [ ] Version history for shared code
- [ ] Comments on shared code
- [ ] Collections/folders for organizing shares

## 🤝 Contributing

To add new features:

1. Update `share-routes.js` for backend logic
2. Update `share-code.js` for frontend functionality
3. Update `share-styles.css` for styling
4. Update this documentation

## 📝 License

Part of CodeNexus/CodeSynq project.

---

**Need Help?** Check the browser console for detailed error messages or review the server logs.
