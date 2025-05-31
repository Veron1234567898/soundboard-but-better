import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FaHeart, FaPlus, FaSearch, FaSortAmountDown, FaVolumeMute, FaVolumeUp, FaPlay, FaStop } from 'react-icons/fa';
import { v4 as uuidv4 } from 'uuid';

// Component to display room information and connected users
const RoomInfo = ({ roomId, users, onLeaveRoom, socket }) => {
  if (!roomId) return null;
  
  return (
    <div className="room-info">
      <div className="room-header">
        <h3>Room: {roomId}</h3>
        <button onClick={onLeaveRoom} className="leave-room-btn">
          Leave Room
        </button>
      </div>
      <div className="connected-users">
        <h4>Connected Users ({users.length})</h4>
        <ul>
          {users.map(user => (
            <li key={user.id}>
              <span className={`user-status ${user.id === socket?.id ? 'you' : ''}`}>
                {user.name} {user.id === socket?.id ? '(You)' : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// Component to hold the main soundboard
const Soundboard = () => {
  const { roomId } = useParams();
  const [socket, setSocket] = useState(null);
  const [sounds, setSounds] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState(1);
  const [userCount, setUserCount] = useState(1);
  const [localVolume, setLocalVolume] = useState(50);
  const [remoteVolume, setRemoteVolume] = useState(50);
  const [favorites, setFavorites] = useState([]);
  const [audioElements, setAudioElements] = useState({});
  const [lastPlayedSound, setLastPlayedSound] = useState(null);
  const [isInPlaylistMode, setIsInPlaylistMode] = useState(false);
  const [isPassThrough, setIsPassThrough] = useState(false);
  const [roomUsers, setRoomUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('userName') || '';
  });

  // Function to leave the current room
  const leaveRoom = () => {
    if (socket && roomId) {
      socket.emit('leave-room', { roomId });
      setRoomId('');
      setRoomUsers([]);
      
      // Update URL to remove room ID
      const url = new URL(window.location);
      url.searchParams.delete('room');
      window.history.pushState({}, '', url);
    }
  };

  // Initialize socket connection
  useEffect(() => {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    console.log('Connecting to socket server at:', apiUrl);
    
    const newSocket = io(apiUrl, {
      transports: ['websocket'],
      secure: apiUrl.startsWith('https'),
      rejectUnauthorized: false,
      withCredentials: true
    });
    
    setSocket(newSocket);
    
    // Connection event listeners
    newSocket.on('connect', () => {
      console.log('Connected to server with ID:', newSocket.id);
      
      // Get roomId from URL and userName from localStorage
      const urlParams = new URLSearchParams(window.location.search);
      const roomId = urlParams.get('room');
      const storedUserName = localStorage.getItem('userName') || 'Anonymous';
      
      // If we have a roomId in the URL, join the room
      if (roomId) {
        console.log('Auto-joining room:', roomId);
        console.log('Using username:', storedUserName);
        
        // Set the roomId in state
        setRoomId(roomId);
        
        // Emit join-room event with user's name
        newSocket.emit('join-room', { 
          roomId,
          userName: storedUserName
        });
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });
    
    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setRoomUsers([]);
    });
    
    // Handle room-joined event
    newSocket.on('room-joined', (data) => {
      console.log('Successfully joined room:', data);
      setRoomId(data.roomId);
      setRoomUsers(prevUsers => [
        ...prevUsers.filter(u => u.id !== data.socketId),
        { id: data.socketId, name: data.userName }
      ]);
      
      // Update URL with room ID
      const url = new URL(window.location);
      url.searchParams.set('room', data.roomId);
      window.history.pushState({}, '', url);
    });
    
    // Handle room-updated event
    newSocket.on('room-updated', (data) => {
      console.log('Room users updated:', data);
      setRoomUsers(data.users);
    });
    
    // Handle play-sound event from server
    newSocket.on('play-sound', (data) => {
      console.log('Received play-sound event:', data);
      if (data && data.soundId) {
        // Only play the sound if it's from another user
        if (data.socketId !== newSocket.id) {
          playSound(data.soundId, false);
        }
      } else {
        console.error('Invalid play-sound data:', data);
      }
    });
    
    // Clean up on unmount
    return () => {
      newSocket.off('connect');
      newSocket.off('connect_error');
      newSocket.off('disconnect');
      newSocket.off('play-sound');
      newSocket.disconnect();
    };
  }, []);

  // Join room when socket is ready and roomId is available
  useEffect(() => {
    if (socket && roomId) {
      const userName = localStorage.getItem('userName') || 'Anonymous';
      
      console.log('Joining room with ID:', roomId, 'and name:', userName);
      
      // Join the room with user info
      socket.emit('join-room', {
        roomId,
        userName
      });
      
      // Listen for room updates
      const handleRoomUpdate = (data) => {
        console.log('Room updated:', data);
        if (data.roomId === roomId) {
          setRoomUsers(data.users || []);
          setUserCount(data.users?.length || 0);
          
          // If a new user joined, show a notification
          if (data.action === 'user-joined' && data.user.id !== socket.id) {
            console.log(`${data.user.name} joined the room`);
          }
        }
      };
      
      // Listen for play sound events
      const handlePlaySound = (data) => {
        console.log('Received play-sound event:', data);
        if (data.roomId === roomId) {
          console.log('Playing remote sound:', data.soundId);
          playSound(data.soundId, false);
        }
      };
      
      // Set up all socket event listeners
      socket.on('room-updated', handleRoomUpdate);
      socket.on('play-sound', handlePlaySound);
      
      // Log all socket events for debugging
      const originalEmit = socket.emit.bind(socket);
      socket.emit = (event, ...args) => {
        console.log('Emitting event:', event, args);
        return originalEmit(event, ...args);
      };
      
      // Clean up event listeners
      return () => {
        console.log('Cleaning up socket listeners');
        socket.off('room-updated', handleRoomUpdate);
        socket.off('play-sound', handlePlaySound);
        
        // Leave the room when component unmounts
        if (socket.connected) {
          console.log('Leaving room:', roomId);
          socket.emit('leave-room', { roomId });
        }
      };
    }
  }, [socket, roomId]);

  // Fetch sounds from the server
  useEffect(() => {
    const apiUrl = `${process.env.REACT_APP_API_URL}/api/sounds`;
    console.log('Fetching sounds from:', apiUrl);
    
    fetch(apiUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch sounds');
        }
        return response.json();
      })
      .then(data => {
        console.log('Received sounds data:', data);
        setSounds(data);
        
        // Preload all sounds with proper preloading
        const audioElementsObj = {};
        const loadPromises = data.map(sound => {
          return new Promise((resolve) => {
            try {
              if (!sound.url) {
                console.warn('Sound missing URL:', sound);
                return resolve();
              }
              
              // Ensure the URL is properly formatted
              let audioUrl = sound.url;
              if (!audioUrl.startsWith('http')) {
                // If it's a relative URL, prepend the API URL
                audioUrl = `${process.env.REACT_APP_API_URL}${audioUrl.startsWith('/') ? '' : '/'}${audioUrl}`;
              }
              
              console.log('Loading sound:', sound.name, 'from', audioUrl);
              
              // Create audio element with error handling
              const audio = new Audio();
              audio.preload = 'auto';
              audio.autoplay = false;
              
              // Handle successful load
              audio.oncanplaythrough = () => {
                console.log('Sound loaded successfully:', sound.name);
                audioElementsObj[sound.id] = audio;
                resolve();
              };
              
              // Handle load errors
              audio.onerror = (e) => {
                console.error('Error loading sound:', sound.name, 'Error:', e);
                resolve(); // Resolve to continue with other sounds
              };
              
              // Set the source last to start loading
              audio.src = audioUrl;
              
              // For browsers that don't fire oncanplaythrough for cached files
              if (audio.readyState >= 3) { // HAVE_FUTURE_DATA or more
                audioElementsObj[sound.id] = audio;
                resolve();
              }
              
            } catch (error) {
              console.error('Error initializing sound:', sound.name, error);
              resolve(); // Resolve anyway to continue loading other sounds
            }
          });
        });
        
        // Set audio elements immediately, even as they're loading
        setAudioElements(audioElementsObj);
        
        Promise.all(loadPromises).then(() => {
          console.log('All sounds preloaded');
        });
      })
      .catch(error => {
        console.error('Error fetching sounds:', error);
        // Add error state to show in the UI
        setSounds([{ 
          id: 'error', 
          name: 'Error loading sounds', 
          error: error.message 
        }]);
      });
  }, []);

  // Function to play a sound
  const playSound = (soundId, isLocal = true) => {
    try {
      const audio = audioElements[soundId];
      if (!audio) {
        console.error('Audio element not found for sound ID:', soundId);
        return;
      }
      
      console.log('Playing sound:', soundId, 'volume:', isLocal ? localVolume : remoteVolume);
      
      // Create a new audio element for each play to allow overlapping
      const audioClone = new Audio(audio.src);
      audioClone.volume = isLocal ? localVolume / 100 : remoteVolume / 100;
      audioClone.muted = false;
      
      // Simple play function with retry logic
      const playWithRetry = (retryCount = 2) => {
        const playPromise = audioClone.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('Playback started successfully');
            })
            .catch(error => {
              console.log('Playback failed, retrying...');
              if (retryCount > 0) {
                // Try again with a small delay
                setTimeout(() => playWithRetry(retryCount - 1), 50);
              } else {
                console.error('All playback attempts failed:', error);
              }
            });
        }
      };
      
      // Start playback with retry
      playWithRetry();
      
      // Clean up the audio element when done
      audioClone.onended = audioClone.onerror = () => {
        audioClone.remove();
      };
      
      // Emit to other users in the room if it's a local play
      if (isLocal && socket && roomId) {
        console.log('Emitting play-sound to room:', roomId, 'sound:', soundId);
        socket.emit('play-sound', { 
          roomId, 
          soundId,
          timestamp: Date.now()
        });
      }
      
      // Clean up the audio element after it finishes playing
      audioClone.onended = () => {
        audioClone.remove();
      };
      
      return audioClone;
    } catch (error) {
      console.error('Error in playSound:', error);
      return null;
    }
  };

  // Stop all sounds
  const stopAllSounds = () => {
    Object.values(audioElements).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    setIsPlaying(false);
  };

  // Toggle favorite
  const toggleFavorite = (soundId) => {
    if (favorites.includes(soundId)) {
      setFavorites(favorites.filter(id => id !== soundId));
    } else {
      setFavorites([...favorites, soundId]);
    }
  };

  // Filter sounds based on active tab
  const getFilteredSounds = () => {
    if (activeTab === 6) { // Favorites tab
      return sounds.filter(sound => favorites.includes(sound.id));
    }
    // In a real app, you might filter by categories or tabs
    return sounds;
  };

  return (
    <div className="soundboard-container">
      {roomId && (
        <div className="room-info-container">
          <RoomInfo 
            roomId={roomId}
            users={roomUsers}
            onLeaveRoom={leaveRoom}
            socket={socket}
          />
        </div>
      )}
      <div className="controls-container">
        <button
          className={`stop-button ${isPlaying ? 'active' : ''}`}
          onClick={stopAllSounds}
        >
          <FaStop /> STOP
        </button>
        
        <div className="volume-control">
          <FaVolumeMute />
          <span>Local volume</span>
          <input
            type="range"
            min="0"
            max="100"
            value={localVolume}
            onChange={(e) => setLocalVolume(parseInt(e.target.value))}
            className="volume-slider"
          />
        </div>
        
        <div className="volume-control">
          <FaVolumeMute />
          <span>Remote volume</span>
          <input
            type="range"
            min="0"
            max="100"
            value={remoteVolume}
            onChange={(e) => setRemoteVolume(parseInt(e.target.value))}
            className="volume-slider"
          />
        </div>
      </div>
      
      <div className="tabs-container">
        {[1, 2, 3, 4, 5].map(tabNum => (
          <button
            key={`tab-${tabNum}`}
            className={`tab ${activeTab === tabNum ? 'active' : ''}`}
            onClick={() => setActiveTab(tabNum)}
          >
            TAB {tabNum}
          </button>
        ))}
      </div>
      
      <div className="sounds-container">
        {getFilteredSounds().map(sound => (
          <div key={sound.id} className="sound-item">
            <div className="sound-name" onClick={() => playSound(sound.id)}>
              {sound.name}
            </div>
            <div className="sound-actions">
              <button
                className={`favorite-button ${favorites.includes(sound.id) ? 'active' : ''}`}
                onClick={() => toggleFavorite(sound.id)}
              >
                <FaHeart />
              </button>
              <button className="edit-button">
                <FaPlay />
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="sidebar-container">
        <button className="sidebar-button">
          <FaPlus /> ADD TAB
        </button>
        <button className="sidebar-button">
          <FaSearch /> RELOAD
        </button>
        <button className="sidebar-button">
          <FaPlus /> DOWNLOADER
        </button>
        <button className="sidebar-button">
          <FaSearch /> SEARCH
        </button>
        <button className="sidebar-button">
          <FaSortAmountDown /> SORT
        </button>
        <button
          className={`sidebar-button ${activeTab === 6 ? 'active' : ''}`}
          onClick={() => setActiveTab(6)}
        >
          <FaHeart /> FAVORITES
        </button>
        <button
          className={`sidebar-button ${isInPlaylistMode ? 'active' : ''}`}
          onClick={() => setIsInPlaylistMode(!isInPlaylistMode)}
        >
          <FaPlay /> PLAYLIST MODE
        </button>
        <button
          className={`sidebar-button ${isPassThrough ? 'active' : ''}`}
          onClick={() => setIsPassThrough(!isPassThrough)}
        >
          <FaVolumeUp /> PASS THROUGH
        </button>
        <button className="sidebar-button">
          <FaVolumeUp /> SETTINGS
        </button>
        <button className="sidebar-button">
          <FaVolumeUp /> HELP
        </button>
      </div>
      
      <div className="room-info">
        Room: {roomId} | Users: {userCount}
      </div>
    </div>
  );
};

// Home component for creating/joining rooms
const Home = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('userName') || '';
  });
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [socket, setSocket] = useState(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001');
    setSocket(newSocket);

    // Set up event listeners
    newSocket.on('room-joined', (data) => {
      console.log('Successfully joined room:', data);
      setIsJoining(false);
      // Only navigate if we're not already on the room page
      if (!window.location.pathname.includes(`/room/${data.roomId}`)) {
        navigate(`/room/${data.roomId}`);
      }
    });

    newSocket.on('room-error', (error) => {
      console.error('Room error:', error);
      setError(error.message || 'Failed to join room');
      setIsJoining(false);
    });
    
    newSocket.on('create-room-success', (data) => {
      console.log('Room created successfully:', data);
      // The room-joined event will handle the navigation
    });

    return () => {
      newSocket.disconnect();
    };
  }, [navigate]);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    setError('');
    setIsJoining(true);
    localStorage.setItem('userName', userName);
    
    // Generate a new room ID and create the room
    const newRoomId = uuidv4().substring(0, 8).toLowerCase();
    
    // Emit create-room event to the server
    socket.emit('create-room', {
      roomId: newRoomId,
      userName: userName.trim()
    });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    if (!roomId.trim()) {
      setError('Please enter a room code');
      return;
    }
    
    setError('');
    setIsJoining(true);
    localStorage.setItem('userName', userName);
    
    // Emit join-room event to the server
    const roomCode = roomId.trim().toLowerCase();
    console.log('Attempting to join room:', roomCode, 'with name:', userName.trim());
    
    socket.emit('join-room', {
      roomId: roomCode,
      userName: userName.trim()
    }, (response) => {
      console.log('Join room response:', response);
    });
    
    // Add socket event listeners for debugging
    socket.on('room-joined', (data) => {
      console.log('Room joined successfully:', data);
    });
    
    socket.on('room-error', (error) => {
      console.error('Error joining room:', error);
    });
  };

  return (
    <div className="home-container">
      <div className="home-content">
        <h1>Soundboard But Better</h1>
        <p className="subtitle">Create or join a room to start playing sounds with friends</p>
        
        <div className="card">
          <div className="card-header">
            <h2>Join a Room</h2>
          </div>
          <div className="card-body">
            <form onSubmit={handleJoinRoom} className="room-form">
              <div className="form-group">
                <label htmlFor="userName">Your Name</label>
                <input
                  id="userName"
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  required
                  maxLength="20"
                />
              </div>
              <div className="form-group">
                <label htmlFor="roomId">Room Code</label>
                <input
                  id="roomId"
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room code"
                  required
                  maxLength="8"
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              <button 
                type="submit" 
                className="primary-button"
                disabled={isJoining}
              >
                {isJoining ? 'Joining...' : 'Join Room'}
              </button>
            </form>
          </div>
        </div>
        
        <div className="divider">
          <span>OR</span>
        </div>
        
        <div className="card">
          <div className="card-header">
            <h2>Create New Room</h2>
          </div>
          <div className="card-body">
            <form onSubmit={handleCreateRoom} className="room-form">
              <div className="form-group">
                <label htmlFor="createUserName">Your Name</label>
                <input
                  id="createUserName"
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  required
                  maxLength="20"
                />
              </div>
              <button type="submit" className="primary-button create-button">
                Create New Room
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main App component with routing
const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<Soundboard />} />
    </Routes>
  );
};

export default App;
