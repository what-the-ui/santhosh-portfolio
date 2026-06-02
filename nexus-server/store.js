const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

const DEFAULT = {
  connections: [],
  jobs: [],
  settings: {
    frequency: '0 */6 * * *', // every 6 hours
    frequencyLabel: '6h',
    email: {
      enabled: false,
      address: '',
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
    },
  },
  lastScanAt: null,
  totalScans: 0,
};

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return { ...DEFAULT, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Store read error:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT));
}

function save(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Store write error:', e.message);
  }
}

module.exports = { load, save };
