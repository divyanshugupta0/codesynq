const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'collab-engine' });
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for now
        methods: ["GET", "POST"]
    }
});

// Store session state in memory
const sessions = {};
// Structure:
// sessions[roomId] = {
//    hostId: string,
//    mode: 'freestyle' | 'restricted',
//    tokenHolder: string,
//    files: [],
//    users: { [socketId]: { username: string } }
// }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // --- Join Session ---
    socket.on('join_session', (data) => {
        const { roomId, username, isHost, initialFiles } = data;
        socket.join(roomId);

        let session = sessions[roomId];

        // Create session if Host 
        if (isHost) {
            if (!session) {
                session = {
                    roomId,
                    hostId: socket.id,
                    mode: 'freestyle',
                    tokenHolder: socket.id,
                    files: initialFiles || [],
                    activeTabIndex: 0,
                    users: {}
                };
                sessions[roomId] = session;
                console.log(`Session ${roomId} created by ${username}`);
            } else {
                // Host reconnecting? Update Host ID
                // IMPORTANT: If mode is restricted, ensure Host reclaims token if it was theirs (or just take it to be safe)
                const oldHostId = session.hostId;
                session.hostId = socket.id;

                // If token was held by old host OR we want to ensure host has control on reconnect
                if (session.tokenHolder === oldHostId || session.mode === 'restricted') {
                    session.tokenHolder = session.hostId;
                }
            }
        }

        if (!session) {
            socket.emit('error', 'Session not found');
            return;
        }

        // Add user
        session.users[socket.id] = { username: username || 'Guest', isHost };

        // Send Initial State to Joiner
        socket.emit('workspace_sync', {
            files: session.files,
            activeTabIndex: session.activeTabIndex,
            mode: session.mode,
            tokenHolder: session.tokenHolder,
            users: Object.values(session.users) // Send simplified list
        });

        // Notify others
        socket.to(roomId).emit('user_joined', { userId: socket.id, username });
        console.log(`${username} joined ${roomId}`);
    });

    // --- Code Changes ---
    socket.on('code_change', (data) => {
        const { roomId, tabIndex, changes, content } = data;
        const session = sessions[roomId];

        if (!session) {
            console.log(`[Error] Code change for non-existent session: ${roomId}`);
            return;
        }

        // Verify Permission
        const isAuthorized = session.mode === 'freestyle' || session.tokenHolder === socket.id;

        if (isAuthorized) {
            console.log(`[CodeChange] Accepted from ${socket.id.substr(0, 4)} in ${roomId}. Broadcasting...`);

            // Update Server Memory
            if (!session.files[tabIndex]) {
                session.files[tabIndex] = { content: '' }; // Stub
            }
            session.files[tabIndex].content = content;
            session.activeTabIndex = tabIndex;

            // Broadcast to everyone else
            socket.to(roomId).emit('code_change', data);
        } else {
            console.log(`[CodeChange] Rejected from ${socket.id}. Mode: ${session.mode}`);
            console.log(`Mismatch: Holder (${session.tokenHolder}) vs Sender (${socket.id})`);

            // Reject: Send back the AUTHORITATIVE content for this file to force revert
            const file = session.files[tabIndex];
            socket.emit('sync_error', {
                message: 'Unauthorized edit - Reverting',
                mode: session.mode,
                tokenHolder: session.tokenHolder,
                // Send back correct content if available
                revertContent: file ? file.content : '',
                tabIndex: tabIndex
            });
        }
    });

    // --- WebRTC Signaling (Voice) ---
    socket.on('voice_signal', (data) => {
        // data: { targetId, signal }
        // signal contains SDP or ICE candidate
        io.to(data.targetId).emit('voice_signal', {
            senderId: socket.id,
            signal: data.signal
        });
    });

    // --- Mode Switching ---
    socket.on('set_mode', (data) => {
        const { roomId, mode } = data;
        const session = sessions[roomId];
        // Only Host can switch
        if (session && session.hostId === socket.id) {
            session.mode = mode;
            // Host takes token on switch
            session.tokenHolder = session.hostId;

            io.to(roomId).emit('mode_update', { mode, tokenHolder: session.tokenHolder });
        }
    });

    // --- Token Logic ---
    socket.on('request_edit', (data) => {
        const { roomId } = data;
        const session = sessions[roomId];
        if (!session) return;

        // Forward request string to Token Holder
        if (session.tokenHolder) {
            io.to(session.tokenHolder).emit('edit_request', {
                requesterId: socket.id,
                requesterName: session.users[socket.id]?.username
            });
        }
    });

    socket.on('grant_edit', (data) => {
        const { roomId, targetId } = data;
        const session = sessions[roomId];
        // Only current holder can grant
        if (session && session.tokenHolder === socket.id) {
            session.tokenHolder = targetId;
            io.to(roomId).emit('token_transfer', { tokenHolder: targetId });
        }
    });

    // --- Remote Execution (Main Server) ---
    socket.on('execute-code', (data) => {
        handleRemoteExecution(socket, data);
    });

    // --- File Operations ---
    // (Sync file creation/deletion later if needed)

    // --- Disconnect ---
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find session user was in
        for (const [roomId, session] of Object.entries(sessions)) {
            if (session.users[socket.id]) {
                delete session.users[socket.id];
                io.to(roomId).emit('user_left', { userId: socket.id });

                // If Host left?
                if (session.hostId === socket.id) {
                    // Option: End session OR assign new host. 
                    // For now, simple: Session technically stays alive but leaderless.
                    // Or destroy?
                    // io.to(roomId).emit('host_left');
                    // delete sessions[roomId];
                }
                break;
            }
        }
    });
});

