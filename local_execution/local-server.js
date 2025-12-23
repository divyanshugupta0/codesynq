/**
 * CodeSynq Local Execution Server
 * This service runs on the user's local machine and executes code locally.
 * Instead of sending code to a remote server, the web app connects to this local service.
 */

const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Configuration
const CONFIG = {
    PORT: process.env.LOCAL_EXEC_PORT || 3001,
    HOST: '127.0.0.1', // Only listen on localhost for security
    TEMP_DIR: path.join(os.tmpdir(), 'codesynq_local'),
    HISTORY_FILE: path.join(os.homedir(), '.codesynq', 'execution_history.json'),
    MAX_HISTORY: 100, // Keep last 100 executions
    MAX_EXECUTION_TIME: 30000, // 30 seconds timeout
    ALLOWED_ORIGINS: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://codesynq.onrender.com',
        'file://' // For local HTML files
    ]
};

// Ensure directories exist
if (!fs.existsSync(CONFIG.TEMP_DIR)) {
    fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });
}
const historyDir = path.dirname(CONFIG.HISTORY_FILE);
if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
}

// Running processes map
const runningProcesses = new Map();

// Execution history functions
function loadHistory() {
    try {
        if (fs.existsSync(CONFIG.HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading history:', e.message);
    }
    return [];
}

function saveHistory(history) {
    try {
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
        console.error('Error saving history:', e.message);
    }
}

function addToHistory(entry) {
    const history = loadHistory();
    history.unshift(entry); // Add to beginning
    // Keep only last MAX_HISTORY entries
    if (history.length > CONFIG.MAX_HISTORY) {
        history.length = CONFIG.MAX_HISTORY;
    }
    saveHistory(history);
}

function clearHistory() {
    saveHistory([]);
}

// CORS headers for browser access
function setCorsHeaders(res, origin) {
    // Allow specific origins or all for local development
    const allowedOrigin = CONFIG.ALLOWED_ORIGINS.includes(origin) ? origin : CONFIG.ALLOWED_ORIGINS[0];
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins for local service
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-ID');
    res.setHeader('Access-Control-Max-Age', '86400');
}

// Generate unique file name
function generateFileName(extension) {
    return `code_${crypto.randomBytes(8).toString('hex')}.${extension}`;
}

// Clean up temp files
function cleanupFile(filePath) {
    setTimeout(() => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            // Also clean up compiled files for C/C++/Java
            const dir = path.dirname(filePath);
            const baseName = path.basename(filePath, path.extname(filePath));
            const exePath = path.join(dir, baseName + '.exe');
            const classPath = path.join(dir, baseName + '.class');
            if (fs.existsSync(exePath)) fs.unlinkSync(exePath);
            if (fs.existsSync(classPath)) fs.unlinkSync(classPath);
        } catch (e) {
            console.error('Cleanup error:', e.message);
        }
    }, 5000);
}

// Execute Python code
async function executePython(code, clientId, sendOutput) {
    return new Promise((resolve) => {
        const fileName = generateFileName('py');
        const filePath = path.join(CONFIG.TEMP_DIR, fileName);

        fs.writeFileSync(filePath, code);

        const process = spawn('python', [filePath], {
            cwd: CONFIG.TEMP_DIR,
            timeout: CONFIG.MAX_EXECUTION_TIME
        });

        runningProcesses.set(clientId, process);
        let output = '';
        let errorOutput = '';

        process.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            sendOutput({ type: 'stdout', data: text });
        });

        process.stderr.on('data', (data) => {
            const text = data.toString();
            errorOutput += text;
            sendOutput({ type: 'stderr', data: text });
        });

        process.on('close', (code) => {
            runningProcesses.delete(clientId);
            cleanupFile(filePath);
            resolve({
                success: code === 0,
                output: output,
                error: errorOutput,
                exitCode: code
            });
        });

        process.on('error', (err) => {
            runningProcesses.delete(clientId);
            cleanupFile(filePath);
            resolve({
                success: false,
                output: '',
                error: `Execution error: ${err.message}. Make sure Python is installed.`,
                exitCode: -1
            });
        });
    });
}

