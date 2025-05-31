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
      socket.emit('join-room', roomId);
      
      // Listen for room info updates
      socket.on('room-info', (data) => {
        setUserCount(data.users);
      });
      
      // Listen for play sound events
      socket.on('play-sound', (data) => {
        playSound(data.soundId, false);
      });
    }
  }, [socket, roomId]);

  // Fetch sounds from the server
  useEffect(() => {
    const apiUrl = `${process.env.REACT_APP_API_URL}/api/sounds`;
    console.log('Fetching sounds from:', apiUrl);
    
    fetch(apiUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Received sounds data:', data);
        if (!Array.isArray(data)) {
          throw new Error('Expected an array of sounds but got: ' + JSON.stringify(data));
        }
        
        setSounds(data);
        
        // Pre-load audio elements
        const audioElementsObj = {};
        const loadPromises = data.map(sound => {
          return new Promise((resolve) => {
            try {
              if (!sound.url) {
                console.warn('Sound missing URL:', sound);
                return resolve();
              }
              
              const audioUrl = sound.url.startsWith('http')
                ? sound.url
                : `${process.env.REACT_APP_API_URL}${sound.url}`;
                
              console.log('Loading sound:', sound.name, 'from', audioUrl);
              const audio = new Audio(audioUrl);
              
              audio.oncanplaythrough = () => {
                console.log('Successfully loaded:', sound.name);
                audioElementsObj[sound.id] = audio;
                resolve();
              };
              
              audio.onerror = (e) => {
                console.error('Error loading sound:', sound.name, e);
                resolve(); // Resolve anyway to continue loading other sounds
              };
              
              audio.load();
            } catch (error) {
              console.error('Error initializing sound:', sound.name, error);
              resolve(); // Resolve anyway to continue loading other sounds
            }
          });
        });
        
        Promise.all(loadPromises).then(() => {
          console.log('All sounds loaded');
          setAudioElements(audioElementsObj);
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
      
      // Create a new audio element to allow overlapping sounds
      const audioClone = new Audio(audio.src);
      audioClone.volume = isLocal ? localVolume / 100 : remoteVolume / 100;
      
      // Play the sound
      const playPromise = audioClone.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('Playback failed:', error);
          // Try again with user interaction
          document.body.addEventListener('click', function playOnClick() {
            audioClone.play().catch(e => console.error('Still failed:', e));
            document.body.removeEventListener('click', playOnClick);
          }, { once: true });
        });
      }
      
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

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    localStorage.setItem('userName', userName);
    const newRoomId = uuidv4().substring(0, 8);
    navigate(`/room/${newRoomId}`);
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
    
    localStorage.setItem('userName', userName);
    navigate(`/room/${roomId}`);
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
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="Enter room code"
                  required
                  maxLength="8"
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              <button type="submit" className="primary-button">
                Join Room
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
