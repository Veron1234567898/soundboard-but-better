const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Get port from environment variable or use 3001 as default
const PORT = process.env.PORT || 3001;

// Configure CORS for production and development
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://soundboard-frontend.onrender.com', 'http://localhost:3000']
      : '*',
    methods: ['GET', 'POST']
  }
});

// Enable CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://soundboard-frontend.onrender.com', 'http://localhost:3000']
    : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Add headers middleware
app.use((req, res, next) => {
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://soundboard-frontend.onrender.com', 'http://localhost:3000']
    : '*';
    
  res.header('Access-Control-Allow-Origin', allowedOrigins);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Serve uploaded sounds
app.use('/sounds', express.static(path.join(__dirname, '../public/sounds')));

// API endpoints - MUST be defined BEFORE the wildcard route
// Get sound files
app.get('/api/sounds', (req, res) => {
  console.log('GET /api/sounds request received');
  const soundsDir = path.join(__dirname, '../public/sounds');
  console.log('Looking for sounds in:', soundsDir);
  
  // Check if directory exists
  if (!fs.existsSync(soundsDir)) {
    console.error('Sounds directory does not exist! Creating it...');
    try {
      fs.mkdirSync(soundsDir, { recursive: true });
      console.log('Created sounds directory');
    } catch (mkdirErr) {
      console.error('Failed to create sounds directory:', mkdirErr);
      return res.status(500).json({ error: 'Failed to create sounds directory' });
    }
  }
  
  fs.readdir(soundsDir, (err, files) => {
    if (err) {
      console.error('Error reading sounds directory:', err);
      return res.status(500).json({ error: 'Failed to read sounds directory', details: err.message });
    }
    
    console.log('Found files in sounds directory:', files);
    
    // Filter only audio files
    const soundFiles = files.filter(file => 
      /\.(mp3|wav|ogg)$/i.test(file)
    ).map(file => ({
      id: file.replace(/\.[^/.]+$/, ""), // Remove extension
      name: file.replace(/\.[^/.]+$/, "")
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '), // Format name
      file
    }));
    
    console.log('Returning sound files:', soundFiles);
    res.json(soundFiles);
  });
});

// Serve index.html for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// This must be the LAST route defined - handle all other routes for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Room management
const rooms = {};

// Socket.IO logic
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Join a room
  socket.on('join-room', (data) => {
    // Get room ID and username
    const roomId = typeof data === 'object' ? data.roomId : data;
    const userName = data.userName || 'Anonymous';
    
    // Leave previous rooms
    Object.keys(socket.rooms).forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });
    
    // Join new room
    socket.join(roomId);
    
    // Create room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        lastActivity: Date.now()
      };
    }
    
    // Check if user already exists in the room
    const existingUserIndex = rooms[roomId].users.findIndex(u => u.id === socket.id);
    
    if (existingUserIndex !== -1) {
      // Update existing user
      console.log(`User ${socket.id} already in room ${roomId}, updating info`);
      rooms[roomId].users[existingUserIndex] = {
        id: socket.id,
        name: userName,
        lastActivity: Date.now()
      };
    } else {
      // Add new user to room
      rooms[roomId].users.push({
        id: socket.id,
        name: userName,
        lastActivity: Date.now()
      });
    }
    
    // Update room activity
    rooms[roomId].lastActivity = Date.now();
    
    // Emit room info to all users in the room
    io.to(roomId).emit('room-info', {
      roomId,
      users: rooms[roomId].users.length,
      userNames: rooms[roomId].users.map(u => u.name)
    });
    
    console.log(`User ${userName} (${socket.id}) joined room ${roomId}`);
  });
  
  // Play sound
  socket.on('play-sound', (data) => {
    const { roomId, soundId, timestamp } = data;
    
    // Update room activity
    if (rooms[roomId]) {
      rooms[roomId].lastActivity = Date.now();
      
      // Find the user and update their activity
      const user = rooms[roomId].users.find(u => u.id === socket.id);
      if (user) {
        user.lastActivity = Date.now();
        
        // Broadcast to all users in the room except sender
        socket.to(roomId).emit('play-sound', {
          soundId,
          userId: socket.id,
          userName: user.name,
          timestamp
        });
        
        console.log(`User ${user.name} played sound ${soundId} in room ${roomId}`);
      }
    } else {
      console.log(`Room ${roomId} not found when trying to play sound ${soundId}`);
    }
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Remove user from all rooms
    Object.keys(rooms).forEach(roomId => {
      const room = rooms[roomId];
      const userIndex = room.users.findIndex(u => u.id === socket.id);
      
      if (userIndex !== -1) {
        room.users.splice(userIndex, 1);
        
        // Emit updated room info
        io.to(roomId).emit('room-info', {
          roomId,
          users: room.users.length
        });
        
        // Delete room if empty
        if (room.users.length === 0) {
          console.log(`Room ${roomId} is empty, deleting`);
          delete rooms[roomId];
        }
      }
    });
  });
});

// Clean up inactive rooms (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  Object.keys(rooms).forEach(roomId => {
    const room = rooms[roomId];
    // If room is inactive for more than 30 minutes
    if (now - room.lastActivity > 30 * 60 * 1000) {
      console.log(`Room ${roomId} is inactive, deleting`);
      delete rooms[roomId];
    }
  });
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3001;

// Try to start the server with the first available port
const tryPorts = [PORT, PORT + 1, PORT + 2, PORT + 3, PORT + 4];

function tryNextPort(index = 0) {
  if (index >= tryPorts.length) {
    console.error('All ports in range are in use. Please free up a port or specify a different port range.');
    process.exit(1);
    return;
  }
  
  const port = tryPorts[index];
  console.log(`Attempting to start server on port ${port}...`);
  
  const serverInstance = server.listen(port);
  
  serverInstance.on('listening', () => {
    console.log(`✅ Server successfully running on port ${port}`);
    console.log(`Open http://localhost:${port} in your browser`);
  });
  
  serverInstance.on('error', (err) => {
    serverInstance.close();
    
    if (err.code === 'EADDRINUSE') {
      console.log(`❌ Port ${port} is already in use.`);
      tryNextPort(index + 1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

tryNextPort();
