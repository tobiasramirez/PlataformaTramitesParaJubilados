const { Pool } = require('pg');

// Toma automáticamente las variables inyectadas por Docker Compose desde el .env
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'tramites_db',
  user: process.env.DB_USER || 'api_tramites',
  password: process.env.DB_PASSWORD || 'api_tramites_pass_sec99',
  max: 10, // Máximo de conexiones simultáneas por backend
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Log de error inesperado en clientes inactivos del pool
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};