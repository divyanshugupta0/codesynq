const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// --- Configuration ---
const CONFIG = {
    PORT: process.env.LOCAL_EXEC_PORT || 3001,
    HOST: '127.0.0.1',
    TEMP_DIR: path.join(os.tmpdir(), 'codesynq_local_v2'),
    MAX_EXECUTION_TIME: 30000, // 30 seconds
};

// Ensure temp directory exists
if (!fs.existsSync(CONFIG.TEMP_DIR)) {
    fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });
}

// Global state
const runningProcesses = new Map();

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
        runningProcesses.delete(clientId);
        cleanupFile(filePath);
        resolve({ success: exitCode === 0, output: fullOutput, error: fullError, exitCode });
    });

    proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
    });
}

// --- Server Implementation ---

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-ID');

    if (req.method === 'OPTIONS') return res.end();

    const url = new URL(req.url, `http://${req.headers.host}`);

    // --- Execute Route ---
    if (url.pathname === '/execute' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
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
                    // Add a simple node executor or basic info
                    result = { success: false, error: 'Web-based Node.js execution is handled by the browser or remote server. Local execution is refined for Python, Java, C, and C++.' };
                }
                else result = { success: false, error: `Unsupported language: ${language}` };

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
        return;
    }

    res.writeHead(404);
    res.end();
});

server.listen(CONFIG.PORT, CONFIG.HOST, () => {
    console.log(`\n🚀 CodeSynq Local Service running at http://${CONFIG.HOST}:${CONFIG.PORT}\n`);
});
