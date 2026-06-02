const axios = require('axios');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'https://santhosh-job-tracker.onrender.com/auth/callback';
const PROPERTY_ID = '506959180';

function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  return res.data; // { access_token, refresh_token, ... }
}

async function getAccessToken(refreshToken) {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  return res.data.access_token;
}

async function getPortfolioVisitors(refreshToken) {
  if (!refreshToken) throw new Error('No refresh token — visit /auth/google to authorize');

  const accessToken = await getAccessToken(refreshToken);

  const res = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`,
    {
      dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
      metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const row = res.data.rows?.[0]?.metricValues;
  return {
    totalUsers: parseInt(row?.[0]?.value || '0'),
    sessions: parseInt(row?.[1]?.value || '0'),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getAuthUrl, exchangeCode, getPortfolioVisitors };
