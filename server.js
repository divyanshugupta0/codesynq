const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Local Execution Service download endpoint - MOVED ABOVE STATIC to avoid stale file serving
app.get('/local_execution/CodeSynq-LocalExecution.zip', (req, res) => {
    const archiver = require('archiver');
    const localExecDir = path.join(__dirname, 'local_execution');

    // Check if directory exists
    if (!fs.existsSync(localExecDir)) {
        res.status(404).json({ error: 'Local execution files not found' });
        return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=CodeSynq-LocalExecution.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
        res.status(500).json({ error: err.message });
    });

    archive.pipe(res);

    // Include all required files for local execution setup
    const filesToInclude = [
        'INSTALL.bat',            // Primary installer entry
        'setup.bat',              // Alias for installer
        'Setup.hta',              // Visual installer
        'ExecutionPanel.hta',     // Execution history viewer
        'local-server.js',        // Main service
        'start-service.bat',      // Start script
        'stop-service.bat',       // Stop script
        'package.json',           // NPM config
        'README.md',              // Documentation
        'codesynq.ico'            // App icon
    ];

    filesToInclude.forEach(file => {
        const filePath = path.join(localExecDir, file);
        if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: file });
        }
    });

    archive.finalize();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        connections: io.engine.clientsCount || 0
    });
});

// Socket.io status endpoint
app.get('/socket-status', (req, res) => {
    res.json({
        connected_clients: io.engine.clientsCount || 0,
        rooms: rooms.size,
        users: users.size
    });
});

app.use(express.static(path.join(__dirname)));
app.use(express.json());

const rooms = new Map();
const users = new Map();
const runningProcesses = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (data) => {
        const { roomId, user } = data;

        if (users.has(socket.id)) {
            const prevRoom = users.get(socket.id).roomId;
            socket.leave(prevRoom);
            if (rooms.has(prevRoom)) {
                delete rooms.get(prevRoom).users[socket.id];
                socket.to(prevRoom).emit('user-left', { socketId: socket.id });
            }
        }

        socket.join(roomId);

        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                code: '// Welcome to CodeNexus Pro!\n// Start coding here...\n\nconsole.log("Hello, World!");',
                language: 'javascript',
                users: {},
                host: user.isHost ? socket.id : null,
                mode: 'freestyle',
                createdAt: new Date().toISOString()
            });
        }

        const room = rooms.get(roomId);
        room.users[socket.id] = { ...user, socketId: socket.id };
        users.set(socket.id, { ...user, roomId });

        socket.emit('room-joined', {
            roomId,
            code: room.code,
            language: room.language,
            users: room.users,
            mode: room.mode,
            host: room.host,
            currentEditor: room.currentEditor
        });

        socket.to(roomId).emit('user-joined', {
            user: { ...user, socketId: socket.id },
            socketId: socket.id
        });

        console.log(`User ${user.username} joined room ${roomId}`);
    });

    socket.on('execute-code', (data) => {
        const { roomId, code, language } = data;

        socket.emit('clear-terminal');

        if (runningProcesses.has(socket.id)) {
            const existingProcess = runningProcesses.get(socket.id);
            existingProcess.kill('SIGTERM');
            runningProcesses.delete(socket.id);
        }

        switch (language) {
            case 'python':
                executePython(code, socket, roomId, (result) => {
                    io.to(roomId).emit('execution-result', result);
                });
                break;

            case 'javascript':
                try {
                    const logs = [];
                    const originalLog = console.log;
                    console.log = (...args) => logs.push(args.join(' '));

                    eval(code);
                    console.log = originalLog;

                    const output = logs.length > 0 ? logs.join('\n') : 'Code executed successfully';
                    io.to(roomId).emit('execution-result', { output, exitCode: 0, error: null });
                } catch (jsError) {
                    io.to(roomId).emit('execution-result', { output: '', error: jsError.message });
                }
                break;

            case 'java':
                executeJava(code, socket, roomId, (result) => {
                    io.to(roomId).emit('execution-result', result);
                });
                break;

            case 'c':
                executeC(code, socket, roomId, (result) => {
                    io.to(roomId).emit('execution-result', result);
                });
                break;

            case 'cpp':
                executeCpp(code, socket, roomId, (result) => {
                    io.to(roomId).emit('execution-result', result);
                });
                break;

            case 'html':
                io.to(roomId).emit('execution-result', {
                    output: 'HTML preview updated',
                    error: null,
                    htmlContent: code
                });
                break;

            case 'css':
                io.to(roomId).emit('execution-result', {
                    output: 'CSS code processed',
                    error: null
                });
                break;

            default:
                io.to(roomId).emit('execution-result', {
                    output: `${language} executed on server successfully`,
                    error: null
                });
        }
    });

    socket.on('terminal-input', (data) => {
        const { roomId, input } = data;
        if (runningProcesses.has(socket.id)) {
            const proc = runningProcesses.get(socket.id);
            // Don't echo input back to terminal (local echo handles it)
            // socket.emit('terminal-output', { text: input, type: 'input' }); 
            proc.stdin.write(input);
        }
    });

    socket.on('chat-message', (data) => {
        const { roomId, message } = data;
        const user = users.get(socket.id);

        if (user && rooms.has(roomId)) {
            const messageData = {
                message,
                user: user.username,
                timestamp: new Date().toISOString(),
                socketId: socket.id
            };

            io.to(roomId).emit('new-message', messageData);
        }
    });

    socket.on('code-change', (data) => {
        const { roomId, code, language } = data;
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.code = code;
            room.language = language;
            socket.to(roomId).emit('code-updated', { code, language });
        }
    });

    socket.on('edit-request', (data) => {
        const { roomId, user } = data;
        socket.to(roomId).emit('edit-request', { user });
    });

    socket.on('edit-approved', (data) => {
        const { roomId, userId, userName } = data;
        if (rooms.has(roomId)) {
            rooms.get(roomId).currentEditor = userId;
        }
        io.to(roomId).emit('edit-approved', { userId, userName });
    });

    socket.on('edit-rejected', (data) => {
        const { roomId, userId } = data;
        socket.to(userId).emit('edit-rejected');
    });

    socket.on('edit-mode-change', (data) => {
        const { roomId, mode, currentEditor } = data;
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.mode = mode;
            room.currentEditor = currentEditor;
            io.to(roomId).emit('edit-mode-changed', { mode, currentEditor });
        }
    });

    socket.on('cursor-position', (data) => {
        const { roomId, userId, userName, line, ch } = data;
        socket.to(roomId).emit('cursor-position', { userId, userName, line, ch });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        if (runningProcesses.has(socket.id)) {
            const proc = runningProcesses.get(socket.id);
            proc.kill();
            runningProcesses.delete(socket.id);
        }

        if (users.has(socket.id)) {
            const user = users.get(socket.id);
            const roomId = user.roomId;

            if (rooms.has(roomId)) {
                delete rooms.get(roomId).users[socket.id];
                socket.to(roomId).emit('user-left', { socketId: socket.id });
            }

            users.delete(socket.id);
        }
    });
});

