# DIY ChatGPT

A self-hosted, full-stack chat application supporting multiple AI backends (OpenAI-compatible and Anthropic). Built with Node.js, Express, SQLite, and vanilla HTML/CSS/JS — no frontend frameworks, no AI SDKs.

![DIY ChatGPT](https://img.shields.io/badge/Node.js-20+-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- 🤖 **Multiple AI backends** — OpenAI, Anthropic Claude, or any OpenAI-compatible API (Ollama, LM Studio, etc.)
- 🔧 **Tool use / Function calling** — Web search, web fetch, datetime, todos, calendar
- 📁 **File uploads** — Text files, PDFs, images (with vision support)
- 💬 **Projects** — Organize conversations with custom system prompts and per-project tool settings
- �� **API key encryption** — Keys stored encrypted with AES-256-CBC
- 🌊 **Real-time streaming** — Server-sent events for live response streaming
- 🗄️ **SQLite database** — Zero-config local persistence

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your settings
```

Key variables:
- `PORT` — Server port (default: 3000)
- `ENCRYPTION_KEY` — Key for encrypting stored API keys (use a long random string in production)
- `TAVILY_API_KEY` — Optional: for web search tool ([get one free](https://tavily.com))
- `SEARXNG_BASE_URL` — Optional: self-hosted SearXNG instance for web search

### 3. Start the server

```bash
node server.js
# or for development with auto-reload:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Adding AI Backends

1. Click **⚙ Settings** in the bottom-left
2. Fill in:
   - **Name**: Friendly label (e.g. "My OpenAI")
   - **Provider Type**: `OpenAI-compatible` or `Anthropic`
   - **Base URL**: API endpoint (e.g. `https://api.openai.com`)
   - **API Key**: Your key (stored encrypted)
3. Click **Add Backend**
4. Optionally click **Fetch Models** to auto-populate the model list

### Examples

| Provider | Base URL | Notes |
|---|---|---|
| OpenAI | `https://api.openai.com` | Standard |
| Anthropic | `https://api.anthropic.com` | Select `Anthropic` type |
| Ollama | `http://localhost:11434` | No API key needed |
| LM Studio | `http://localhost:1234` | OpenAI-compatible |
| Azure OpenAI | `https://<resource>.openai.azure.com/openai/deployments/<deployment>` | OpenAI-compatible |

## Architecture

```
server.js              # Express entry point
src/
  db.js                # SQLite database (better-sqlite3)
  crypto.js            # AES-256-CBC encryption for API keys
  fileProcessor.js     # File upload processing (text, PDF, images)
  providers/
    openai.js          # OpenAI streaming via raw https module
    anthropic.js       # Anthropic streaming via raw https module
  tools/
    index.js           # Tool registry and executor
    datetime.js        # Current date/time
    search.js          # Web search (Tavily/SearXNG)
    fetch.js           # Web page fetcher
    todo.js            # Todo CRUD
    calendar.js        # Calendar event CRUD
  routes/
    chat.js            # POST /api/chat — streaming SSE endpoint
    backends.js        # CRUD /api/backends
    projects.js        # CRUD /api/projects
    conversations.js   # CRUD /api/conversations
    upload.js          # POST /api/upload
public/
  index.html           # Single page app
  css/style.css        # Dark theme CSS
  js/
    app.js             # State management & init
    chat.js            # Chat UI & SSE streaming
    conversations.js   # Conversation list
    projects.js        # Project management
    settings.js        # Backend settings
    markdown.js        # Hand-rolled markdown renderer
```

## API Reference

### Chat
- `POST /api/chat` — Stream a chat response (SSE)

### Backends
- `GET /api/backends` — List all backends
- `POST /api/backends` — Create backend
- `PUT /api/backends/:id` — Update backend
- `DELETE /api/backends/:id` — Delete backend
- `POST /api/backends/:id/test` — Test connection
- `GET /api/backends/:id/models` — Fetch available models

### Projects
- `GET /api/projects` — List projects
- `POST /api/projects` — Create project
- `PUT /api/projects/:id` — Update project
- `DELETE /api/projects/:id` — Delete project

### Conversations
- `GET /api/conversations?projectId=...` — List conversations
- `POST /api/conversations` — Create conversation
- `PUT /api/conversations/:id` — Update (rename, override model)
- `DELETE /api/conversations/:id` — Delete
- `GET /api/conversations/:id/messages` — Get messages

### Upload
- `POST /api/upload` — Upload a file (multipart/form-data, field: `file`)

## Docker

```bash
# Start with Docker Compose
docker-compose up -d

# With optional SearXNG for web search
docker-compose --profile search up -d
```

Or build manually:

```bash
docker build -t diy-chatgpt .
docker run -p 3000:3000 \
  -e ENCRYPTION_KEY=your-secret-key \
  -e TAVILY_API_KEY=your-tavily-key \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  diy-chatgpt
```

## Tools

The following tools can be enabled per-project:

| Tool | Description |
|---|---|
| `get_datetime` | Returns current date/time |
| `web_search` | Search the web (requires Tavily or SearXNG) |
| `web_fetch` | Fetch and extract text from a URL |
| `todo_list` | List all todos |
| `todo_create` | Create a new todo |
| `todo_update` | Update a todo (mark done, etc.) |
| `todo_delete` | Delete a todo |
| `calendar_list` | List calendar events |
| `calendar_create` | Create a calendar event |
| `calendar_update` | Update a calendar event |
| `calendar_delete` | Delete a calendar event |

## License

MIT
