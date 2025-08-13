const { searchFlightOffersWithFlex, transformOfferToDetails } = require('../integrations/amadeus');

async function fetchAllPrices(params) {
	const hasAmadeus = Boolean(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET);

	if (hasAmadeus) {
		try {
			const { offers, carriers } = await searchFlightOffersWithFlex(params);

			const offersByCarrier = new Map();

			for (const offer of offers) {
				const details = transformOfferToDetails(offer);
				const carriersInOffer = new Set();
				for (const itinerary of offer.itineraries || []) {
					for (const segment of itinerary.segments || []) {
						if (segment.carrierCode) carriersInOffer.add(segment.carrierCode);
						if (segment.marketingCarrier) carriersInOffer.add(segment.marketingCarrier);
					}
				}
				for (const code of carriersInOffer) {
					if (!offersByCarrier.has(code)) offersByCarrier.set(code, []);
					offersByCarrier.get(code).push({
						airline: carriers?.[code] || code,
						code,
						price: details.price,
						currency: details.currency,
						details,
						raw: offer,
						offerUid: offer._uid || null,
						offerId: offer.id || null,
						departDate: params.departDate,
						returnDate: params.returnDate,
					});
				}
			}

			const results = [];
			for (const [code, list] of offersByCarrier.entries()) {
				const top5 = list.sort((a, b) => a.price - b.price).slice(0, 5);
				results.push(...top5);
			}
			if (results.length > 0) {
				return results.sort((a, b) => a.price - b.price);
			}
		} catch (error) {
			console.warn('Amadeus fetch failed:', error.message);
		}
	}

	return [];
}

module.exports = { fetchAllPrices }; 