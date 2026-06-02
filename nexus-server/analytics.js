const { BetaAnalyticsDataClient } = require('@google-analytics/data');

async function getPortfolioVisitors() {
  const clientEmail = process.env.GA_CLIENT_EMAIL;
  const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const propertyId = process.env.GA_PROPERTY_ID || '506959180';

  if (!clientEmail || !privateKey) throw new Error('GA credentials not configured');

  const client = new BetaAnalyticsDataClient({
    credentials: { client_email: clientEmail, private_key: privateKey },
  });

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
    metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
  });

  const row = response.rows?.[0]?.metricValues;
  return {
    totalUsers: parseInt(row?.[0]?.value || '0'),
    sessions: parseInt(row?.[1]?.value || '0'),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getPortfolioVisitors };
