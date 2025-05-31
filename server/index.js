const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const cors = require('cors');

// Set up sounds directory
const soundsDir = path.join(__dirname, '../public/sounds');

// Create public/sounds directory if it doesn't exist
if (!fs.existsSync(soundsDir)) {
  try {
    fs.mkdirSync(soundsDir, { recursive: true });
    console.log('Created sounds directory at:', soundsDir);
  } catch (err) {
    console.error('Failed to create sounds directory:', err);
    process.exit(1);
  }
}

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Get port from environment variable or use 10000 as default (matching render.yaml)
const PORT = process.env.PORT || 10000;

// Configure allowed origins
const allowedOrigins = [
  'https://soundboard-but-better-zq96.vercel.app',
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

// Serve uploaded sounds with proper encoding handling
app.use('/sounds', (req, res, next) => {
  try {
    // Decode the URL-encoded filename and get the base name
    const decodedPath = decodeURIComponent(req.path);
    const filename = path.basename(decodedPath);
    const filePath = path.join(soundsDir, filename);
    
    console.log('Requested sound file:', { 
      originalPath: req.path, 
      decodedPath, 
      filename,
      filePath,
      exists: fs.existsSync(filePath)
    });
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return res.status(404).json({ 
        error: 'File not found',
        path: filePath
      });
    }
    
    // Set headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    const contentType = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg'
    }[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('Error streaming file:', filePath, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading file' });
      }
    });
    
  } catch (err) {
    console.error('Error in sound file handler:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Log available sound files
app.get('/api/available-sounds', (req, res) => {
  fs.readdir(soundsDir, (err, files) => {
    if (err) {
      console.error('Error reading sounds directory:', err);
      return res.status(500).json({ error: 'Failed to read sounds directory' });
    }
    res.json({ files });
  });
});

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API endpoints - MUST be defined BEFORE the wildcard route
// Get sound files
app.get('/api/sounds', (req, res) => {
  console.log('GET /api/sounds request received');
  console.log('Looking for sounds in:', soundsDir);
  
  // Verify directory exists
  if (!fs.existsSync(soundsDir)) {
    const error = `Sounds directory does not exist: ${soundsDir}`;
    console.error(error);
    return res.status(500).json({ error: 'Sounds directory not found', path: soundsDir });
  }
  
  fs.readdir(soundsDir, (err, files) => {
    if (err) {
      console.error('Error reading sounds directory:', err);
      return res.status(500).json({ 
        error: 'Failed to read sounds directory', 
        details: err.message,
        path: soundsDir
      });
    }
    
    console.log('Found files in sounds directory:', files);
    
    // Filter only audio files and create proper response
    const soundFiles = files
      .filter(file => {
        const isAudio = /\.(mp3|wav|ogg)$/i.test(file);
        if (!isAudio) {
          console.log('Skipping non-audio file:', file);
          return false;
        }
        
        const filePath = path.join(soundsDir, file);
        const exists = fs.existsSync(filePath);
        if (!exists) {
          console.error('File does not exist but was listed:', filePath);
          return false;
        }
        
        return true;
      })
      .map(file => {
        const id = file.replace(/\.[^/.]+$/, "");
        const name = id
          .split(/[-_]+/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        const encodedFile = encodeURIComponent(file);
        
        return {
          id,
          name,
          file: encodedFile,
          url: `/sounds/${encodedFile}`
        };
      });
    
    console.log(`Returning ${soundFiles.length} sound files`);
    console.log('Sound files:', soundFiles.map(f => f.file));
    
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

// Clean up inactive rooms periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 24 * 60 * 60 * 1000; // 24 hours
  
  Object.keys(rooms).forEach(roomId => {
    if (now - rooms[roomId].lastActivity > timeout) {
      console.log(`Room ${roomId} inactive, cleaning up`);
      delete rooms[roomId];
    }
  });
}, 60 * 60 * 1000); // Check hourly

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
    // Create a new room
  socket.on('create-room', (data) => {
    if (!data || !data.roomId) {
      console.error('Invalid create-room data:', data);
      socket.emit('room-error', { message: 'Invalid room data' });
      return;
    }
    
    const { roomId, userName = 'Host' } = data;
    
    // Check if room already exists
    if (rooms[roomId]) {
      console.log(`Room ${roomId} already exists`);
      socket.emit('room-error', { 
        message: 'Room already exists. Please try a different room code.' 
      });
      return;
    }
    
    // Create new room
    rooms[roomId] = {
      users: [],
      lastActivity: Date.now(),
      createdAt: Date.now()
    };
    
    console.log(`Created new room: ${roomId}`);
    
    // Now join the newly created room
    socket.emit('create-room-success', { roomId });
    
    // Join the room
    socket.join(roomId);
    
    // Add user to the room
    const user = {
      id: socket.id,
      name: userName,
      lastActivity: Date.now()
    };
    
    rooms[roomId].users.push(user);
    rooms[roomId].lastActivity = Date.now();
    
    // Acknowledge the room creation and join
    socket.emit('room-joined', { 
      roomId,
      socketId: socket.id,
      userName,
      isNewRoom: true,
      users: [user]
    });
    
    console.log(`User ${socket.id} (${userName}) created and joined room ${roomId}`);
  });
  
  // Join an existing room
  socket.on('join-room', (data) => {
    if (!data || !data.roomId) {
      console.error('Invalid join-room data:', data);
      socket.emit('room-error', { message: 'Invalid room data' });
      return;
    }
    
    const { roomId, userName = 'Anonymous' } = data;
    
    // Check if room exists (for joining existing rooms)
    if (!rooms[roomId]) {
      console.log(`Room ${roomId} does not exist`);
      socket.emit('room-error', { 
        message: 'Room does not exist. Please check the room code or create a new room.' 
      });
      return;
    }
    
    // Join the room
    socket.join(roomId);
    
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
    
    // Create user data for response
    const userData = {
      id: socket.id,
      name: userName
    };
    
    // Acknowledge the room join to the joining user
    socket.emit('room-joined', { 
      roomId,
      socketId: socket.id,
      userName,
      users: rooms[roomId].users.map(u => ({
        id: u.id,
        name: u.name
      }))
    });
    
    // Notify all users in the room (including the joining user) about the updated user list
    io.to(roomId).emit('room-updated', {
      roomId,
      users: rooms[roomId].users.map(u => ({
        id: u.id,
        name: u.name
      })),
      action: 'user-joined',
      user: userData
    });
    
    console.log(`User ${socket.id} (${userName}) joined room ${roomId}`);
    
    console.log(`User ${userName} (${socket.id}) joined room ${roomId}`);
  });
  
  // Handle play-sound event
  socket.on('play-sound', (data) => {
    if (!data || !data.roomId || !data.soundId) {
      console.error('Invalid play-sound data:', data);
      return;
    }
    
    const { roomId, soundId, timestamp = Date.now() } = data;
    
    // Update room activity if room exists
    if (!rooms[roomId]) {
      console.error(`Room not found: ${roomId}`);
      return;
    }
    
    // Update room activity
    rooms[roomId].lastActivity = Date.now();
    
    // Find the user who played the sound
    const user = rooms[roomId].users.find(u => u.id === socket.id);
    if (!user) {
      console.error(`User ${socket.id} not found in room ${roomId}`);
      return;
    }
    
    // Update user's last activity
    user.lastActivity = Date.now();
    
    // Broadcast to all users in the room except the sender
    socket.to(roomId).emit('play-sound', {
      soundId,
      timestamp,
      socketId: socket.id,
      userId: socket.id,
      userName: user.name
    });
    
    console.log(`User ${user.name} (${socket.id}) played sound ${soundId} in room ${roomId}`);
  });
  
  // Handle leave-room event
  socket.on('leave-room', (data) => {
    if (!data || !data.roomId) {
      console.error('Invalid leave-room data:', data);
      return;
    }
    
    const { roomId } = data;
    
    if (rooms[roomId]) {
      // Remove user from the room
      const userIndex = rooms[roomId].users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        const userName = rooms[roomId].users[userIndex].name;
        rooms[roomId].users.splice(userIndex, 1);
        console.log(`User ${userName} (${socket.id}) left room ${roomId}`);
        
        // Update room activity
        rooms[roomId].lastActivity = Date.now();
        
        // Notify remaining users in the room
        io.to(roomId).emit('room-updated', {
          roomId,
          users: rooms[roomId].users.map(u => ({
            id: u.id,
            name: u.name
          }))
        });
        
        // Leave the socket room
        socket.leave(roomId);
      }
      
      // Clean up empty rooms
      if (rooms[roomId].users.length === 0) {
        console.log(`Room ${roomId} is empty, cleaning up`);
        delete rooms[roomId];
      }
    } else {
      console.error(`Room ${roomId} not found when trying to leave`);
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
