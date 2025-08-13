import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Stack,
  Divider,
  Autocomplete,
} from '@mui/material';
import { Delete as DeleteIcon, Refresh as RefreshIcon, Add as AddIcon } from '@mui/icons-material';
import axios from 'axios';
import dayjs from 'dayjs';
import durationPlugin from 'dayjs/plugin/duration';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

dayjs.extend(durationPlugin);

const API_BASE = '/api';

function ItineraryDetails({ offer }) {
  const details = offer.details;
  if (!details) return <Typography variant="body2" color="text.secondary">N/A</Typography>;

  const out = details.itineraries?.[0];
  const ret = details.itineraries?.[1];

  const priceLine = (
    <Typography variant="body2" sx={{ mb: 1 }}>
      Base: {details.base ? `$${Number(details.base).toFixed(2)}` : 'N/A'} • Taxes: {details.taxes != null ? `$${Number(details.taxes).toFixed(2)}` : 'N/A'} • Total: {details.grandTotal ? `$${Number(details.grandTotal).toFixed(2)}` : 'N/A'}
    </Typography>
  );

  const renderSegments = (it) => (
    <>
      <Typography variant="body2" sx={{ mt: 1 }}>
        Segments ({it.segments.length}), Stops: {it.stops}
      </Typography>
      {it.segments.map((s, i) => (
        <Box key={i} sx={{ pl: 1, borderLeft: '2px solid #eee', my: 0.5 }}>
          <Typography variant="body2">
            {s.departure.iataCode} {dayjs(s.departure.at).format('MMM D, HH:mm')} → {s.arrival.iataCode} {dayjs(s.arrival.at).format('MMM D, HH:mm')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {s.marketingCarrier} {s.flightNumber} • Duration {s.duration}
          </Typography>
        </Box>
      ))}
      {it.layovers?.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          Layovers: {it.layovers.map((l) => `${l.airport} (${dayjs(l.from).format('HH:mm')}→${dayjs(l.to).format('HH:mm')})`).join(', ')}
        </Typography>
      )}
    </>
  );

  return (
    <Box>
      {priceLine}
      {out && (
        <Box>
          <Typography variant="subtitle2">Outbound</Typography>
          {renderSegments(out)}
        </Box>
      )}
      <Divider sx={{ my: 1 }} />
      {ret && (
        <Box>
          <Typography variant="subtitle2">Return</Typography>
          {renderSegments(ret)}
        </Box>
      )}
    </Box>
  );
}