// Execute JavaScript code
async function executeJavaScript(code, clientId, sendOutput) {
    return new Promise((resolve) => {
        const fileName = generateFileName('js');
        const filePath = path.join(CONFIG.TEMP_DIR, fileName);

        fs.writeFileSync(filePath, code);

        const process = spawn('node', [filePath], {
            cwd: CONFIG.TEMP_DIR,
            timeout: CONFIG.MAX_EXECUTION_TIME
        });

        runningProcesses.set(clientId, process);
        let output = '';
        let errorOutput = '';

        process.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            sendOutput({ type: 'stdout', data: text });
        });

        process.stderr.on('data', (data) => {
            const text = data.toString();
            errorOutput += text;
            sendOutput({ type: 'stderr', data: text });
        });

        process.on('close', (code) => {
            runningProcesses.delete(clientId);
            cleanupFile(filePath);
            resolve({
                success: code === 0,
                output: output,
                error: errorOutput,
                exitCode: code
            });
        });

        process.on('error', (err) => {
            runningProcesses.delete(clientId);
            cleanupFile(filePath);
            resolve({
                success: false,
                output: '',
                error: `Execution error: ${err.message}`,
                exitCode: -1
            });
        });
    });
}

// Execute Java code
async function executeJava(code, clientId, sendOutput) {
    return new Promise((resolve) => {
        // Extract class name from code
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'Main';
        const fileName = `${className}.java`;
        const filePath = path.join(CONFIG.TEMP_DIR, fileName);

        fs.writeFileSync(filePath, code);

        sendOutput({ type: 'info', data: 'Compiling Java code...\n' });

        // Compile
        const compile = spawn('javac', [fileName], {
            cwd: CONFIG.TEMP_DIR,
            timeout: CONFIG.MAX_EXECUTION_TIME
        });

        let compileError = '';

        compile.stderr.on('data', (data) => {
            compileError += data.toString();
        });

        compile.on('close', (compileCode) => {
            if (compileCode !== 0) {
                cleanupFile(filePath);
                resolve({
                    success: false,
                    output: '',
                    error: `Compilation error:\n${compileError}`,
                    exitCode: compileCode
                });
                return;
            }

            sendOutput({ type: 'info', data: 'Running Java program...\n' });

            // Run
            const run = spawn('java', [className], {
                cwd: CONFIG.TEMP_DIR,
                timeout: CONFIG.MAX_EXECUTION_TIME
            });

            runningProcesses.set(clientId, run);
            let output = '';
            let errorOutput = '';

            run.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                sendOutput({ type: 'stdout', data: text });
            });

            run.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                sendOutput({ type: 'stderr', data: text });
            });

            run.on('close', (code) => {
                runningProcesses.delete(clientId);
                cleanupFile(filePath);
                resolve({
                    success: code === 0,
                    output: output,
                    error: errorOutput,
                    exitCode: code
                });
            });

            run.on('error', (err) => {
                runningProcesses.delete(clientId);
                cleanupFile(filePath);
                resolve({
                    success: false,
                    output: '',
                    error: `Execution error: ${err.message}. Make sure Java is installed.`,
                    exitCode: -1
                });
            });
        });

        compile.on('error', (err) => {
            cleanupFile(filePath);
            resolve({
                success: false,
                output: '',
                error: `Compilation error: ${err.message}. Make sure Java JDK is installed.`,
                exitCode: -1
            });
        });
    });
}

