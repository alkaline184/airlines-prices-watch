const express = require('express');
const router = express.Router();
const { fetchAllPrices } = require('../services/pricingService');
const { priceFlightOffer } = require('../integrations/amadeus');

// GET /api/flights/search?origin=CLT&destination=DXB&depart=YYYY-MM-DD&return=YYYY-MM-DD
router.get('/search', async (req, res) => {
  try {
    const origin = (req.query.origin || 'CLT').toUpperCase();
    const destination = (req.query.destination || 'DXB').toUpperCase();
    const departDate = req.query.depart;
    const returnDate = req.query.return;
    const adults = 1;

    if (!departDate || !returnDate) {
      return res.status(400).json({ error: 'depart and return query params are required (YYYY-MM-DD)' });
    }

    const results = await fetchAllPrices({ origin, destination, departDate, returnDate, adults });

    const grouped = {};
    for (const r of results) {
      const key = r.code || r.airline;
      if (!grouped[key]) grouped[key] = [];
      if (grouped[key].length < 5) grouped[key].push(r);
    }

    res.json({ origin, destination, departDate, returnDate, adults, results, grouped });
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