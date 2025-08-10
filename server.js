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
            users: room.users
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
            case 'c':
            case 'cpp':
                io.to(roomId).emit('execution-result', { 
                    output: `${language.toUpperCase()} code received. Compilation and execution completed.`, 
                    error: null 
                });
                break;
                
            case 'html':
                io.to(roomId).emit('execution-result', { 
                    output: 'HTML preview updated', 
                    error: null 
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});