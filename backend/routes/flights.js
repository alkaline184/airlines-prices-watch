const express = require('express');
const router = express.Router();
const { fetchAllPrices } = require('../services/pricingService');
const { priceFlightOffer, searchLocations, searchAirlines } = require('../integrations/amadeus');

// GET /api/flights/locations?q=Dubai
router.get('/locations', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const data = await searchLocations(q);
    res.json(data);
  } catch (error) {
    console.error('Locations error', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// GET /api/flights/airlines?q=EK
router.get('/airlines', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const data = await searchAirlines(q);
    res.json(data);
  } catch (error) {
    console.error('Airlines error', error);
    res.status(500).json({ error: 'Failed to fetch airlines' });
  }
});

// GET /api/flights/search?origin=CLT&destination=IATA&depart=YYYY-MM-DD&return=YYYY-MM-DD&airline=EK
router.get('/search', async (req, res) => {
  try {
    const origin = (req.query.origin || 'CLT').toUpperCase();
    const destination = (req.query.destination || '').toUpperCase();
    const departDate = req.query.depart;
    const returnDate = req.query.return;
    const airline = (req.query.airline || '').toUpperCase();
    const adults = 1;

    if (!destination) {
      return res.status(400).json({ error: 'destination (IATA code) is required' });
    }
    if (!departDate || !returnDate) {
      return res.status(400).json({ error: 'depart and return query params are required (YYYY-MM-DD)' });
    }

    const results = await fetchAllPrices({ origin, destination, departDate, returnDate, adults, airline });

    const grouped = {};
    for (const r of results) {
      const key = r.code || r.airline;
      if (!grouped[key]) grouped[key] = [];
      if (grouped[key].length < 5) grouped[key].push(r);
    }

    res.json({ origin, destination, departDate, returnDate, adults, airline: airline || null, results, grouped });
  } catch (error) {
    console.error('Search error', error);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

// POST /api/flights/price-confirm
// Body: { offer: <raw flight offer from Amadeus search> }
router.post('/price-confirm', async (req, res) => {
  try {
    const offer = req.body?.offer;
    if (!offer) return res.status(400).json({ error: 'offer is required' });
    const priced = await priceFlightOffer(offer);
    res.json(priced);
  } catch (error) {
    console.error('Price confirm error', error);
    res.status(500).json({ error: 'Failed to confirm price' });
  }
});

module.exports = router; 