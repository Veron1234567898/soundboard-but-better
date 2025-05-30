import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FaHeart, FaPlus, FaSearch, FaSortAmountDown, FaVolumeMute, FaVolumeUp, FaPlay, FaStop } from 'react-icons/fa';
import { v4 as uuidv4 } from 'uuid';

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

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);
    
    // Clean up on unmount
    return () => newSocket.disconnect();
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
    fetch('http://localhost:3001/api/sounds')
      .then(response => response.json())
      .then(data => {
        setSounds(data);
        
        // Pre-load audio elements
        const audioElementsObj = {};
        data.forEach(sound => {
          const audio = new Audio(`/sounds/${sound.file}`);
          audioElementsObj[sound.id] = audio;
        });
        setAudioElements(audioElementsObj);
      })
      .catch(error => console.error('Error fetching sounds:', error));
  }, []);

  // Function to play a sound
  const playSound = (soundId, isLocal = true) => {
    const audio = audioElements[soundId];
    if (!audio) return;
    
    // Set volume based on whether it's a local or remote play
    audio.volume = isLocal ? localVolume / 100 : remoteVolume / 100;
    
    // Stop any currently playing sound
    if (lastPlayedSound && !isInPlaylistMode) {
      audioElements[lastPlayedSound].pause();
      audioElements[lastPlayedSound].currentTime = 0;
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
