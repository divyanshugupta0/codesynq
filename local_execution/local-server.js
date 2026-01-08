const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

// --- Configuration ---
const CONFIG = {
    PORT: process.env.LOCAL_EXEC_PORT || 3001,
    HOST: '127.0.0.1',
    TEMP_DIR: path.join(os.tmpdir(), 'codesynq_local_v2'),
    MAX_EXECUTION_TIME: 300000, // 5 minutes
};

// Ensure temp directory exists
if (!fs.existsSync(CONFIG.TEMP_DIR)) {
    fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });
}

// Global state
const runningProcesses = new Map();
const executionHistory = []; // Stores execution records for the panel
const MAX_HISTORY = 100; // Maximum history entries to keep

// --- Utilities ---
function generateClientId() {
    return `client_${crypto.randomBytes(4).toString('hex')}_${Date.now()}`;
}

function cleanupFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            // Also try to cleanup .exe for C/C++
            const exePath = filePath.replace(/\.(c|cpp)$/, '.exe');
            if (fs.existsSync(exePath)) fs.unlinkSync(exePath);
        }
    } catch (err) {
        console.error(`[Error] Cleanup failed for ${filePath}:`, err.message);
    }
}

// --- Language Executors ---

/**
 * Python: Use -u for unbuffered output
 */
function executePython(code, clientId, sendOutput) {
    return new Promise((resolve) => {
        const filePath = path.join(CONFIG.TEMP_DIR, `${clientId}.py`);

        // Auto-inject prompts
        const lines = code.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('input(') && !lines[i].includes('print(')) {
                const match = lines[i].match(/input\s*\(\s*['"]?([^'"]*)['"]?\s*\)/);
                if (!match || !match[1]) {
                    const indent = lines[i].match(/^\s*/)[0];
                    lines.splice(i, 0, `${indent}print("Enter input: ", end="", flush=True)`);
                    i++;
                }
            }
        }

        fs.writeFileSync(filePath, lines.join('\n'));
        const proc = spawn('python', ['-u', filePath], { stdio: ['pipe', 'pipe', 'pipe'] });

        setupProcessHandlers(proc, clientId, filePath, resolve, sendOutput);
    });
}

/**
 * Java: Aggressive unbuffering via PrintStream proxy
 */
function executeJava(code, clientId, sendOutput) {
    return new Promise((resolve) => {
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'Main';
        const filePath = path.join(CONFIG.TEMP_DIR, `${className}.java`);

        // Inject unbuffering at start of main
        if (code.includes('public static void main')) {
            const unbufferCode = '\n        try { System.setOut(new java.io.PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out)) { ' +
                'public void write(byte[] b, int o, int l) { super.write(b, o, l); flush(); } ' +
                'public void write(int b) { super.write(b); flush(); } }); } catch (Exception e) {}';
            code = code.replace(/(public\s+static\s+void\s+main\s*\([^)]*\)\s*\{)/, `$1 ${unbufferCode}`);
        }

        fs.writeFileSync(filePath, code);
        sendOutput({ type: 'info', data: 'Compiling Java...\n' });

        const compile = spawn('javac', [filePath]);
        let compileErr = '';
        compile.stderr.on('data', d => { compileErr += d; sendOutput({ type: 'stderr', data: d.toString() }); });

        compile.on('close', (code) => {
            if (code !== 0) return resolve({ success: false, error: 'Compilation failed' });

            sendOutput({ type: 'info', data: 'Running...\n' });
            const proc = spawn('java', ['-cp', CONFIG.TEMP_DIR, className], { stdio: ['pipe', 'pipe', 'pipe'] });
            setupProcessHandlers(proc, clientId, filePath, resolve, sendOutput);
        });
    });
}

/**
 * C/C++ Implementation
 */
