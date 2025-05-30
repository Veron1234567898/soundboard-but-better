import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { API_URL } from './config';
import { FaHeart, FaPlus, FaSearch, FaSortAmountDown, FaVolumeMute, FaVolumeUp, FaPlay, FaStop } from 'react-icons/fa';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

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

  // Initialize socket connection to Replit backend
  useEffect(() => {
    const newSocket = io(API_URL, {
      withCredentials: false,
      transports: ['websocket', 'polling']
    });
    
    setSocket(newSocket);
    
    // Connection status logging
    newSocket.on('connect', () => {
      console.log('Connected to Replit backend with ID:', newSocket.id);
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
    
    // Clean up on unmount
    return () => newSocket.disconnect();
  }, []);

  // Join room when socket is ready and roomId is available
  useEffect(() => {
    if (socket && roomId) {
      // Join the room with user info
      socket.emit('join-room', {
        roomId,
        userName: `User-${Math.floor(Math.random() * 1000)}` // Random username
      });
      
      // Listen for room info updates
      socket.on('room-info', (data) => {
        console.log('Room info received:', data);
        setUserCount(data.userCount || 1);
      });
      
      // Listen for play sound events
      socket.on('play-sound', (data) => {
        console.log('Remote sound play received:', data);
        playSound(data.soundId, false);
      });
    }
  }, [socket, roomId]);

  // Fetch sounds from the Replit backend
  useEffect(() => {
    console.log('Fetching sounds from:', `${API_URL}/api/sounds`);
    fetch(`${API_URL}/api/sounds`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Fetched sounds:', data);
        setSounds(data);
        
        // Pre-load audio elements with error handling
        const audioElementsObj = {};
        data.forEach(sound => {
          try {
            // Use the full URL from the backend response if available, or construct it
            const soundUrl = sound.url || `${API_URL}/sounds/${sound.file}`;
            console.log(`Loading sound: ${sound.name} from ${soundUrl}`);
            const audio = new Audio(soundUrl);
            
            // Add error handling for audio loading
            audio.onerror = (e) => {
              console.error(`Error loading sound ${sound.name}:`, e);
            };
            
            audioElementsObj[sound.id] = audio;
          } catch (error) {
            console.error(`Error creating audio element for ${sound.name}:`, error);
          }
        });
        setAudioElements(audioElementsObj);
      })
      .catch(error => {
        console.error('Error fetching sounds:', error);
        // You might want to set an error state here to show to the user
      });
  }, [API_URL]);

  // Function to play a sound
  const playSound = (soundId, isLocal = true) => {
    console.log(`Playing sound ${soundId}, isLocal: ${isLocal}`);
    const audio = audioElements[soundId];
    
    if (!audio) {
      console.error(`Sound with ID ${soundId} not found in audioElements`);
      return;
    }
    
    try {
      // Clone the audio element to allow overlapping sounds
      const audioClone = new Audio(audio.src);
      
      // Set volume based on whether it's a local or remote play
      audioClone.volume = isLocal ? localVolume / 100 : remoteVolume / 100;
      
      // Stop any currently playing sound if not in playlist mode
      if (lastPlayedSound && !isInPlaylistMode && audioElements[lastPlayedSound]) {
        audioElements[lastPlayedSound].pause();
        audioElements[lastPlayedSound].currentTime = 0;
      }
      
      // Play the sound
      audioClone.play().catch(error => {
        console.error('Error playing sound:', error);
      });
      
      // Update the last played sound
      setLastPlayedSound(soundId);
      
      // If it's a local play, broadcast to other users
      if (isLocal && socket && roomId) {
        console.log('Broadcasting sound to room:', roomId, soundId);
        socket.emit('play-sound', {
          roomId,
          soundId,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      console.error('Error in playSound:', error);
    }
    
    // Play the sound
    audio.play();
    setLastPlayedSound(soundId);
    setIsPlaying(true);
    
    // When sound ends
    audio.onended = () => {
      if (lastPlayedSound === soundId) {
        setIsPlaying(false);
      }
    };
    
    // If it's a local play, emit to other users
    if (isLocal && socket && roomId) {
      console.log('Broadcasting sound to room:', roomId, soundId);
      socket.emit('play-sound', {
        roomId,
        soundId,
        timestamp: Date.now()
      });
    
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

  const handleCreateRoom = () => {
    const newRoomId = uuidv4().substring(0, 8);
    navigate(`/room/${newRoomId}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId}`);
    }
  };

  return (
    <div className="home-container">
      <h1>Soundboard But Better</h1>
      <div className="room-actions">
        <button onClick={handleCreateRoom} className="create-room-button">
          Create New Room
        </button>
        <form onSubmit={handleJoinRoom} className="join-room-form">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter Room Code"
            required
          />
          <button type="submit">Join Room</button>
        </form>
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
