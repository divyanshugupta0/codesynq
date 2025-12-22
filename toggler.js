document.addEventListener("DOMContentLoaded", () => {

    /* ---------------- Drawer Elements ---------------- */
    const openBtn = document.getElementById("drawerOpenBtn");
    const closeBtn = document.getElementById("drawerCloseBtn");
    const drawer = document.getElementById("drawerPanel");
    const resize = document.getElementById("drawerResize");
    const overlay = document.getElementById("drawerOverlay");

    /* ---------------- AI Elements ---------------- */
    const iframe = document.getElementById("drawerIframe");
    const selector = document.getElementById("modelSelector");

    /* ---------------- AI Model URLs ---------------- */
    const MODEL_URLS = {
        blackbox: "https://app.blackbox.ai/",
        google: "https://www.google.com/?igu=1" // embeddable google
    };

    /* =======================================================
            🔘  DRAWER TOGGLE (OPEN / CLOSE)
       ======================================================= */

    openBtn.onclick = () => {
        drawer.classList.add("active");
        openBtn.style.display = "none";
        loadSavedModel(); // load preference when opened
    };

    closeBtn.onclick = () => {
        drawer.classList.remove("active");
        openBtn.style.display = "block";
    };

    /* =======================================================
            📏  RESIZE DRAWER BY DRAGGING
       ======================================================= */

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    function startResize(e) {
        isResizing = true;
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startWidth = drawer.offsetWidth;
        document.body.style.userSelect = "none";

        // Show overlay during drag
        overlay.style.display = "block";
    }

    function doResize(e) {
        if (!isResizing) return;

        const mouseX = e.touches ? e.touches[0].clientX : e.clientX;
        let newWidth = startWidth - (mouseX - startX);

        const screenWidth = window.innerWidth;
        const MIN = 180;             // min drawer width
        const MAX = screenWidth * 0.9; // max drawer width

        if (newWidth < MIN) newWidth = MIN;
        if (newWidth > MAX) newWidth = MAX;

        drawer.style.width = `${newWidth}px`;
    }

    function stopResize() {
        isResizing = false;
        document.body.style.userSelect = "auto";

        // remove overlay when stop
        overlay.style.display = "none";
    }

    // Mouse Support
    resize.addEventListener("mousedown", startResize);
    window.addEventListener("mousemove", doResize);
    window.addEventListener("mouseup", stopResize);

    // Touch Support
    resize.addEventListener("touchstart", startResize);
    window.addEventListener("touchmove", doResize);
    window.addEventListener("touchend", stopResize);

    /* =======================================================
            🧠  AI MODEL SELECTION + FIREBASE SAVE/LOAD
       ======================================================= */

    // Load saved model preference
    function loadSavedModel() {
        // if no login => load google default
        if (!window.currentUser) {
            iframe.src = MODEL_URLS.google;
            return;
        }

        firebase.database().ref(`aiPreference/${currentUser.uid}`)
            .once("value", snap => {
                const stored = snap.val();
                if (stored && MODEL_URLS[stored]) {
                    selector.value = stored;
                    iframe.src = MODEL_URLS[stored];
                } else {
                    selector.value = "google"; // default selected UI
                    iframe.src = MODEL_URLS.google;
                }
            });
    }

    // Save preference to Firebase
    function saveModelPreference(model) {
        if (!window.currentUser) return; // only save if logged in
        firebase.database().ref(`aiPreference/${currentUser.uid}`).set(model);
    }

    // When user changes selection
    selector.addEventListener("change", () => {
        const model = selector.value;
        iframe.src = MODEL_URLS[model];
        saveModelPreference(model);
    });

    // Load model on first page load
    loadSavedModel();

}); // END DOMContentLoaded