function executePython(code, socket, roomId, callback) {
    socket.emit('clear-terminal');
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const sessionId = crypto.randomBytes(8).toString('hex');
    const pyFile = path.join(tempDir, `${sessionId}.py`);

    fs.writeFileSync(pyFile, code);

    const pythonProcess = spawn('python', ['-u', pyFile], {
        stdio: ['pipe', 'pipe', 'pipe'], // Enable stdin, stdout, stderr pipes
        env: { ...process.env, PYTHONUNBUFFERED: '1' } // Unbuffered output
    });
    runningProcesses.set(socket.id, pythonProcess);

    let output = '';
    let error = '';

    const timeout = setTimeout(() => {
        pythonProcess.kill('SIGTERM');
        runningProcesses.delete(socket.id);
        callback({ output: output, error: 'Process timeout after 30 seconds' });
    }, 30000);

    pythonProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        socket.emit('terminal-output', { text, type: 'stdout' });
    });

    pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        error += text;
        socket.emit('terminal-output', { text, type: 'stderr' });
    });

    pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        runningProcesses.delete(socket.id);

        try {
            fs.unlinkSync(pyFile);
        } catch (err) {
            console.log('Could not delete temp file:', err.message);
        }

        callback({
            output: output || '',
            exitCode: code,
            error: error || null
        });
    });

    pythonProcess.on('error', (err) => {
        runningProcesses.delete(socket.id);
        callback({ output: '', error: `Python execution error: ${err.message}` });
    });
}

