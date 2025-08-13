const dotenv = require('dotenv');
dotenv.config();

const AMADEUS_ENV = (process.env.AMADEUS_ENV || 'test').toLowerCase();
const AMADEUS_BASE = AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';

let cachedToken = null;
let tokenExpiryEpochMs = 0;

function computeOfferUID(offer) {
  // Prefer Amadeus id if present
  if (offer && offer.id) return String(offer.id);
  // Build a deterministic signature from itineraries and prices
  try {
    const parts = [];
    for (const it of offer.itineraries || []) {
      for (const seg of it.segments || []) {
        parts.push(`${seg.departure?.iataCode}-${seg.arrival?.iataCode}-${seg.departure?.at}-${seg.arrival?.at}-${seg.carrierCode || seg.marketingCarrier}-${seg.number}`);
      }
    }
    parts.push(`price:${offer?.price?.grandTotal || offer?.price?.total || ''}:${offer?.price?.currency || ''}`);
    return parts.join('|');
  } catch {
    return null;
  }
}

async function fetchAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiryEpochMs - 60_000) {
    return cachedToken;
  }

  const clientId = process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_API_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Amadeus API credentials are not set');
  }

  const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus auth failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiryEpochMs = now + (data.expires_in || 0) * 1000;
  return cachedToken;
}

