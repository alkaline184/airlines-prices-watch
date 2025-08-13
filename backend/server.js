const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { ensureDatabaseInitialized } = require('./db');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/flights', require('./routes/flights'));
app.use('/api/watchlist', require('./routes/watchlist'));

const startServer = async () => {
  try {
    await ensureDatabaseInitialized();
    const port = process.env.EXPRESS_PORT || 3000;
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
};

startServer(); 