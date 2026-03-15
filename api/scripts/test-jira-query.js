/**
 * Test the same Jira JQL request the backend uses (external Jira).
 * Run from api folder: node scripts/test-jira-query.js
 * Requires .env: EXTERNAL_ATLASSIAN_BASE_URL, EXTERNAL_JIRA_EMAIL, EXTERNAL_JIRA_API_TOKEN.
 * EXTERNAL_MY_ACCOUNT_ID is optional; without it we use currentUser() (works with email+token).
 */
require('dotenv').config();
const https = require('https');

const baseURL = process.env.EXTERNAL_ATLASSIAN_BASE_URL || '';
const email = process.env.EXTERNAL_JIRA_EMAIL || '';
const apiToken = process.env.EXTERNAL_JIRA_API_TOKEN || '';
const myAccountId = process.env.EXTERNAL_MY_ACCOUNT_ID || '';

if (!baseURL || !email || !apiToken) {
  console.error('Missing .env: need EXTERNAL_ATLASSIAN_BASE_URL, EXTERNAL_JIRA_EMAIL, EXTERNAL_JIRA_API_TOKEN');
  process.exit(1);
}

const useCurrentUser = !myAccountId;
const jqlClause = useCurrentUser ? 'assignee = currentUser()' : `assignee = "${myAccountId}"`;
const jql = `${jqlClause} AND status != "Closed" ORDER BY updated DESC`;
const path = (new URL(baseURL).pathname || '') + '/rest/api/3/search?jql=' + encodeURIComponent(jql) + '&fields=summary,project,status,assignee,issuetype&maxResults=100';

const url = new URL(baseURL);
const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

console.log('Base URL:', baseURL);
console.log('JQL:', jql);
console.log('Request: GET', path);
console.log('');

const options = {
  hostname: url.hostname,
  port: url.port || 443,
  path: path,
  method: 'GET',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json',
  },
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (ch) => { body += ch; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const data = JSON.parse(body);
      const issues = data.issues || data.values || [];
      console.log('Total from Jira:', data.total ?? issues.length);
      console.log('Issues in response:', issues.length);
      if (issues.length > 0) {
        console.log('First issue key:', issues[0].key);
      }
      console.log('');
      console.log('Full response (truncated):', JSON.stringify(data, null, 2).slice(0, 1500));
    } catch (e) {
      console.log('Body:', body.slice(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
  process.exit(1);
});

req.end();