async function searchFlightOffers({ origin, destination, departDate, returnDate, adults = 1, airline }) {
  const token = await fetchAccessToken();
  const url = new URL(`${AMADEUS_BASE}/v2/shopping/flight-offers`);
  url.searchParams.set('originLocationCode', origin);
  url.searchParams.set('destinationLocationCode', destination);
  url.searchParams.set('departureDate', departDate);
  if (returnDate) url.searchParams.set('returnDate', returnDate);
  url.searchParams.set('adults', String(adults));
  url.searchParams.set('currencyCode', 'USD');
  url.searchParams.set('max', '50');
  if (airline && typeof airline === 'string' && airline.trim().length > 0) {
    url.searchParams.set('includedAirlineCodes', airline.trim().toUpperCase());
  }

  console.log('[Amadeus] Request', {
    env: AMADEUS_ENV,
    origin,
    destination,
    departDate,
    returnDate,
    adults,
    airline: airline || null,
    url: url.toString(),
  });

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn('[Amadeus] Error response', res.status, text?.slice(0, 500));
    throw new Error(`Amadeus search failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  const offers = (json.data || []).map((o) => ({ ...o, _uid: computeOfferUID(o) }));
  const carriers = (json.dictionaries && json.dictionaries.carriers) || {};

  const carrierSet = new Set();
  for (const offer of offers.slice(0, 10)) {
    for (const itinerary of offer.itineraries || []) {
      for (const segment of itinerary.segments || []) {
        if (segment.carrierCode) carrierSet.add(segment.carrierCode);
        if (segment.marketingCarrier) carrierSet.add(segment.marketingCarrier);
      }
    }
  }
  console.log('[Amadeus] Offers returned:', offers.length, 'Carriers sample:', Array.from(carrierSet));

  return { offers, carriers };
}

function formatDate(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, delta) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + delta);
  return formatDate(d);
}

async function searchFlightOffersWithFlex(params, flexDays = 1) {
  let { offers, carriers } = await searchFlightOffers(params);
  if (offers && offers.length > 0) return { offers, carriers };

  console.log('[Amadeus] No offers for exact dates. Trying flex +/-', flexDays, 'day(s)');

  const offsets = [-1, 1];
  for (const depOffset of offsets) {
    for (const retOffset of offsets) {
      try {
        const alt = {
          ...params,
          departDate: addDays(params.departDate, depOffset),
          returnDate: addDays(params.returnDate, retOffset),
        };
        console.log('[Amadeus] Flex attempt', alt.departDate, alt.returnDate);
        const result = await searchFlightOffers(alt);
        if (result.offers && result.offers.length > 0) {
          console.log('[Amadeus] Flex found offers with', alt.departDate, alt.returnDate, 'count:', result.offers.length);
          return result;
        }
      } catch (e) {
        console.warn('[Amadeus] Flex attempt failed:', e.message);
      }
    }
  }
  console.log('[Amadeus] No offers found after flex attempts.');
  return { offers: [], carriers: {} };
}

function computeTaxApprox(price) {
  const base = parseFloat(price?.base || '0');
  const grand = parseFloat(price?.grandTotal || price?.total || '0');
  const feesSum = Array.isArray(price?.fees)
    ? price.fees.reduce((acc, f) => acc + parseFloat(f?.amount || '0'), 0)
    : 0;
  const totalTaxes = price?.totalTaxes != null ? parseFloat(price.totalTaxes) : NaN;
  const taxes = Number.isFinite(totalTaxes) ? totalTaxes : Math.max(0, grand - base - feesSum);
  return { base, grand, taxes, feesSum };
}

function transformOfferToDetails(offer) {
  const priceObj = offer.price || {};
  const { base, grand, taxes } = computeTaxApprox(priceObj);
  const currency = priceObj.currency || 'USD';

  const itineraries = (offer.itineraries || []).map((it) => {
    const segments = (it.segments || []).map((s) => ({
      departure: s.departure,
      arrival: s.arrival,
      marketingCarrier: s.marketingCarrier || s.carrierCode,
      operatingCarrier: s.operatingCarrier || s.operating,
      flightNumber: s.number,
      duration: s.duration,
    }));

    const stops = Math.max(0, segments.length - 1);

    const layovers = [];
    for (let i = 0; i < segments.length - 1; i++) {
      const arr = segments[i].arrival;
      const dep = segments[i + 1].departure;
      layovers.push({
        airport: arr.iataCode,
        from: arr.at,
        to: dep.at,
      });
    }

    return { segments, stops, layovers };
  });

  return { price: Math.round(grand), currency, base, grandTotal: grand, taxes, itineraries };
}

async function priceFlightOffer(offer) {
  const token = await fetchAccessToken();
  const url = `${AMADEUS_BASE}/v1/shopping/flight-offers/pricing`;
  console.log('[Amadeus] Pricing request to', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'flight-offers-pricing',
        flightOffers: [offer],
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn('[Amadeus] Pricing error', res.status, text?.slice(0, 500));
    throw new Error(`Amadeus pricing failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  const pricedOffer = json?.data?.flightOffers?.[0] || offer;

  let taxes = null;
  if (Array.isArray(pricedOffer?.travelerPricings)) {
    taxes = 0;
    for (const tp of pricedOffer.travelerPricings) {
      const tpTaxes = Array.isArray(tp?.price?.taxes)
        ? tp.price.taxes.reduce((sum, t) => sum + parseFloat(t?.amount || '0'), 0)
        : 0;
      taxes += tpTaxes;
    }
  }

  const priceObj = pricedOffer.price || {};
  const approx = computeTaxApprox(priceObj);
  const currency = priceObj.currency || 'USD';

  return {
    base: approx.base,
    grandTotal: approx.grand,
    taxes: taxes != null ? taxes : approx.taxes,
    currency,
    offer: { ...pricedOffer, _uid: computeOfferUID(pricedOffer) },
  };
}

function sanitizeKeyword(input) {
  if (!input) return '';
  // Keep letters, numbers, and spaces; collapse multiple spaces; uppercase; trim
  const cleaned = String(input)
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  return cleaned;
}

async function searchLocations(keyword) {
  const token = await fetchAccessToken();
  const q = sanitizeKeyword(keyword);
  if (!q || q.length < 2) {
    return [];
  }
  const url = new URL(`${AMADEUS_BASE}/v1/reference-data/locations`);
  url.searchParams.set('subType', 'CITY,AIRPORT');
  url.searchParams.set('keyword', q);
  url.searchParams.set('page[limit]', '20');

  console.log('[Amadeus] Locations request', url.toString());
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    console.warn('[Amadeus] Locations error', res.status, text?.slice(0, 300));
    // Rate limit or bad input: return empty gracefully
    if (res.status === 400 || res.status === 429) return [];
    throw new Error(`Amadeus locations failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  const data = json.data || [];
  return data.map((item) => ({
    id: item.id,
    iataCode: item.iataCode,
    name: item.name,
    subType: item.subType,
    address: item.address || {},
  }));
}

function sanitizeAirlineCode(input) {
  if (!input) return '';
  return String(input).replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3);
}

async function searchAirlines(query) {
  const token = await fetchAccessToken();
  const code = sanitizeAirlineCode(query);
  if (!code || code.length < 2) return [];
  const url = new URL(`${AMADEUS_BASE}/v1/reference-data/airlines`);
  url.searchParams.set('airlineCodes', code);
  console.log('[Amadeus] Airlines request', url.toString());
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    console.warn('[Amadeus] Airlines error', res.status, text?.slice(0, 300));
    if (res.status === 400 || res.status === 429) return [];
    throw new Error(`Amadeus airlines failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  const data = json.data || [];
  return data.map((a) => ({ code: a.iataCode, name: a.businessName || a.commonName || a.legalName || '' }));
}

module.exports = { searchFlightOffers, searchFlightOffersWithFlex, transformOfferToDetails, priceFlightOffer, computeOfferUID, searchLocations, searchAirlines }; 