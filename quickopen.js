// Quick Open Functionality (Ctrl+P)

let quickOpenSelectedIndex = 0;
let quickOpenItems = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('quickOpenInput');
    const modal = document.getElementById('quickOpenModal');

    if (input) {
        input.addEventListener('input', (e) => filterQuickOpenList(e.target.value));
        input.addEventListener('keydown', handleQuickOpenKeydown);
    }

    // Close on click outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeQuickOpen();
            }
        });
    }

    // Trigger on Title Bar Click
    const trigger = document.querySelector('.command-palette-trigger');
    if (trigger) {
        trigger.addEventListener('click', openQuickOpen);
    }
});

function openQuickOpen() {
    const modal = document.getElementById('quickOpenModal');
    const input = document.getElementById('quickOpenInput');
    if (!modal || !input) return;

    modal.style.display = 'flex';
    input.value = '';
    input.focus();

    populateQuickOpenList();
}

function closeQuickOpen() {
    const modal = document.getElementById('quickOpenModal');
    if (modal) {
        modal.style.display = 'none';
        if (window.editor) window.editor.focus();
    }
}

function handleQuickOpenKeydown(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        changeSelection(1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        changeSelection(-1);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (quickOpenItems.length > 0 && quickOpenItems[quickOpenSelectedIndex]) {
            selectQuickOpenItem(quickOpenItems[quickOpenSelectedIndex]);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeQuickOpen();
    }
}

function changeSelection(delta) {
    if (quickOpenItems.length === 0) return;

    const list = document.getElementById('quickOpenList');
    // Find currently selected element
    const oldItem = list.querySelector('.quick-open-item.selected');
    if (oldItem) oldItem.classList.remove('selected');

    quickOpenSelectedIndex += delta;
    if (quickOpenSelectedIndex >= quickOpenItems.length) quickOpenSelectedIndex = 0;
    if (quickOpenSelectedIndex < 0) quickOpenSelectedIndex = quickOpenItems.length - 1;

    const itemElements = list.querySelectorAll('.quick-open-item');
    const newItem = itemElements[quickOpenSelectedIndex];
    if (newItem) {
        newItem.classList.add('selected');
        newItem.scrollIntoView({ block: 'nearest' });
    }
}

function getFileIcon(language) {
    const icons = {
        'javascript': { class: 'fab fa-js', color: '#f1e05a' },
        'python': { class: 'fab fa-python', color: '#3572A5' },
        'html': { class: 'fab fa-html5', color: '#e34c26' },
        'css': { class: 'fab fa-css3-alt', color: '#563d7c' },
        'java': { class: 'fab fa-java', color: '#b07219' },
        'c': { class: 'fas fa-code', color: '#555555' },
        'cpp': { class: 'fas fa-code', color: '#f34b7d' },
        'json': { class: 'fas fa-code', color: '#f1e05a' },
        'markdown': { class: 'fab fa-markdown', color: '#083fa1' }
    };
    return icons[language] || { class: 'fas fa-file', color: 'var(--text-secondary)' };
}


function populateQuickOpenList() {
    const allFiles = [];

    // Active Tabs
    if (window.editorTabs) {
        window.editorTabs.forEach((tab, index) => {
            const iconData = getFileIcon(tab.language);
            allFiles.push({
                name: tab.name,
                type: 'tab',
                data: index,
                iconClass: iconData.class,
                iconColor: iconData.color,
                detail: 'Active Tab'
            });
        });
    }

    // Temp Files
    const tempFiles = JSON.parse(localStorage.getItem('temp_files') || '[]');
    tempFiles.forEach(file => {
        const iconData = getFileIcon(file.language);
        allFiles.push({
            name: file.name,
            type: 'temp',
            data: file,
            iconClass: iconData.class,
            iconColor: iconData.color,
            detail: 'Temp File'
        });
    });

    quickOpenItems = allFiles;
    renderQuickOpenItems(allFiles);
}

function renderQuickOpenItems(items) {
    const list = document.getElementById('quickOpenList');
    list.innerHTML = '';

    if (items.length === 0) {
        list.innerHTML = '<div style="padding:10px; color:var(--text-secondary); text-align:center;">No matching files</div>';
        return;
    }

    const header = document.createElement('div');
    header.className = 'quick-open-header';
    header.textContent = 'recently opened';
    list.appendChild(header);

    items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'quick-open-item';
        if (index === 0) div.classList.add('selected');

        div.innerHTML = `
            <div class="quick-open-item-left">
                <i class="${item.iconClass} quick-open-item-icon" style="color: ${item.iconColor}"></i>
                <span>${item.name}</span>
            </div>
            <div class="quick-open-item-detail">${item.detail}</div>
        `;

        div.onclick = () => selectQuickOpenItem(item);
        div.onmouseover = () => {
            const selected = list.querySelector('.quick-open-item.selected');
            if (selected) selected.classList.remove('selected');

            div.classList.add('selected');
            quickOpenSelectedIndex = index;
        };

        list.appendChild(div);
    });

    quickOpenSelectedIndex = 0;
    quickOpenItems = items;
}

function filterQuickOpenList(query) {
    if (!query) {
        populateQuickOpenList();
        return;
    }

    const lowerQuery = query.toLowerCase();

    const allFiles = [];
    if (window.editorTabs) {
        window.editorTabs.forEach((tab, index) => {
            const iconData = getFileIcon(tab.language);
            allFiles.push({ name: tab.name, type: 'tab', data: index, iconClass: iconData.class, iconColor: iconData.color, detail: 'Active Tab' });
        });
    }
    const tempFiles = JSON.parse(localStorage.getItem('temp_files') || '[]');
    tempFiles.forEach(file => {
        const iconData = getFileIcon(file.language);
        allFiles.push({ name: file.name, type: 'temp', data: file, iconClass: iconData.class, iconColor: iconData.color, detail: 'Temp File' });
    });

    const filtered = allFiles.filter(item => item.name.toLowerCase().includes(lowerQuery));
    renderQuickOpenItems(filtered);
}


function selectQuickOpenItem(item) {
    if (item.type === 'tab') {
        if (window.switchToTab) window.switchToTab(item.data);
    } else if (item.type === 'temp') {
        if (window.openTempFile) window.openTempFile(item.data);
    }
    closeQuickOpen();
}

// Global shortcut
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        openQuickOpen();
    }
});
