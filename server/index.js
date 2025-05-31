const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const cors = require('cors');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Get port from environment variable or use 10000 as default (matching render.yaml)
const PORT = process.env.PORT || 10000;

// Configure allowed origins
const allowedOrigins = [
  'https://soundboard-but-better-exq7.vercel.app',
  'https://soundboard-but-better-*.vercel.app',  // All Vercel preview deployments
  'http://localhost:3000',
  'http://localhost:3001',
  'https://049be9b9-7c75-410e-b625-83add43ee7d1-00-jxxxnpmd2yi.sisko.replit.dev',
  'https://*.replit.dev',  // All Replit deployments
  'https://soundboard-but-better-exq7-a4mhfvzid-guys-projects-dd3ce6cf.vercel.app'  // Your specific Vercel URL
];

// Configure Socket.IO CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Check if origin is explicitly allowed
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Check against wildcard patterns
      const isAllowed = allowedOrigins.some(allowedOrigin => {
        if (allowedOrigin.includes('*')) {
          const regex = new RegExp(allowedOrigin.replace(/\*/g, '.*'));
          return regex.test(origin);
        }
        return false;
      });
      
      if (isAllowed) {
        return callback(null, true);
      }
      
      console.log('Socket.IO blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Enable CORS for Express
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is explicitly allowed
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check against wildcard patterns
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        const regex = new RegExp(allowedOrigin.replace(/\*/g, '.*'));
        return regex.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      return callback(null, true);
    }
    
    console.log('Blocked by CORS:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

// Add headers middleware
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (allowedOrigins.includes(requestOrigin) || allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', requestOrigin || '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Serve uploaded sounds
app.use('/sounds', express.static(path.join(__dirname, '../public/sounds')));

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

// Handle 404 for API routes
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.status(404).json({ error: 'Not found' });
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

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend server running on port ${PORT}`);
  console.log(`WebSocket server: ws://localhost:${PORT}`);
  console.log(`API base URL: http://localhost:${PORT}`);
  console.log('Ready to accept connections from your frontend!');
});