// Execute C code
async function executeC(code, clientId, sendOutput) {
    return new Promise((resolve) => {
        const fileName = generateFileName('c');
        const filePath = path.join(CONFIG.TEMP_DIR, fileName);
        const exePath = path.join(CONFIG.TEMP_DIR, fileName.replace('.c', '.exe'));

        fs.writeFileSync(filePath, code);

        sendOutput({ type: 'info', data: 'Compiling C code...\n' });

        // Compile with gcc
        const compile = spawn('gcc', [filePath, '-o', exePath], {
            cwd: CONFIG.TEMP_DIR,
            timeout: CONFIG.MAX_EXECUTION_TIME
        });

        let compileError = '';

        compile.stderr.on('data', (data) => {
            compileError += data.toString();
        });

        compile.on('close', (compileCode) => {
            if (compileCode !== 0) {
                cleanupFile(filePath);
                resolve({
                    success: false,
                    output: '',
                    error: `Compilation error:\n${compileError}`,
                    exitCode: compileCode
                });
                return;
            }

            sendOutput({ type: 'info', data: 'Running C program...\n' });

            // Run
            const run = spawn(exePath, [], {
                cwd: CONFIG.TEMP_DIR,
                timeout: CONFIG.MAX_EXECUTION_TIME
            });

            runningProcesses.set(clientId, run);
            let output = '';
            let errorOutput = '';

            run.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                sendOutput({ type: 'stdout', data: text });
            });

            run.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                sendOutput({ type: 'stderr', data: text });
            });

            run.on('close', (code) => {
                runningProcesses.delete(clientId);
                cleanupFile(filePath);
                resolve({
                    success: code === 0,
                    output: output,
                    error: errorOutput,
                    exitCode: code
                });
            });

            run.on('error', (err) => {
                runningProcesses.delete(clientId);
                cleanupFile(filePath);
                resolve({
                    success: false,
                    output: '',
                    error: `Execution error: ${err.message}. Make sure GCC is installed.`,
                    exitCode: -1
                });
            });
        });

        compile.on('error', (err) => {
            cleanupFile(filePath);
            resolve({
                success: false,
                output: '',
                error: `Compilation error: ${err.message}. Make sure GCC is installed.`,
                exitCode: -1
            });
        });
    });
}

// Execute C++ code
async function executeCpp(code, clientId, sendOutput) {
    return new Promise((resolve) => {
        const fileName = generateFileName('cpp');
        const filePath = path.join(CONFIG.TEMP_DIR, fileName);
        const exePath = path.join(CONFIG.TEMP_DIR, fileName.replace('.cpp', '.exe'));

        fs.writeFileSync(filePath, code);

        sendOutput({ type: 'info', data: 'Compiling C++ code...\n' });

        // Compile with g++
        const compile = spawn('g++', [filePath, '-o', exePath], {
            cwd: CONFIG.TEMP_DIR,
            timeout: CONFIG.MAX_EXECUTION_TIME
        });

        let compileError = '';

        compile.stderr.on('data', (data) => {
            compileError += data.toString();
        });

        compile.on('close', (compileCode) => {
            if (compileCode !== 0) {
                cleanupFile(filePath);
                resolve({
                    success: false,
                    output: '',
                    error: `Compilation error:\n${compileError}`,
                    exitCode: compileCode
                });
                return;
            }

            sendOutput({ type: 'info', data: 'Running C++ program...\n' });

            // Run
            const run = spawn(exePath, [], {
                cwd: CONFIG.TEMP_DIR,
                timeout: CONFIG.MAX_EXECUTION_TIME
            });

            runningProcesses.set(clientId, run);
            let output = '';
            let errorOutput = '';

            run.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                sendOutput({ type: 'stdout', data: text });
            });

            run.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                sendOutput({ type: 'stderr', data: text });
            });

            run.on('close', (code) => {
                runningProcesses.delete(clientId);
                cleanupFile(filePath);
                resolve({
                    success: code === 0,
                    output: output,
                    error: errorOutput,
                    exitCode: code
                });
            });

            run.on('error', (err) => {
                runningProcesses.delete(clientId);
                cleanupFile(filePath);
                resolve({
                    success: false,
                    output: '',
                    error: `Execution error: ${err.message}. Make sure G++ is installed.`,
                    exitCode: -1
                });
            });
        });

        compile.on('error', (err) => {
            cleanupFile(filePath);
            resolve({
                success: false,
                output: '',
                error: `Compilation error: ${err.message}. Make sure G++ is installed.`,
                exitCode: -1
            });
        });
    });
}

// Stop running process
function stopProcess(clientId) {
    if (runningProcesses.has(clientId)) {
        const process = runningProcesses.get(clientId);
        process.kill('SIGTERM');
        runningProcesses.delete(clientId);
        return true;
    }
    return false;
}

