async function customConfirm(message) {
    return new Promise((resolve) => {
        const existing = document.getElementById('conalert-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'conalert-container';
        container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;z-index:10000;animation:fadeIn 0.3s';

        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-primary,#1e1e1e);border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);animation:slideIn 0.3s;border:1px solid var(--border-color,#333)';

        const icon = document.createElement('div');
        icon.innerHTML = '&#10067;';
        icon.style.cssText = 'font-size:48px;color:#FF9800;text-align:center;margin-bottom:20px';

        const msg = document.createElement('div');
        msg.textContent = message;
        msg.style.cssText = 'color:var(--text-primary,#fff);font-size:16px;text-align:center;margin-bottom:25px;line-height:1.5';

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;gap:10px';

        const yesBtn = document.createElement('button');
        yesBtn.textContent = 'Yes';
        yesBtn.style.cssText = 'flex:1;padding:12px;background:#4CAF50;color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.3s';
        yesBtn.onmouseover = () => yesBtn.style.transform = 'scale(1.05)';
        yesBtn.onmouseout = () => yesBtn.style.transform = 'scale(1)';
        yesBtn.onclick = () => { container.remove(); resolve(true); };

        const noBtn = document.createElement('button');
        noBtn.textContent = 'No';
        noBtn.style.cssText = 'flex:1;padding:12px;background:#F44336;color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.3s';
        noBtn.onmouseover = () => noBtn.style.transform = 'scale(1.05)';
        noBtn.onmouseout = () => noBtn.style.transform = 'scale(1)';
        noBtn.onclick = () => { container.remove(); resolve(false); };

        btnContainer.appendChild(yesBtn);
        btnContainer.appendChild(noBtn);
        box.appendChild(icon);
        box.appendChild(msg);
        box.appendChild(btnContainer);
        container.appendChild(box);
        document.body.appendChild(container);

        if (!document.getElementById('conalert-styles')) {
            const style = document.createElement('style');
            style.id = 'conalert-styles';
            style.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideIn{from{transform:translateY(-50px);opacity:0}to{transform:translateY(0);opacity:1}}';
            document.head.appendChild(style);
        }
    });
}


function alert(message) {
    const existing = document.getElementById('conalert-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'conalert-container';
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;z-index:10000;animation:fadeIn 0.3s';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-primary,#1e1e1e);border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);animation:slideIn 0.3s;border:1px solid var(--border-color,#333)';

    const icon = document.createElement('div');
    icon.innerHTML = '&#9432;';
    icon.style.cssText = 'font-size:48px;color:#2196F3;text-align:center;margin-bottom:20px';

    const msg = document.createElement('div');
    msg.textContent = message;
    msg.style.cssText = 'color:var(--text-primary,#fff);font-size:16px;text-align:center;margin-bottom:25px;line-height:1.5';

    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.cssText = 'width:100%;padding:12px;background:#2196F3;color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.3s';
    okBtn.onmouseover = () => okBtn.style.transform = 'scale(1.05)';
    okBtn.onmouseout = () => okBtn.style.transform = 'scale(1)';
    okBtn.onclick = () => container.remove();

    box.appendChild(icon);
    box.appendChild(msg);
    box.appendChild(okBtn);
    container.appendChild(box);
    document.body.appendChild(container);

    if (!document.getElementById('conalert-styles')) {
        const style = document.createElement('style');
        style.id = 'conalert-styles';
        style.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideIn{from{transform:translateY(-50px);opacity:0}to{transform:translateY(0);opacity:1}}';
        document.head.appendChild(style);
    }
}

// Make globally accessible
window.customConfirm = customConfirm;
window.customAlert = alert;

// Helper to wrap functions that use confirm
window.confirmAction = async (message, onConfirm, onCancel) => {
    const result = await customConfirm(message);
    if (result && onConfirm) {
        onConfirm();
    } else if (!result && onCancel) {
        onCancel();
    }
    return result;
};