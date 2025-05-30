// In development, use the proxy defined in package.json (http://localhost:3001)
// In production, use the Render backend URL
const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://soundboard-backend.onrender.com'
  : 'http://localhost:3001';

export { API_URL };
