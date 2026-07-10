import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* ----------------------------------------------------------------
   Interceptor: attach auth token + request timestamp
   ---------------------------------------------------------------- */
api.interceptors.request.use((config) => {
  config.metadata = { startTime: Date.now() };

  // Attach NGO auth token if present
  const token = sessionStorage.getItem('rs_ngo_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    const latency = Date.now() - (response.config.metadata?.startTime || Date.now());
    response.latency = latency;
    return response;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export default api;
