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

app.use(express.static(path.join(__dirname)));

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
                    io.to(roomId).emit('execution-result', { output, error: null });
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
            const process = runningProcesses.get(socket.id);
            socket.emit('terminal-output', { text: input + '\n', type: 'input' });
            process.stdin.write(input + '\n');
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
            const process = runningProcesses.get(socket.id);
            process.kill();
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
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    const sessionId = crypto.randomBytes(8).toString('hex');
    const pyFile = path.join(tempDir, `${sessionId}.py`);
    
    fs.writeFileSync(pyFile, code);
    
    const pythonProcess = spawn('python', [pyFile]);
    runningProcesses.set(socket.id, pythonProcess);
    
    let output = '';
    let error = '';
    
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
        runningProcesses.delete(socket.id);
        
        try {
            fs.unlinkSync(pyFile);
        } catch (err) {
            console.log('Could not delete temp file:', err.message);
        }
        
        callback({ 
            output: output || 'Process completed', 
            error: error || null 
        });
    });
    
    pythonProcess.on('error', (err) => {
        runningProcesses.delete(socket.id);
        callback({ output: '', error: `Python execution error: ${err.message}` });
    });
}

function executeJava(code, socket, roomId, callback) {
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
        const javaProcess = spawn('java', ['-cp', tempDir, className]);
        runningProcesses.set(socket.id, javaProcess);
        
        let output = '';
        let error = '';
        
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
            runningProcesses.delete(socket.id);
            
            try {
                fs.unlinkSync(javaFile);
                fs.unlinkSync(classFile);
            } catch (err) {
                console.log('Could not delete temp files:', err.message);
            }
            
            callback({ 
                output: output || 'Process completed', 
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
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    const sessionId = crypto.randomBytes(8).toString('hex');
    const cFile = path.join(tempDir, `${sessionId}.c`);
    const exeFile = path.join(tempDir, `${sessionId}.exe`);
    
    fs.writeFileSync(cFile, code);
    
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
            } catch (err) {}
            callback({ output: '', error: `Compilation failed: ${compileError}` });
            return;
        }
        
        const cProcess = spawn(exeFile);
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
                output: output || 'Process completed', 
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
                } catch (err) {}
                
                callback({ 
                    output: output || 'Process completed', 
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
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    const sessionId = crypto.randomBytes(8).toString('hex');
    const cppFile = path.join(tempDir, `${sessionId}.cpp`);
    const exeFile = path.join(tempDir, `${sessionId}.exe`);
    
    fs.writeFileSync(cppFile, code);
    
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
            } catch (err) {}
            callback({ output: '', error: `Compilation failed: ${compileError}` });
            return;
        }
        
        const cppProcess = spawn(exeFile);
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
                output: output || 'Process completed', 
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