function FlightSearch({ onAddWatch }) {
  const [depart, setDepart] = useState(dayjs().add(30, 'day').format('YYYY-MM-DD'));
  const [ret, setRet] = useState(dayjs().add(44, 'day').format('YYYY-MM-DD'));
  const [destination, setDestination] = useState({ code: 'DXB', label: 'DXB — Dubai' });
  const [destOptions, setDestOptions] = useState([]);
  const [destLoading, setDestLoading] = useState(false);
  const [destQuery, setDestQuery] = useState('');
  const destCacheRef = useRef(new Map());
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(false);
  const [airlineQuery, setAirlineQuery] = useState('');
  const [airlineOptions, setAirlineOptions] = useState([]);
  const [airline, setAirline] = useState(null);
  const [airlineLoading, setAirlineLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const destCode = (destination?.code || (destQuery && destQuery.trim().toUpperCase())) || '';
      if (!destCode) {
        alert('Please type a destination (city or airport code)');
        setLoading(false);
        return;
      }
      const airlineCode = (airline?.code || (airlineQuery && airlineQuery.trim().toUpperCase())) || '';
      const params = { origin: 'CLT', destination: destCode, depart, return: ret };
      if (airlineCode) params.airline = airlineCode;
      const { data } = await axios.get(`${API_BASE}/flights/search`, { params });
      setGrouped(data.grouped || {});
    } catch (e) {
      console.error(e);
      alert('Failed to search prices');
    } finally {
      setLoading(false);
    }
  };

  const fetchDestinations = async (q) => {
    if (!q || q.length < 3) {
      setDestOptions([]);
      return;
    }
    // Cache hit
    const cached = destCacheRef.current.get(q.toLowerCase());
    if (cached) {
      setDestOptions(cached);
      return;
    }
    setDestLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/flights/locations`, { params: { q } });
      const options = data.map((d) => ({
        code: d.iataCode,
        label: `${d.iataCode} — ${d.name}${d.address?.cityName ? ', ' + d.address.cityName : ''}`,
        raw: d,
      }));
      setDestOptions(options);
      destCacheRef.current.set(q.toLowerCase(), options);
    } catch (e) {
      // Swallow rate limit errors and keep current options
      console.warn('Destination lookup error:', e?.response?.status || e?.message);
    } finally {
      setDestLoading(false);
    }
  };

  const fetchAirlines = async (q) => {
    const code = (q || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (!code || code.length < 2) {
      setAirlineOptions([]);
      return;
    }
    setAirlineLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/flights/airlines`, { params: { q: code } });
      setAirlineOptions(data.map((a) => ({ code: a.code, label: `${a.code} — ${a.name || ''}` })));
    } catch (e) {
      console.warn('Airlines lookup error:', e?.response?.status || e?.message);
    } finally {
      setAirlineLoading(false);
    }
  };

  // Debounce destination lookups
  useEffect(() => {
    if (!destQuery || destQuery.length < 3) {
      setDestOptions([]);
      return;
    }
    const id = setTimeout(() => {
      fetchDestinations(destQuery);
    }, 500);
    return () => clearTimeout(id);
  }, [destQuery]);

  useEffect(() => {
    if (!airlineQuery || airlineQuery.length < 2) {
      setAirlineOptions([]);
      return;
    }
    const id = setTimeout(() => fetchAirlines(airlineQuery), 400);
    return () => clearTimeout(id);
  }, [airlineQuery]);

  const confirmAndWatch = async (offer) => {
    try {
      const { data } = await axios.post(`${API_BASE}/flights/price-confirm`, { offer: offer.rawOffer });
      const details = {
        ...offer.details,
        base: data.base,
        taxes: data.taxes,
        grandTotal: data.grandTotal,
      };
      const destCode = (destination?.code || (destQuery && destQuery.trim().toUpperCase())) || 'DEST';
      await onAddWatch({
        airline: offer.airline,
        flightNumber: `${offer.code} CLT-${destCode}`,
        origin: 'CLT',
        destination: destCode,
        departDate: offer.departDate,
        returnDate: offer.returnDate,
        price: Math.round(Number(data.grandTotal || offer.price || 0)),
        currency: data.currency || offer.currency || 'USD',
        details,
        amadeusOfferId: data?.offer?.id || data?.offer?._uid || null,
        amadeusOffer: data?.offer || null,
      });
    } catch (e) {
      console.error(e);
      alert('Failed to confirm price');
    }
  };

  useEffect(() => {
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = Object.entries(grouped);

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6">Search CLT ⇄ Destination Roundtrip</Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={4}>
            <TextField
              label="Depart"
              type="date"
              value={depart}
              onChange={(e) => setDepart(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Return"
              type="date"
              value={ret}
              onChange={(e) => setRet(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Autocomplete
              fullWidth
              options={destOptions}
              value={destination}
              loading={destLoading}
              freeSolo
              inputValue={destQuery}
              onChange={(_e, val) => setDestination(val)}
              onInputChange={(_e, val) => setDestQuery(val)}
              getOptionLabel={(opt) => opt?.label || ''}
              renderInput={(params) => <TextField {...params} label="Destination (City or Airport)" placeholder="Type e.g. Dubai or DXB" />}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Autocomplete
              fullWidth
              options={airlineOptions}
              value={airline}
              loading={airlineLoading}
              freeSolo
              inputValue={airlineQuery}
              onChange={(_e, val) => setAirline(val)}
              onInputChange={(_e, val) => setAirlineQuery(val)}
              getOptionLabel={(opt) => opt?.label || ''}
              renderInput={(params) => <TextField {...params} label="Airline code (optional)" placeholder="Type e.g. EK, QR, AA" />}
            />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={handleSearch} disabled={loading} startIcon={<RefreshIcon />}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </Stack>

        <Grid container spacing={2} sx={{ mt: 2 }}>
          {groups.map(([code, offers]) => (
            <Grid item xs={12} key={code}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>{`${code} — ${offers?.[0]?.airline || code}`}</Typography>
              <Grid container spacing={2}>
                {offers.map((r, idx) => (
                  <Grid item xs={12} md={6} key={`${code}-${idx}`}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="h6">{r.price ? `$${r.price}` : 'N/A'} {r.currency || ''}</Typography>
                          <Chip size="small" label={`${r.code} — ${r.airline}`} />
                        </Stack>
                        <ItineraryDetails offer={r} />
                      </CardContent>
                      <CardActions>
                        <Button size="small" onClick={() => confirmAndWatch({ ...r, rawOffer: r.raw })}>Confirm & Watch</Button>
                        <Button
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => {
                            const destCode = (destination?.code || (destQuery && destQuery.trim().toUpperCase())) || 'DEST';
                            onAddWatch({
                              airline: r.airline,
                              flightNumber: `${r.code} CLT-${destCode}`,
                              origin: 'CLT',
                              destination: destCode,
                              departDate: depart,
                              returnDate: ret,
                              price: r.price ?? 0,
                              currency: r.currency || 'USD',
                              details: r.details || null,
                              amadeusOfferId: r.offerId || r.raw?.id || null,
                              amadeusOffer: r.raw || null,
                            })
                          }}
                        >
                          Watch
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
}

function HistorySparkline({ data }) {
  const chartData = useMemo(
    () => data.map((d) => ({ x: dayjs(d.fetched_at).format('MM/DD'), y: Number(d.price) })),
    [data]
  );
  return (
    <Box sx={{ width: '100%', height: 120 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" hide />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip formatter={(v) => `$${v}`} labelFormatter={(l) => `Date: ${l}`} />
          <Line type="monotone" dataKey="y" stroke="#1976d2" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

function Watchlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await axios.get(`${API_BASE}/watchlist`);
    setItems(data);
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/watchlist/refresh`);
      await load();
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id) => {
    await axios.delete(`${API_BASE}/watchlist/${id}`);
    await load();
  };

  const addWatch = async (payload) => {
    await axios.post(`${API_BASE}/watchlist`, payload);
    await load();
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <FlightSearch onAddWatch={addWatch} />
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Watched Flights</Typography>
            <Button startIcon={<RefreshIcon />} onClick={refreshAll} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh prices'}
            </Button>
          </Stack>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {items.map((item) => {
              const isCheapest = item.last_price != null && item.min_price != null && Number(item.last_price) <= Number(item.min_price);
              const color = isCheapest ? 'success.main' : 'error.main';
              return (
                <Grid item xs={12} key={item.id}>
                  <Card variant="outlined">
                    <CardContent>
                      <Grid container spacing={2} alignItems="flex-start">
                        <Grid item xs={12} md={3}>
                          <Typography variant="subtitle2">{`${(item.flight_number || '').split(' ')[0]} — ${item.airline}`}</Typography>
                          <Typography variant="body2">{item.flight_number}</Typography>
                          <Typography variant="body2">
                            {item.origin} → {item.destination}
                          </Typography>
                          <Typography variant="body2">
                            {dayjs(item.depart_date).format('MMM D, YYYY')} - {dayjs(item.return_date).format('MMM D, YYYY')}
                          </Typography>
                          <Typography variant="h5" sx={{ color, mt: 1 }}>${item.last_price ?? '-'}</Typography>
                          <Typography variant="body2">Best: ${item.min_price ?? '-'}</Typography>
                        </Grid>
                        <Grid item xs={12} md={8}>
                          <ItineraryDetails offer={{ details: item.details }} />
                          <Box sx={{ mt: 1 }}>
                            <HistoryLoader id={item.id} />
                          </Box>
                        </Grid>
                        <Grid item xs={12} md={1}>
                          <IconButton color="error" onClick={() => remove(item.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </CardContent>
      </Card>
    </>
  );
}

function HistoryLoader({ id }) {
  const [history, setHistory] = useState([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await axios.get(`${API_BASE}/watchlist/${id}/history`);
      if (active) setHistory(data);
    })();
    return () => {
      active = false;
    };
  }, [id]);
  return <HistorySparkline data={history} />;
}

export default function App() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Flight Price Watcher
      </Typography>
      <Watchlist />
    </Container>
  );
}