// --- Execution Helpers ---
const MAX_EXECUTION_TIME = 300000; // 5 Minutes

async function handleRemoteExecution(socket, data) {
    const { code, language, executionId } = data;
    if (!code) return;

    const lang = (language || '').toLowerCase();

    // Notify start
    socket.emit('clear-terminal');

    try {
        let result;
        if (lang === 'python') result = await runPython(code, socket);
        else if (lang === 'c' || lang === 'cpp' || lang === 'c++') result = await runCpp(code, socket, lang);
        else if (lang === 'java') result = await runJava(code, socket);
        else if (lang === 'javascript' || lang === 'node') result = await runNode(code, socket);
        else throw new Error(`Language '${lang}' not supported on this server`);

        socket.emit('execution-result', {
            executionId,
            language: lang,
            success: result.success,
            output: result.output,
            error: result.error,
            exitCode: result.exitCode
        });
    } catch (e) {
        socket.emit('execution-result', {
            executionId,
            language: lang,
            success: false,
            error: e.message
        });
    }
}

function runPython(code, socket) {
    return new Promise((resolve) => {
        const fileName = `exec_${Date.now()}_${Math.random().toString(36).substr(2)}.py`;
        const filePath = path.join(os.tmpdir(), fileName);

        fs.writeFileSync(filePath, code);

        // Use -u for unbuffered output
        // Try 'python3' first, catch error? Or just 'python' if windows.
        // On many cloud envs (Linux), python3 is safer.
        const cmd = process.platform === 'win32' ? 'python' : 'python3';

        const proc = spawn(cmd, ['-u', filePath]);
        setupProcess(proc, socket, filePath, resolve);
    });
}

function runNode(code, socket) {
    return new Promise((resolve) => {
        const fileName = `exec_${Date.now()}_${Math.random().toString(36).substr(2)}.js`;
        const filePath = path.join(os.tmpdir(), fileName);

        fs.writeFileSync(filePath, code);

        const proc = spawn('node', [filePath]);
        setupProcess(proc, socket, filePath, resolve);
    });
}

