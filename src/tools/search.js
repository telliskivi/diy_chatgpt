'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = {
  name: 'web_search',
  description: 'Search the web for information. Returns a list of results with title, url, and snippet.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      max_results: { type: 'number', description: 'Maximum number of results to return (default: 5)' },
    },
    required: ['query'],
  },
  async execute({ query, max_results = 5 }) {
    const tavilyKey = process.env.TAVILY_API_KEY;
    const searxngUrl = process.env.SEARXNG_BASE_URL;

    if (tavilyKey) {
      return searchTavily(query, max_results, tavilyKey);
    } else if (searxngUrl) {
      return searchSearXNG(query, max_results, searxngUrl);
    } else {
      // Mock results
      return JSON.stringify({
        results: [
          {
            title: `Search results for: ${query}`,
            url: 'https://example.com',
            snippet: 'No search API configured. Set TAVILY_API_KEY or SEARXNG_BASE_URL to enable web search.',
          },
        ],
        note: 'Configure TAVILY_API_KEY or SEARXNG_BASE_URL for real search results.',
      });
    }
  },
};

function searchTavily(query, max_results, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      api_key: apiKey,
      query,
      max_results,
      search_depth: 'basic',
    });

    const u = new URL('https://api.tavily.com/search');
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const results = (parsed.results || []).map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.content || r.snippet || '',
          }));
          resolve(JSON.stringify({ results }));
        } catch (e) {
          resolve(JSON.stringify({ error: 'Failed to parse Tavily response', raw: data }));
        }
      });
    });
    req.on('error', (e) => resolve(JSON.stringify({ error: e.message })));
    req.write(body);
    req.end();
  });
}

function searchSearXNG(query, max_results, baseUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL('/search', baseUrl);
    u.searchParams.set('q', query);
    u.searchParams.set('format', 'json');
    u.searchParams.set('count', String(max_results));

    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const results = (parsed.results || []).slice(0, max_results).map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.content || '',
          }));
          resolve(JSON.stringify({ results }));
        } catch (e) {
          resolve(JSON.stringify({ error: 'Failed to parse SearXNG response' }));
        }
      });
    });
    req.on('error', (e) => resolve(JSON.stringify({ error: e.message })));
    req.end();
  });
}
