const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

let pool;

async function createDatabaseIfNotExists() {
	const connection = await mysql.createConnection({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASSWORD,
		port: Number(process.env.DB_PORT || 3306),
		multipleStatements: true,
	});
	try {
		await connection.query(
			`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
		);
	} finally {
		await connection.end();
	}
}

const getPool = () => {
	if (!pool) {
		pool = mysql.createPool({
			host: process.env.DB_HOST,
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
			port: Number(process.env.DB_PORT || 3306),
			database: process.env.DB_NAME,
			waitForConnections: true,
			connectionLimit: 10,
			queueLimit: 0,
		});
	}
	return pool;
};

const ensureDatabaseInitialized = async () => {
	await createDatabaseIfNotExists();
	const pool = getPool();

	const createWatchedFlightsTable = `
		CREATE TABLE IF NOT EXISTS watched_flights (
			id INT AUTO_INCREMENT PRIMARY KEY,
			airline VARCHAR(50) NOT NULL,
			flight_number VARCHAR(100) NOT NULL,
			origin VARCHAR(10) NOT NULL,
			destination VARCHAR(10) NOT NULL,
			depart_date DATE NOT NULL,
			return_date DATE NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
	`;

	const createPriceHistoryTable = `
		CREATE TABLE IF NOT EXISTS price_history (
			id INT AUTO_INCREMENT PRIMARY KEY,
			watched_flight_id INT NOT NULL,
			price DECIMAL(10,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_wf (watched_flight_id),
			CONSTRAINT fk_price_wf FOREIGN KEY (watched_flight_id)
				REFERENCES watched_flights(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
	`;

	const connection = await pool.getConnection();
	try {
		await connection.query(createWatchedFlightsTable);
		await connection.query(createPriceHistoryTable);
		// Ensure columns/indexes
		const [cols] = await connection.query(
			`SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = 'watched_flights'`,
			[process.env.DB_NAME]
		);
		const columnNames = new Set(cols.map((c) => c.COLUMN_NAME));
		if (!columnNames.has('details')) {
			try { await connection.query(`ALTER TABLE watched_flights ADD COLUMN details JSON NULL`); } catch {}
		}
		if (!columnNames.has('amadeus_offer_id')) {
			try { await connection.query(`ALTER TABLE watched_flights ADD COLUMN amadeus_offer_id VARCHAR(128) NULL`); } catch {}
		}
		if (!columnNames.has('amadeus_offer')) {
			try { await connection.query(`ALTER TABLE watched_flights ADD COLUMN amadeus_offer JSON NULL`); } catch {}
		}
		if (!columnNames.has('amadeus_offer_uid')) {
			try { await connection.query(`ALTER TABLE watched_flights ADD COLUMN amadeus_offer_uid VARCHAR(255) NULL`); } catch {}
		}
		// Drop legacy unique key if present to allow multiple offers for same airline/dates
		const [legacyIdx] = await connection.query(
			`SELECT INDEX_NAME FROM information_schema.statistics WHERE table_schema = ? AND table_name = 'watched_flights' AND index_name = 'uniq_flight'`,
			[process.env.DB_NAME]
		);
		if (legacyIdx.length > 0) {
			try { await connection.query(`ALTER TABLE watched_flights DROP INDEX uniq_flight`); } catch {}
		}
		// Drop unique index on amadeus_offer_id if exists
		const [oldUnique] = await connection.query(
			`SELECT INDEX_NAME FROM information_schema.statistics WHERE table_schema = ? AND table_name = 'watched_flights' AND index_name = 'uniq_amadeus_offer_id'`,
			[process.env.DB_NAME]
		);
		if (oldUnique.length > 0) {
			try { await connection.query(`DROP INDEX uniq_amadeus_offer_id ON watched_flights`); } catch {}
		}
		// Ensure unique index on amadeus_offer_uid
		const [uidIdx] = await connection.query(
			`SELECT INDEX_NAME FROM information_schema.statistics WHERE table_schema = ? AND table_name = 'watched_flights' AND index_name = 'uniq_amadeus_offer_uid'`,
			[process.env.DB_NAME]
		);
		if (uidIdx.length === 0) {
			try { await connection.query(`CREATE UNIQUE INDEX uniq_amadeus_offer_uid ON watched_flights (amadeus_offer_uid)`); } catch {}
		}
	} finally {
		connection.release();
	}
};

module.exports = { getPool, ensureDatabaseInitialized }; 