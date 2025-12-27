const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

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

const PORT = 3002;
server.listen(PORT, () => {
    console.log(`Collab Engine running on port ${PORT}`);
});