function executeJava(code, socket, roomId, callback) {
    socket.emit('clear-terminal');
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const sessionId = crypto.randomBytes(8).toString('hex');
    let className = `Main${sessionId}`;

    // Extract class name from code or wrap in a class
    const classMatch = code.match(/public\s+class\s+(\w+)/);
    if (classMatch) {
        className = classMatch[1];
        // Replace the class name with our unique name to avoid conflicts
        code = code.replace(/public\s+class\s+\w+/, `public class ${className}${sessionId}`);
        className = `${className}${sessionId}`;
    } else {
        // If no public class found, wrap code in a Main class
        code = `public class ${className} {
    public static void main(String[] args) {
${code.split('\n').map(line => '        ' + line).join('\n')}
    }
}`;
    }

    // Auto-inject unbuffering logic for System.out
    if (code.includes('public static void main')) {
        code = code.replace(
            /(public\s+static\s+void\s+main\s*\([^)]*\)\s*\{)/,
            '$1\n        try { System.setOut(new java.io.PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out)) { public void write(byte[] b, int o, int l) { super.write(b, o, l); flush(); } public void write(int b) { super.write(b); flush(); } }); } catch (Exception e) {}'
        );
    }

    // Auto-add prompts before Scanner input calls if missing
    // Simple heuristic to help learners
    const lines = code.split('\n');
    let needsPrompt = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Scanner') && lines[i].includes('new Scanner')) {
            // Found scanner initialization, good
        }

        // Check for common scanner methods
        if (lines[i].match(/\.\s*next(Int|Double|Line|Float|Long|Boolean)?\s*\(/)) {
            // Check if previous non-empty line has System.out.print
            let hasPrint = false;
            for (let j = i - 1; j >= 0; j--) {
                const trimmed = lines[j].trim();
                if (trimmed && !trimmed.startsWith('//')) {
                    hasPrint = trimmed.includes('System.out.print');
                    break;
                }
            }

            if (!hasPrint) {
                const indent = lines[i].match(/^\s*/)[0];
                lines.splice(i, 0, `${indent}System.out.print("Enter input: "); // Auto-added prompt`);
                i++;
            }
        }
    }
    code = lines.join('\n');

    const javaFile = path.join(tempDir, `${className}.java`);

    fs.writeFileSync(javaFile, code);

    const compileProcess = spawn('javac', [javaFile]);

    let compileError = '';

    compileProcess.stderr.on('data', (data) => {
        const text = data.toString();
        compileError += text;
        socket.emit('terminal-output', { text, type: 'stderr' });
    });

    compileProcess.on('close', (code) => {
        if (code !== 0) {
            callback({ output: '', error: `Compilation failed: ${compileError}` });
            return;
        }

        const classFile = javaFile.replace('.java', '.class');
        const javaProcess = spawn('java', ['-cp', tempDir, className], {
            stdio: ['pipe', 'pipe', 'pipe'] // Enable stdin, stdout, stderr pipes
        });
        runningProcesses.set(socket.id, javaProcess);

        let output = '';
        let error = '';

        const timeout = setTimeout(() => {
            javaProcess.kill('SIGTERM');
            runningProcesses.delete(socket.id);
            callback({ output: output, error: 'Process timeout after 30 seconds' });
        }, 30000);

        javaProcess.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            socket.emit('terminal-output', { text, type: 'stdout' });
        });

        javaProcess.stderr.on('data', (data) => {
            const text = data.toString();
            error += text;
            socket.emit('terminal-output', { text, type: 'stderr' });
        });

        javaProcess.on('close', (code) => {
            clearTimeout(timeout);
            runningProcesses.delete(socket.id);

            try {
                fs.unlinkSync(javaFile);
                fs.unlinkSync(classFile);
            } catch (err) {
                console.log('Could not delete temp files:', err.message);
            }

            callback({
                output: output || '',
                exitCode: code,
                error: error || null
            });
        });

        javaProcess.on('error', (err) => {
            runningProcesses.delete(socket.id);
            callback({ output: '', error: `Java execution error: ${err.message}` });
        });
    });

    compileProcess.on('error', (err) => {
        if (err.code === 'ENOENT') {
            callback({ output: '', error: 'Java compiler not found. Please install JDK.' });
        } else {
            callback({ output: '', error: 'Compilation failed. Please check your code.' });
        }
    });
}

