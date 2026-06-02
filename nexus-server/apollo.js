const axios = require('axios');

const HIRING_TITLES = [
  'Head of Design', 'Director of Design', 'VP of Design', 'VP Design',
  'Associate Director of Design', 'Design Director', 'Chief Design Officer',
  'VP of Product Design', 'Director of Product Design', 'Head of Product Design',
];

async function findHiringManager(companyName) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY not set in environment variables');

  const response = await axios.post('https://api.apollo.io/api/v1/people/search', {
    api_key: apiKey,
    q_organization_name: companyName,
    person_titles: HIRING_TITLES,
    per_page: 1,
    page: 1,
  }, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    timeout: 10000,
  });

  const people = response.data?.people || [];
  if (people.length === 0) return null;

  const person = people[0];
  return {
    name: person.first_name || person.name?.split(' ')[0] || 'there',
    fullName: person.name || '',
    email: person.email,
    title: person.title || '',
  };
}

module.exports = { findHiringManager };
