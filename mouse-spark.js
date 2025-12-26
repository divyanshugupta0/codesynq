let sparksEnabled = false;
let lastSparkTime = 0;

function createSpark(x, y) {
    if (!sparksEnabled) return;

    const spark = document.createElement('div');
    spark.classList.add('mouse-spark');

    // Vary size slightly
    const size = Math.random() * 4 + 2; // 2px to 6px
    spark.style.width = `${size}px`;
    spark.style.height = `${size}px`;

    // Position centered on cursor with slight jitter
    const offsetX = (Math.random() - 0.5) * 10;
    const offsetY = (Math.random() - 0.5) * 10;

    spark.style.left = (x + offsetX) + 'px';
    spark.style.top = (y + offsetY) + 'px';

    // Use theme accent color or fall back to Gold/White for "star" look
    // We can pick a random bright color or mix with the theme
    const colors = [
        'var(--accent-color)',
        '#ffffff',
        '#FFD700', // Gold
        '#87CEFA'  // Light Sky Blue
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    spark.style.background = randomColor;
    spark.style.boxShadow = `0 0 ${size * 2}px ${randomColor}`;

    document.body.appendChild(spark);

    // Auto remove matches CSS animation time
    setTimeout(() => {
        spark.remove();
    }, 800);
}

function handleMouseMove(e) {
    if (!sparksEnabled) return;

    const now = Date.now();
    // Limit creation rate (every 30ms approx 30fps)
    if (now - lastSparkTime > 30) {
        createSpark(e.clientX, e.clientY);
        lastSparkTime = now;
    }
}

window.toggleMouseSparks = function (enable) {
    sparksEnabled = enable;
    if (enable) {
        document.addEventListener('mousemove', handleMouseMove);
    } else {
        document.removeEventListener('mousemove', handleMouseMove);
        // Clean up existing
        document.querySelectorAll('.mouse-spark').forEach(el => el.remove());
    }
};

// Initialize if setting is already saved
document.addEventListener('DOMContentLoaded', () => {
    // Check setting locally if available early, otherwise nexuscode.js handles it
    const stored = localStorage.getItem('mouseSparks');
    if (stored === 'true') {
        window.toggleMouseSparks(true);
    }
});