function executeC(code, socket, roomId, callback) {
    socket.emit('clear-terminal');
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const sessionId = crypto.randomBytes(8).toString('hex');
    const cFile = path.join(tempDir, `${sessionId}.c`);
    const exeFile = path.join(tempDir, `${sessionId}.exe`);

    // Auto-inject unbuffering for stdout so learners don't need fflush()
    // This makes printf() appear immediately before scanf()
    let modifiedCode = code;
    if (code.includes('int main')) {
        // Inject setvbuf right after main() opening brace
        modifiedCode = code.replace(
            /(int\s+main\s*\([^)]*\)\s*\{)/,
            '$1\n    setvbuf(stdout, NULL, _IONBF, 0); // Auto-added: unbuffer stdout\n'
        );

        // Auto-add prompts before scanf if there's no printf immediately before
        // This helps learners who forget to add input prompts
        const lines = modifiedCode.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('scanf(')) {
                // Check if previous non-empty line has printf
                let hasPrintf = false;
                for (let j = i - 1; j >= 0; j--) {
                    const trimmed = lines[j].trim();
                    if (trimmed && !trimmed.startsWith('//')) {
                        hasPrintf = trimmed.includes('printf(');
                        break;
                    }
                }

                if (!hasPrintf) {
                    // Add a generic prompt before scanf
                    const indent = lines[i].match(/^\s*/)[0];
                    lines.splice(i, 0, `${indent}printf("Enter input: "); // Auto-added prompt`);
                    i++; // Skip the line we just added
                }
            }
        }
        modifiedCode = lines.join('\n');
    }

    fs.writeFileSync(cFile, modifiedCode);

    const compileProcess = spawn('gcc', [cFile, '-o', exeFile]);

    let compileError = '';

    compileProcess.stderr.on('data', (data) => {
        const text = data.toString();
        compileError += text;
        socket.emit('terminal-output', { text, type: 'stderr' });
    });

    compileProcess.on('close', (code) => {
        if (code !== 0) {
            try {
                fs.unlinkSync(cFile);
            } catch (err) { }
            callback({ output: '', error: `Compilation failed: ${compileError}` });
            return;
        }

        const cProcess = spawn(exeFile, [], {
            stdio: ['pipe', 'pipe', 'pipe'] // Enable stdin, stdout, stderr pipes
        });
        runningProcesses.set(socket.id, cProcess);

        let output = '';
        let error = '';

        const timeout = setTimeout(() => {
            cProcess.kill('SIGTERM');
            runningProcesses.delete(socket.id);
            callback({ output: output, error: 'Process timeout after 30 seconds' });
        }, 30000);

        cProcess.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            socket.emit('terminal-output', { text, type: 'stdout' });
        });

        cProcess.stderr.on('data', (data) => {
            const text = data.toString();
            error += text;
            socket.emit('terminal-output', { text, type: 'stderr' });
        });

        cProcess.on('close', (code) => {
            clearTimeout(timeout);
            runningProcesses.delete(socket.id);

            try {
                fs.unlinkSync(cFile);
                fs.unlinkSync(exeFile);
            } catch (err) {
                console.log('Could not delete temp files:', err.message);
            }

            callback({
                output: output || '',
                exitCode: code,
                error: error || null
            });
        });

        cProcess.on('error', (err) => {
            clearTimeout(timeout);
            runningProcesses.delete(socket.id);
            callback({ output: '', error: `C execution error: ${err.message}` });
        });
    });

    compileProcess.on('error', (err) => {
        if (err.code === 'ENOENT') {
            // Try TCC as fallback
            const tccProcess = spawn('tcc', ['-run', cFile]);
            runningProcesses.set(socket.id, tccProcess);

            let output = '';
            let error = '';

            const timeout = setTimeout(() => {
                tccProcess.kill('SIGTERM');
                runningProcesses.delete(socket.id);
                callback({ output: output, error: 'Process timeout after 30 seconds' });
            }, 30000);

            tccProcess.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                socket.emit('terminal-output', { text, type: 'stdout' });
            });

            tccProcess.stderr.on('data', (data) => {
                const text = data.toString();
                error += text;
                socket.emit('terminal-output', { text, type: 'stderr' });
            });

            tccProcess.on('close', (code) => {
                clearTimeout(timeout);
                runningProcesses.delete(socket.id);

                try {
                    fs.unlinkSync(cFile);
                } catch (err) { }

                callback({
                    output: output || '',
                    exitCode: code,
                    error: error || null
                });
            });

            tccProcess.on('error', (err) => {
                clearTimeout(timeout);
                runningProcesses.delete(socket.id);
                callback({ output: '', error: 'C compiler not found. Install MinGW: https://sourceforge.net/projects/mingw-w64/files/ or TCC: https://bellard.org/tcc/' });
            });
        } else {
            callback({ output: '', error: `Compilation error: ${err.message}` });
        }
    });
}