function executeCpp(code, clientId, sendOutput, isC = false) {
    return new Promise((resolve) => {
        const ext = isC ? 'c' : 'cpp';
        const compiler = isC ? 'gcc' : 'g++';
        const filePath = path.join(CONFIG.TEMP_DIR, `${clientId}.${ext}`);
        const exePath = filePath.replace(`.${ext}`, '.exe');

        // Inject unbuffering
        if (code.includes('main')) {
            const unbuffer = isC ?
                '\n    setvbuf(stdout, NULL, _IONBF, 0);\n' :
                '\n    std::cout.setf(std::ios::unitbuf);\n    setvbuf(stdout, NULL, _IONBF, 0);\n';
            code = code.replace(/(int\s+main\s*\([^)]*\)\s*\{)/, `$1 ${unbuffer}`);
        }

        fs.writeFileSync(filePath, code);
        sendOutput({ type: 'info', data: `Compiling ${isC ? 'C' : 'C++'}...\n` });

        const compile = spawn(compiler, [filePath, '-o', exePath]);
        let compileErr = '';
        compile.stderr.on('data', d => { compileErr += d; sendOutput({ type: 'stderr', data: d.toString() }); });

        compile.on('close', (code) => {
            if (code !== 0) return resolve({ success: false, error: 'Compilation failed' });

            sendOutput({ type: 'info', data: 'Running...\n' });
            const proc = spawn(exePath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
            setupProcessHandlers(proc, clientId, filePath, resolve, sendOutput);
        });
    });
}

function setupProcessHandlers(proc, clientId, filePath, resolve, sendOutput) {
    runningProcesses.set(clientId, proc);
    let fullOutput = '';
    let fullError = '';

    // Timeout Enforcement
    const timeoutTimer = setTimeout(() => {
        if (runningProcesses.has(clientId)) {
            const p = runningProcesses.get(clientId);
            p.kill();
            sendOutput({ type: 'stderr', data: `\n[Server] Execution timed out after ${CONFIG.MAX_EXECUTION_TIME}ms.\n` });
        }
    }, CONFIG.MAX_EXECUTION_TIME);

    // Keep-Alive Pings (every 15s) to prevent proxy timeouts
    const pingInterval = setInterval(() => {
        if (runningProcesses.has(clientId)) {
            sendOutput({ type: 'ping', data: Date.now() });
        }
    }, 15000);

    proc.stdout.on('data', (d) => {
        const text = d.toString();
        fullOutput += text;
        sendOutput({ type: 'stdout', data: text });
    });

    proc.stderr.on('data', (d) => {
        const text = d.toString();
        fullError += text;
        sendOutput({ type: 'stderr', data: text });
    });

    proc.on('close', (exitCode) => {
        clearTimeout(timeoutTimer);
        clearInterval(pingInterval);
        runningProcesses.delete(clientId);
        cleanupFile(filePath);
        resolve({ success: exitCode === 0, output: fullOutput, error: fullError, exitCode });
    });

    proc.on('error', (err) => {
        clearTimeout(timeoutTimer);
        clearInterval(pingInterval);
        resolve({ success: false, error: err.message });
    });
}

// --- Server Implementation ---

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-ID');

    if (req.method === 'OPTIONS') return res.end();

    const url = new URL(req.url, `http://${req.headers.host}`);

    // --- Execute Route ---
    if (url.pathname === '/execute' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            const startTime = Date.now();
            try {
                const { code, language } = JSON.parse(body);
                const clientId = generateClientId();

                // Setup NDJSON Streaming
                res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Transfer-Encoding': 'chunked' });

                const sendChunk = (data) => res.write(JSON.stringify(data) + '\n');
                const sendStreamOutput = (out) => sendChunk({ type: 'output', data: out });

                // Start signal
                sendChunk({ type: 'start', clientId });
                sendStreamOutput({ type: 'control', action: 'clear-terminal' });

                let result;
                const lang = language ? language.toLowerCase() : '';

                if (lang === 'python') result = await executePython(code, clientId, sendStreamOutput);
                else if (lang === 'java') result = await executeJava(code, clientId, sendStreamOutput);
                else if (lang === 'c') result = await executeCpp(code, clientId, sendStreamOutput, true);
                else if (lang === 'cpp' || lang === 'c++') result = await executeCpp(code, clientId, sendStreamOutput, false);
                else if (lang === 'javascript' || lang === 'node') {
                    result = { success: false, error: 'Web-based Node.js execution is handled by the browser or remote server. Local execution is refined for Python, Java, C, and C++.' };
                }
                else result = { success: false, error: `Unsupported language: ${language}` };

                const duration = Date.now() - startTime;

                // Save to history
                executionHistory.unshift({
                    id: clientId,
                    language: lang,
                    codeSnippet: code.substring(0, 500),
                    codeLength: code.length,
                    success: result.success,
                    output: result.output ? result.output.substring(0, 1000) : '',
                    error: result.error ? result.error.substring(0, 1000) : '',
                    exitCode: result.exitCode || (result.success ? 0 : 1),
                    duration: duration,
                    timestamp: new Date().toISOString()
                });

                // Trim history if too long
                if (executionHistory.length > MAX_HISTORY) {
                    executionHistory.length = MAX_HISTORY;
                }

                sendChunk({ type: 'result', ...result });
                res.end();
            } catch (err) {
                console.error('[Fatal Error] Request handling failed:', err);
                if (!res.writableEnded) {
                    if (res.headersSent) {
                        // If stream already started, send error as chunk
                        res.write(JSON.stringify({ type: 'result', success: false, error: err.message }) + '\n');
                        res.end();
                    } else {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    }
                }
            }
        });
        return;
    }

    // --- Input Route ---
    if (url.pathname === '/input' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            const { clientId, input } = JSON.parse(body);
            const proc = runningProcesses.get(clientId);
            if (proc && proc.stdin.writable) {
                proc.stdin.write(input);
                res.end(JSON.stringify({ success: true }));
            } else {
                res.end(JSON.stringify({ success: false, error: 'Process not found or stdin closed' }));
            }
        });
        return;
    }

    // --- Health/Status ---
    if (url.pathname === '/health' || url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'up', active: runningProcesses.size }));
        return;
    }

    // --- Status (for ExecutionPanel) ---
    if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'running',
            active: runningProcesses.size,
            historyCount: executionHistory.length,
            uptime: process.uptime()
        }));
        return;
    }

    // --- History Routes (for ExecutionPanel) ---
    if (url.pathname === '/history' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ history: executionHistory }));
        return;
    }

    if (url.pathname === '/history' && req.method === 'DELETE') {
        executionHistory.length = 0; // Clear array
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'History cleared' }));
        return;
    }

    // --- Show Setup Route ---
    if (url.pathname === '/setup' && req.method === 'GET') {
        try {
            const setupPath = path.join(__dirname, 'Setup.hta');
            if (fs.existsSync(setupPath)) {
                spawn('cmd', ['/c', 'start', '', setupPath], { detached: true, stdio: 'ignore' });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Setup opened locally' }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Setup.hta not found' }));
            }
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
    }

    // --- Update Handler ---
    if (url.pathname === '/update' && req.method === 'POST') {
        const updateScriptPath = path.join(CONFIG.TEMP_DIR, 'update_codesynq.bat');
        const repoUrl = 'https://github.com/divyanshugupta0/codesynq/archive/refs/heads/main.zip'; // Placeholder - Update with real repo if needed
        // For now, simulate update or fetch specific files? 
        // A real auto-update usually downloads a zip, extracts it, and overwrites changes
        // Since this is a local service file, we can just effectively restart or pull latest logic if we had a remote source.

        // Simulating robust update:
        // 1. Download latest local-server.js
        // 2. Restart service

        try {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Update started. Service will restart shortly...' }));

            console.log('[Update] Auto-update triggered.');

            // Create a self-deleting batch file to handle the update and restart
            // This prevents file locking issues
            const updateBatContent = `
@echo off
timeout /t 2 /nobreak >nul
echo [Updater] Stopping service...
taskkill /F /IM node.exe >nul 2>&1
echo [Updater] Downloading latest version...
REM powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/divyanshugupta0/codesynq/main/local_execution/local-server.js' -OutFile '${path.join(__dirname, 'local-server.js')}'"
echo [Updater] (Dev Mode: Skipped download to preserve local changes)
echo [Updater] Restarting service...
start "" "${path.join(__dirname, 'start-service.bat')}"
del "%~f0"
            `;

            fs.writeFileSync(updateScriptPath, updateBatContent);

            // Launch the updater detached and exit
            spawn('cmd', ['/c', updateScriptPath], {
                detached: true,
                stdio: 'ignore',
                cwd: __dirname
            }).unref();

            setTimeout(() => process.exit(0), 100);

        } catch (err) {
            console.error('[Update Failed]', err);
        }
        return;
    }

    res.writeHead(404);
    res.end();
});

server.listen(CONFIG.PORT, CONFIG.HOST, () => {
    console.log(`\n🚀 CodeSynq Local Service running at http://${CONFIG.HOST}:${CONFIG.PORT}\n`);
});
