'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

const MAX_FETCH_CHARS = 5000;
module.exports = {
  name: 'web_fetch',
  description: 'Fetch the content of a web page and return it as plain text.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
    },
    required: ['url'],
  },
  execute({ url }) {
    return fetchUrl(url);
  },
};

function fetchUrl(urlStr, redirectCount = 0) {
  if (redirectCount > 5) return Promise.resolve('Error: too many redirects');

  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return resolve(`Error: invalid URL: ${urlStr}`);
    }

    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DIYChatGPT/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
    }, (res) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, urlStr).toString();
        resolve(fetchUrl(redirectUrl, redirectCount + 1));
        res.resume();
        return;
      }

      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        // Remove script and style blocks (including with whitespace in closing tags)
        let text = data.replace(/<script[\s\S]*?<\/\s*script[^>]*>/gi, ' ');
        text = text.replace(/<style[\s\S]*?<\/\s*style[^>]*>/gi, ' ');
        // Strip all remaining HTML tags
        text = text.replace(/<[^>]*>/g, ' ');
        // Decode common HTML entities (in a single pass to avoid double-decoding)
        text = text
          .replace(/&nbsp;/gi, ' ')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
          .replace(/&amp;/gi, '&'); // must be last
        // Collapse whitespace
        text = text.replace(/\s{2,}/g, ' ').trim();

        if (text.length > MAX_FETCH_CHARS) text = text.slice(0, MAX_FETCH_CHARS) + '... [truncated]';
        resolve(text);
      });
    });
    req.on('error', (e) => resolve(`Error fetching URL: ${e.message}`));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve('Error: request timed out');
    });
    req.end();
  });
}