// Send input to running process
function sendInput(clientId, input) {
    if (runningProcesses.has(clientId)) {
        const process = runningProcesses.get(clientId);
        process.stdin.write(input);
        return true;
    }
    return false;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    setCorsHeaders(res, origin);

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Health check endpoint
    if (pathname === '/health' || pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'running',
            service: 'CodeSynq Local Execution',
            version: '1.0.0',
            platform: os.platform(),
            hostname: os.hostname(),
            tempDir: CONFIG.TEMP_DIR,
            activeProcesses: runningProcesses.size
        }));
        return;
    }

    // Status endpoint
    if (pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            online: true,
            activeProcesses: runningProcesses.size,
            platform: os.platform(),
            memory: process.memoryUsage()
        }));
        return;
    }

    // History endpoint - GET to retrieve, DELETE to clear
    if (pathname === '/history') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                history: loadHistory(),
                count: loadHistory().length
            }));
            return;
        }
        if (req.method === 'DELETE') {
            clearHistory();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ cleared: true }));
            return;
        }
    }

    // Execute code endpoint
    if (pathname === '/execute' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const { code, language, clientId } = JSON.parse(body);

                if (!code || !language) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing code or language' }));
                    return;
                }

                const id = clientId || crypto.randomBytes(8).toString('hex');
                const outputs = [];
                const startTime = Date.now();

                const sendOutput = (data) => {
                    outputs.push(data);
                };

                let result;

                switch (language.toLowerCase()) {
                    case 'python':
                    case 'py':
                        result = await executePython(code, id, sendOutput);
                        break;
                    case 'javascript':
                    case 'js':
                        result = await executeJavaScript(code, id, sendOutput);
                        break;
                    case 'java':
                        result = await executeJava(code, id, sendOutput);
                        break;
                    case 'c':
                        result = await executeC(code, id, sendOutput);
                        break;
                    case 'cpp':
                    case 'c++':
                        result = await executeCpp(code, id, sendOutput);
                        break;
                    default:
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: `Unsupported language: ${language}`,
                            supportedLanguages: ['python', 'javascript', 'java', 'c', 'cpp']
                        }));
                        return;
                }

                const duration = Date.now() - startTime;

                // Save to history
                addToHistory({
                    id: id,
                    timestamp: new Date().toISOString(),
                    language: language.toLowerCase(),
                    codeSnippet: code.substring(0, 200) + (code.length > 200 ? '...' : ''),
                    codeLength: code.length,
                    success: result.success,
                    exitCode: result.exitCode,
                    output: (result.output || '').substring(0, 500),
                    error: (result.error || '').substring(0, 500),
                    duration: duration
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ...result,
                    clientId: id,
                    streamOutput: outputs,
                    duration: duration
                }));

            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // Stop process endpoint
    if (pathname === '/stop' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const { clientId } = JSON.parse(body);
                const stopped = stopProcess(clientId);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ stopped }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // Send input endpoint
    if (pathname === '/input' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const { clientId, input } = JSON.parse(body);
                const sent = sendInput(clientId, input);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ sent }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
server.listen(CONFIG.PORT, CONFIG.HOST, () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         CodeSynq Local Execution Service                   ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Status:    🟢 Running                                      ║`);
    console.log(`║  Address:   http://${CONFIG.HOST}:${CONFIG.PORT}                        ║`);
    console.log(`║  Platform:  ${os.platform().padEnd(47)}║`);
    console.log(`║  Temp Dir:  ${CONFIG.TEMP_DIR.substring(0, 46).padEnd(47)}║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Endpoints:                                                 ║');
    console.log('║    GET  /health  - Service health check                     ║');
    console.log('║    GET  /status  - Service status                           ║');
    console.log('║    POST /execute - Execute code                             ║');
    console.log('║    POST /stop    - Stop running process                     ║');
    console.log('║    POST /input   - Send input to process                    ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Supported Languages: Python, JavaScript, Java, C, C++     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n[INFO] Press Ctrl+C to stop the service\n');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[INFO] Shutting down local execution service...');

    // Kill all running processes
    runningProcesses.forEach((proc, id) => {
        console.log(`[INFO] Terminating process: ${id}`);
        proc.kill('SIGTERM');
    });

    server.close(() => {
        console.log('[INFO] Service stopped gracefully');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    process.emit('SIGINT');
});
