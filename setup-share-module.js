/**
 * Quick Setup Script for Code Share Module
 * Run this to automatically integrate the share module into your project
 * 
 * Usage: node setup-share-module.js
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Code Share Module...\n');

// Check if files exist
const filesToCheck = [
    'modules/share-routes.js',
    'modules/share-styles.css',
    'share-code.js',
    'server.js',
    'index.html'
];

let allFilesExist = true;
filesToCheck.forEach(file => {
    if (!fs.existsSync(file)) {
        console.log(`❌ Missing: ${file}`);
        allFilesExist = false;
    } else {
        console.log(`✅ Found: ${file}`);
    }
});

if (!allFilesExist) {
    console.log('\n⚠️  Some required files are missing. Please ensure all module files are present.');
    process.exit(1);
}

console.log('\n📝 Integration Instructions:\n');

console.log('1️⃣  Add to server.js (after express initialization):');
console.log('   ----------------------------------------');
console.log('   const shareRoutes = require(\'./modules/share-routes\');');
console.log('   shareRoutes.setupRoutes(app);');
console.log('   ----------------------------------------\n');

console.log('2️⃣  Add to index.html <head> section:');
console.log('   ----------------------------------------');
console.log('   <link rel="stylesheet" href="modules/share-styles.css">');
console.log('   ----------------------------------------\n');

console.log('3️⃣  Add to index.html before </body>:');
console.log('   ----------------------------------------');
console.log('   <script src="share-code.js"></script>');
console.log('   ----------------------------------------\n');

// Try to auto-detect and suggest exact line numbers
try {
    const serverContent = fs.readFileSync('server.js', 'utf8');
    const lines = serverContent.split('\n');

    // Find where to add the route
    let suggestedLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('app.use(express.static') ||
            lines[i].includes('app.use(express.json')) {
            suggestedLine = i + 1;
            break;
        }
    }

    if (suggestedLine > 0) {
        console.log(`💡 Suggestion: Add share routes after line ${suggestedLine} in server.js\n`);
    }
} catch (err) {
    // Ignore errors
}

console.log('📚 For detailed documentation, see: SHARE_MODULE.md\n');

console.log('🎯 Quick Test:');
console.log('   1. Restart your server: npm start');
console.log('   2. Open your app in browser');
console.log('   3. Look for "Share Code" button in toolbar');
console.log('   4. Test API: curl http://localhost:3000/api/share-stats\n');

console.log('✨ Setup instructions displayed! Follow the steps above to complete integration.\n');
