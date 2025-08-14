# Flight Price Watcher

A full-stack web application for tracking flight prices from Charlotte (CLT) to any destination worldwide. The app integrates with Amadeus API to fetch real-time flight offers, allows users to watch specific flights, and tracks price history over time.

## Features

- **Flight Search**: Search for roundtrip flights from CLT to any destination
- **Destination Autocomplete**: Type city names or airport codes with real-time suggestions
- **Airline Filtering**: Filter results by specific airline codes (e.g., EK, QR, AA)
- **Price Tracking**: Add flights to your watchlist and track price changes
- **Price History**: Visual charts showing price trends over time
- **Price Breakdown**: View base fare, taxes, and total for each offer
- **Price Confirmation**: Verify exact pricing before adding to watchlist
- **Smart Matching**: Uses Amadeus offer IDs to prevent duplicates and ensure accurate tracking

## Tech Stack

- **Backend**: Node.js, Express.js, MySQL
- **Frontend**: React, Material-UI, Recharts
- **API**: Amadeus Flight Offers Search API
- **Database**: MySQL with automatic schema creation

## Prerequisites

- Node.js 18+ 
- MySQL server running locally
- Amadeus API credentials (free test account available)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd airlines-prices-app
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies (concurrently)
   npm install
   
   # Install backend dependencies
   cd backend && npm install
   
   # Install frontend dependencies  
   cd ../frontend && npm install
   ```

3. **Set up environment variables**
   
   Create `backend/.env` file:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=flights_db
   DB_PORT=3306
   
   # Server Configuration
   EXPRESS_PORT=3101
   
   # Amadeus API Configuration
   AMADEUS_API_KEY=your_amadeus_api_key
   AMADEUS_API_SECRET=your_amadeus_api_secret
   AMADEUS_ENV=test
   ```

4. **Start the application**
   ```bash
   # From project root
   npm start
   ```

   This will start both servers:
   - Backend: http://localhost:3101
   - Frontend: http://localhost:3200

## Environment Variables

### Required

- `DB_HOST`: MySQL server hostname (default: localhost)
- `DB_USER`: MySQL username (default: root)
- `DB_PASSWORD`: MySQL password
- `DB_NAME`: Database name (default: flights_db)
- `DB_PORT`: MySQL port (default: 3306)
- `EXPRESS_PORT`: Backend server port (default: 3101)

### Optional

- `AMADEUS_API_KEY`: Your Amadeus API key
- `AMADEUS_API_SECRET`: Your Amadeus API secret
- `AMADEUS_ENV`: API environment - `test` (default) or `production`

## Getting Amadeus API Credentials

1. Visit [Amadeus for Developers](https://developers.amadeus.com/)
2. Create a free account
3. Create a new application to get API key and secret
4. Test environment is free with limited requests
5. Production requires approval and contract

## Database Setup

The application automatically creates the required database and tables on first run:

- `flights_db` database
- `watched_flights` table (stores watched flights with Amadeus offer IDs)
- `price_history` table (stores price history for each watched flight)

## Usage

### Searching Flights

1. **Set dates**: Choose departure and return dates (defaults to 30/44 days from today)
2. **Select destination**: Type a city name or airport code (e.g., "Dubai", "DXB", "London")
3. **Filter by airline** (optional): Type airline code (e.g., "EK", "QR", "AA")
4. **Click Search**: View up to 4 offers per airline, sorted by price

### Watching Flights

1. **Quick Watch**: Click "Watch" to add a flight with current pricing
2. **Confirm & Watch**: Click "Confirm & Watch" to verify exact pricing with Amadeus before adding
3. **View Watchlist**: See all watched flights with price history charts
4. **Refresh Prices**: Click "Refresh prices" to update all watched flights
5. **Remove**: Click the delete icon to remove from watchlist

### Price Tracking

- **Green price**: Current price is the lowest seen
- **Red price**: Price has been lower before
- **Mini charts**: Show price trends over time
- **Price breakdown**: Base fare, taxes, and total for each offer

## API Endpoints

### Backend (http://localhost:3101)

- `GET /api/health` - Health check
- `GET /api/flights/locations?q=query` - Search destinations
- `GET /api/flights/airlines?q=query` - Search airlines
- `GET /api/flights/search` - Search flight offers
- `POST /api/flights/price-confirm` - Confirm pricing for specific offer
- `GET /api/watchlist` - Get watched flights
- `POST /api/watchlist` - Add flight to watchlist
- `POST /api/watchlist/refresh` - Refresh all prices
- `DELETE /api/watchlist/:id` - Remove from watchlist
- `GET /api/watchlist/:id/history` - Get price history

## Development

### Project Structure

```
airlines-prices-app/
├── backend/
│   ├── integrations/     # Amadeus API integration
│   ├── routes/          # Express routes
│   ├── services/        # Business logic
│   ├── db.js           # Database connection
│   └── server.js       # Express server
├── frontend/
│   ├── src/
│   │   ├── App.jsx     # Main React component
│   │   └── main.jsx    # React entry point
│   └── index.html
└── package.json        # Root scripts
```

### Running in Development

```bash
# Start both servers with hot reload
npm start

# Or start individually
cd backend && npm run dev
cd frontend && npm run dev
```

### Building for Production

```bash
# Build frontend
cd frontend && npm run build

# Start production backend
cd backend && npm start
```

## Troubleshooting

### Common Issues

1. **Database connection failed**
   - Ensure MySQL is running
   - Check credentials in `.env`
   - Verify database user has CREATE privileges

2. **Amadeus API errors**
   - Check API credentials
   - Verify API key/secret are correct
   - Test environment has rate limits

3. **No flight results**
   - Try different dates (some routes have limited availability)
   - Check destination code is valid
   - Verify airline code if filtering

4. **Rate limit errors (429)**
   - App includes debouncing and caching
   - Wait a few minutes before retrying
   - Consider upgrading to production API

### Logs

- Backend logs show Amadeus API requests and responses
- Frontend console shows user interactions and errors
- Database queries are logged in development

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.