function runCpp(code, socket, lang) {
    return new Promise((resolve) => {
        const ext = lang === 'c' ? 'c' : 'cpp';
        const compiler = lang === 'c' ? 'gcc' : 'g++';
        const fileName = `exec_${Date.now()}_${Math.random().toString(36).substr(2)}`;
        const srcPath = path.join(os.tmpdir(), `${fileName}.${ext}`);
        // Windows uses .exe, Linux has no extension usually
        const outPath = path.join(os.tmpdir(), `${fileName}${process.platform === 'win32' ? '.exe' : ''}`);

        fs.writeFileSync(srcPath, code);

        // Compile
        socket.emit('terminal-output', { type: 'stdout', text: `Compiling ${ext}...\n` });
        const compile = spawn(compiler, [srcPath, '-o', outPath]);

        let compileErr = '';
        compile.stderr.on('data', d => {
            const t = d.toString();
            compileErr += t;
            socket.emit('terminal-output', { type: 'stderr', text: t });
        });

        compile.on('close', (code) => {
            if (code !== 0) {
                fs.unlink(srcPath, () => { });
                return resolve({ success: false, error: 'Compilation failed', output: compileErr });
            }
            // Run
            socket.emit('terminal-output', { type: 'stdout', text: `Running...\n` });
            const proc = spawn(outPath, []);
            setupProcess(proc, socket, [srcPath, outPath], resolve);
        });

        compile.on('error', (err) => {
            fs.unlink(srcPath, () => { });
            resolve({ success: false, error: 'Compiler not found: ' + err.message });
        });
    });
}

function runJava(code, socket) {
    return new Promise((resolve) => {
        // Extract class name
        const match = code.match(/public\s+class\s+(\w+)/);
        const className = match ? match[1] : 'Main';
        const dir = path.join(os.tmpdir(), `java_${Date.now()}_${Math.random().toString(36).substr(2)}`);

        if (!fs.existsSync(dir)) fs.mkdirSync(dir);

        const srcPath = path.join(dir, `${className}.java`);
        fs.writeFileSync(srcPath, code);

        socket.emit('terminal-output', { type: 'stdout', text: `Compiling Java...\n` });
        const compile = spawn('javac', [srcPath]);

        let compileErr = '';
        compile.stderr.on('data', d => {
            const t = d.toString();
            compileErr += t;
            socket.emit('terminal-output', { type: 'stderr', text: t });
        });

        compile.on('close', (code) => {
            if (code !== 0) {
                fs.rm(dir, { recursive: true, force: true }, () => { });
                return resolve({ success: false, error: 'Compilation failed', output: compileErr });
            }
            socket.emit('terminal-output', { type: 'stdout', text: `Running...\n` });
            const proc = spawn('java', ['-cp', dir, className]);
            setupProcess(proc, socket, dir, resolve, true);
        });

        compile.on('error', (err) => {
            fs.rm(dir, { recursive: true, force: true }, () => { });
            resolve({ success: false, error: 'JDK not found: ' + err.message });
        });
    });
}

function setupProcess(proc, socket, cleanupTarget, resolve, isDirCleanup = false) {
    let output = '';
    let error = '';

    const timeout = setTimeout(() => {
        proc.kill();
        const msg = `\n[Server] Execution timed out after ${MAX_EXECUTION_TIME / 1000}s.\n`;
        socket.emit('terminal-output', { type: 'stderr', text: msg });
        error += msg;
    }, MAX_EXECUTION_TIME);

    proc.stdout.on('data', (d) => {
        const text = d.toString();
        output += text;
        socket.emit('terminal-output', { type: 'stdout', text });
    });

    proc.stderr.on('data', (d) => {
        const text = d.toString();
        error += text;
        socket.emit('terminal-output', { type: 'stderr', text });
    });

    proc.on('close', (code) => {
        clearTimeout(timeout);
        // Cleanup
        if (isDirCleanup) {
            fs.rm(cleanupTarget, { recursive: true, force: true }, () => { });
        } else if (Array.isArray(cleanupTarget)) {
            cleanupTarget.forEach(f => fs.unlink(f, () => { }));
        } else {
            fs.unlink(cleanupTarget, () => { });
        }

        resolve({ success: code === 0, output, error, exitCode: code });
    });

    proc.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
    });
}

const PORT = 3002;
server.listen(PORT, () => {
    console.log(`Collab Engine running on port ${PORT}`);
});
