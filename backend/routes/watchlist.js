const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { fetchAllPrices } = require('../services/pricingService');
const { computeOfferUID } = require('../integrations/amadeus');

// Create or get existing watched flight, then record current price
router.post('/', async (req, res) => {
  try {
    const { airline, flightNumber, origin, destination, departDate, returnDate, price, currency = 'USD', details = null, amadeusOfferId = null, amadeusOffer = null } = req.body;
    if (!airline || !flightNumber || !origin || !destination || !departDate || !returnDate || price == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const uid = amadeusOffer ? computeOfferUID(amadeusOffer) : null;

      let watchedId;
      const detailsJson = details ? JSON.stringify(details) : null;
      const offerJson = amadeusOffer ? JSON.stringify(amadeusOffer) : null;

      if (amadeusOfferId || uid) {
        const [resUp] = await conn.query(
          `INSERT INTO watched_flights (airline, flight_number, origin, destination, depart_date, return_date, amadeus_offer_id, amadeus_offer_uid, amadeus_offer, details)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), amadeus_offer = VALUES(amadeus_offer), details = VALUES(details), amadeus_offer_uid = VALUES(amadeus_offer_uid)`,
          [airline, flightNumber, origin, destination, departDate, returnDate, amadeusOfferId, uid, offerJson, detailsJson]
        );
        watchedId = resUp.insertId;
      } else {
        const [resIns] = await conn.query(
          `INSERT INTO watched_flights (airline, flight_number, origin, destination, depart_date, return_date, details)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [airline, flightNumber, origin, destination, departDate, returnDate, detailsJson]
        );
        watchedId = resIns.insertId;
      }

      await conn.query(
        `INSERT INTO price_history (watched_flight_id, price, currency) VALUES (?, ?, ?)`,
        [watchedId, price, currency]
      );
      await conn.commit();

      const [rows] = await conn.query(
        `SELECT wf.*, (
           SELECT MIN(ph.price) FROM price_history ph WHERE ph.watched_flight_id = wf.id
         ) AS min_price,
         (
           SELECT ph.price FROM price_history ph WHERE ph.watched_flight_id = wf.id ORDER BY ph.fetched_at DESC LIMIT 1
         ) AS last_price
         FROM watched_flights wf WHERE wf.id = ?`,
        [watchedId]
      );

      res.status(201).json(rows[0]);
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Watch add error', error);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

// Get watchlist with latest price and min price
router.get('/', async (_req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT wf.*, (
         SELECT MIN(ph.price) FROM price_history ph WHERE ph.watched_flight_id = wf.id
       ) AS min_price,
       (
         SELECT ph.price FROM price_history ph WHERE ph.watched_flight_id = wf.id ORDER BY ph.fetched_at DESC LIMIT 1
       ) AS last_price
       FROM watched_flights wf ORDER BY wf.created_at DESC`
    );
    res.json(rows.map((r) => ({ ...r, details: safeParseJSON(r.details), amadeus_offer: safeParseJSON(r.amadeus_offer) })));
  } catch (error) {
    console.error('Watchlist fetch error', error);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

function safeParseJSON(val) {
  if (!val) return null;
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return null; }
}

// Get price history for a watched flight
router.get('/:id/history', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, price, currency, fetched_at FROM price_history WHERE watched_flight_id = ? ORDER BY fetched_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('History fetch error', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Refresh prices for all watched flights (bulk)
router.post('/refresh', async (_req, res) => {
  try {
    const pool = getPool();
    const [watched] = await pool.query(`SELECT * FROM watched_flights`);

    const refreshed = [];
    for (const wf of watched) {
      const offers = await fetchAllPrices({
        origin: wf.origin,
        destination: wf.destination,
        departDate: wf.depart_date.toISOString().slice(0, 10),
        returnDate: wf.return_date.toISOString().slice(0, 10),
        adults: 1,
      });

      let best = null;
      if (offers && offers.length > 0) {
        if (wf.amadeus_offer_id) {
          best = offers.find((o) => o.raw && (o.raw.id === wf.amadeus_offer_id || o.raw._uid === wf.amadeus_offer_uid));
        }
        if (!best && wf.amadeus_offer_uid) {
          best = offers.find((o) => o.raw && (o.raw._uid === wf.amadeus_offer_uid));
        }
        if (!best) {
          best = offers.find((o) => (o.code || '').toUpperCase() === (wf.flight_number.split(' ')[0] || '').toUpperCase()) || offers[0];
        }

        await pool.query(
          `INSERT INTO price_history (watched_flight_id, price, currency) VALUES (?, ?, ?)`,
          [wf.id, best.price, best.currency]
        );

        const bestUid = best.raw?._uid || null;
        await pool.query(`UPDATE watched_flights SET details = ?, amadeus_offer = ?, amadeus_offer_uid = ? WHERE id = ?`, [JSON.stringify(best.details || null), JSON.stringify(best.raw || null), bestUid, wf.id]);

        if (best.raw && best.raw.id) {
          await pool.query(`UPDATE watched_flights SET amadeus_offer_id = ? WHERE id = ?`, [best.raw.id, wf.id]);
        }

        refreshed.push({ id: wf.id, price: best.price, currency: best.currency });
      } else {
        refreshed.push({ id: wf.id, price: null, currency: null });
      }
    }

    res.json({ count: refreshed.length, refreshed });
  } catch (error) {
    console.error('Refresh error', error);
    res.status(500).json({ error: 'Failed to refresh prices' });
  }
});

// Delete watched flight
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query(`DELETE FROM watched_flights WHERE id = ?`, [req.params.id]);
    res.status(204).send();
  } catch (error) {
    console.error('Delete error', error);
    res.status(500).json({ error: 'Failed to delete watched flight' });
  }
});

module.exports = router; 