// Shared code functions for handling received folders and codes

function loadSharedCodeToEditor() {
    if (!currentSharedCode) return;
    
    const sharedData = currentSharedCode.data;
    
    if (sharedData && sharedData.files) {
        // Load as folder in tab mode
        if (!isTabMode) {
            toggleTabMode();
        }
        
        editorTabs = [];
        activeTabIndex = 0;
        
        sharedData.files.forEach((file) => {
            addTab(file.name, file.content, file.language);
        });
        
        if (editorTabs.length > 0) {
            activeTabIndex = 0;
            switchToTab(0);
        }
        
        renderTabs();
        showNotification(`Loaded shared folder with ${sharedData.files.length} files!`);
    } else {
        // Load single code file
        if (editor && monaco) {
            const languageSelect = document.getElementById('languageSelect');
            languageSelect.value = currentSharedCode.language || sharedData.language;
            
            const language = getMonacoLanguage(currentSharedCode.language || sharedData.language);
            monaco.editor.setModelLanguage(editor.getModel(), language);
            editor.setValue(currentSharedCode.code || sharedData.code);
            updateLivePreviewVisibility(currentSharedCode.language || sharedData.language);
        }
        
        showNotification(`Loaded shared code!`);
    }
    
    document.getElementById('sharedCodePreviewModal').style.display = 'none';
    currentSharedCode = null;
}

function saveSharedCodeToLibrary() {
    if (!currentSharedCode || !window.currentUser) return;
    
    const sharedData = currentSharedCode.data;
    
    if (sharedData && sharedData.files) {
        // Save as folder
        const folderData = {
            name: (sharedData.folderName || 'Shared Folder') + ' (Shared)',
            files: sharedData.files,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            lastModified: new Date().toISOString()
        };
        
        database.ref(`users/${window.currentUser.uid}/savedFolders`).push(folderData).then(() => {
            showNotification(`Saved shared folder to your library!`);
            document.getElementById('sharedCodePreviewModal').style.display = 'none';
        }).catch((error) => {
            showNotification('Error saving folder: ' + error.message);
        });
    } else {
        // Save as individual code
        const codeData = {
            name: `Shared from ${currentSharedCode.sender || sharedData.from}`,
            content: currentSharedCode.code || sharedData.code,
            language: currentSharedCode.language || sharedData.language,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            lastModified: new Date().toISOString()
        };
        
        database.ref(`users/${window.currentUser.uid}/savedCodes`).push(codeData).then(() => {
            showNotification(`Saved shared code to your library!`);
            document.getElementById('sharedCodePreviewModal').style.display = 'none';
        }).catch((error) => {
            showNotification('Error saving code: ' + error.message);
        });
    }
    
    currentSharedCode = null;
}