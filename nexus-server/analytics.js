const { google } = require('googleapis');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://santhosh-job-tracker.onrender.com/auth/callback'
  );
}

function getAuthUrl() {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
}

async function getPortfolioVisitors(refreshToken) {
  if (!refreshToken) throw new Error('No refresh token — visit /auth/google to authorize');

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });

  const response = await analyticsData.properties.runReport({
    property: `properties/506959180`,
    requestBody: {
      dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
      metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
    },
  });

  const row = response.data.rows?.[0]?.metricValues;
  return {
    totalUsers: parseInt(row?.[0]?.value || '0'),
    sessions: parseInt(row?.[1]?.value || '0'),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getAuthUrl, getOAuthClient, getPortfolioVisitors };