function executeCpp(code, socket, roomId, callback) {
    socket.emit('clear-terminal');
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const sessionId = crypto.randomBytes(8).toString('hex');
    const cppFile = path.join(tempDir, `${sessionId}.cpp`);
    const exeFile = path.join(tempDir, `${sessionId}.exe`);

    // Auto-inject unbuffering for stdout so learners don't need cout.flush()
    let modifiedCode = code;
    if (code.includes('int main')) {
        // Inject unbuffering right after main() opening brace
        modifiedCode = code.replace(
            /(int\s+main\s*\([^)]*\)\s*\{)/,
            '$1\n    std::cout.setf(std::ios::unitbuf); // Auto-added: unbuffer cout\n    setvbuf(stdout, NULL, _IONBF, 0); // Auto-added: unbuffer C-style output\n'
        );

        // Auto-add prompts before cin if there's no cout immediately before
        const lines = modifiedCode.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('cin >>') || lines[i].includes('std::cin >>')) {
                // Check if previous non-empty line has cout
                let hasCout = false;
                for (let j = i - 1; j >= 0; j--) {
                    const trimmed = lines[j].trim();
                    if (trimmed && !trimmed.startsWith('//')) {
                        hasCout = trimmed.includes('cout <<') || trimmed.includes('std::cout <<') || trimmed.includes('printf(');
                        break;
                    }
                }

                if (!hasCout) {
                    const indent = lines[i].match(/^\s*/)[0];
                    // Use flush to ensure it appears
                    lines.splice(i, 0, `${indent}std::cout << "Enter input: " << std::flush; // Auto-added prompt`);
                    i++;
                }
            }
        }
        modifiedCode = lines.join('\n');
    }

    fs.writeFileSync(cppFile, modifiedCode);

    const compileProcess = spawn('g++', [cppFile, '-o', exeFile]);

    let compileError = '';

    compileProcess.stderr.on('data', (data) => {
        const text = data.toString();
        compileError += text;
        socket.emit('terminal-output', { text, type: 'stderr' });
    });

    compileProcess.on('close', (code) => {
        if (code !== 0) {
            try {
                fs.unlinkSync(cppFile);
            } catch (err) {
                callback({ output: '', error: `Compilation failed: ${compileError}` });
                return;
            }
        }

        const cppProcess = spawn(exeFile, [], {
            stdio: ['pipe', 'pipe', 'pipe'] // Enable stdin, stdout, stderr pipes
        });
        runningProcesses.set(socket.id, cppProcess);

        let output = '';
        let error = '';

        const timeout = setTimeout(() => {
            cppProcess.kill('SIGTERM');
            runningProcesses.delete(socket.id);
            callback({ output: output, error: 'Process timeout after 30 seconds' });
        }, 30000);

        cppProcess.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            socket.emit('terminal-output', { text, type: 'stdout' });
        });

        cppProcess.stderr.on('data', (data) => {
            const text = data.toString();
            error += text;
            socket.emit('terminal-output', { text, type: 'stderr' });
        });

        cppProcess.on('close', (code) => {
            clearTimeout(timeout);
            runningProcesses.delete(socket.id);

            try {
                fs.unlinkSync(cppFile);
                fs.unlinkSync(exeFile);
            } catch (err) {
                console.log('Could not delete temp files:', err.message);
            }

            callback({
                output: output || '',
                exitCode: code,
                error: error || null
            });
        });

        cppProcess.on('error', (err) => {
            clearTimeout(timeout);
            runningProcesses.delete(socket.id);
            callback({ output: '', error: `C++ execution error: ${err.message}` });
        });
    });

    compileProcess.on('error', (err) => {
        if (err.code === 'ENOENT') {
            callback({ output: '', error: 'C++ compiler not found. Install MinGW: https://sourceforge.net/projects/mingw-w64/files/ and add to PATH' });
        } else {
            callback({ output: '', error: `Compilation error: ${err.message}` });
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('CORS enabled for all origins');
});
