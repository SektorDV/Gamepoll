# Gamepoll - Discord Board Game Bot

A Discord bot for managing and polling your board game group's collection using BoardGameGeek data.

## Features

- 🎲 Automatically tracks BGG collection links posted in a designated channel
- 📚 Fetches and caches game details from BoardGameGeek XML API2
- 🔍 Smart filtering by player count, playtime, complexity, categories, and mechanics
- 📊 Creates native Discord polls with matching games
- 👥 Tracks which group members own each game
- 💾 SQLite database with daily cache refresh

## Commands

### `/collection add <username>`
Add a BoardGameGeek username to track. Automatically syncs their collection.

### `/collection remove <username>`
Remove a BGG username from tracking.

### `/collection list`
List all tracked BGG usernames.

### `/refresh [username]`
Force refresh collections from BGG. Refresh a specific user or all users.

### `/poll [options]`
Create a poll of games to play. Supports extensive filtering:
- `players` - Exact player count (e.g., 4)
- `bestat` - Best at this player count (uses BGG community votes)
- `mintime` / `maxtime` - Playing time in minutes
- `minweight` / `maxweight` - Complexity rating (1-5)
- `category` - Game category (autocomplete)
- `mechanic` - Game mechanic (autocomplete)
- `owner` - Filter by owner username
- `options` - Number of poll options (2-10, default: 5)
- `duration` - Poll duration in hours (1-168, default: 24)
- `randomize` - Randomize selection (default: true)

### `/games [options]`
Browse the group's game library with the same filters as `/poll` (except poll-specific options).

## Automatic Link Detection

Post a BGG collection link in the configured channel and the bot will automatically add that user:
```
https://boardgamegeek.com/collection/user/username
```

Works with query parameters too:
```
https://boardgamegeek.com/collection/user/username?own=1&subtype=boardgame
```

## Setup

### Prerequisites

- Node.js 18+
- A Discord bot token
- A BoardGameGeek API token
- Discord Application ID and Public Key

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_APP_ID=1559173131107827793
DISCORD_PUBLIC_KEY=098b5609176fafc641fc027dad115da9e8a0ae07cc6bff585d905954797d43b4
BGG_API_TOKEN=your_bgg_api_token_here
COLLECTION_CHANNEL_ID=your_channel_id_here
GUILD_ID=your_guild_id_for_testing
DATABASE_PATH=./data/gamepoll.db
```

### Discord Bot Setup

1. Go to https://discord.com/developers/applications
2. Create a new application or use Application ID `1559173131107827793`
3. Go to the "Bot" section and copy your token
4. Enable the "Message Content Intent" under Privileged Gateway Intents
5. Invite the bot to your server using this URL (replace `YOUR_APP_ID`):

```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&permissions=274877992960&scope=bot%20applications.commands
```

**Required Bot Permissions:**
- Read Messages/View Channels
- Send Messages
- Create Public Threads
- Send Messages in Threads
- Embed Links
- Add Reactions
- Use Slash Commands

**Required Intents:**
- Guilds
- Guild Messages
- Message Content

### Local Development (Mac)

```bash
# Install dependencies
npm install

# Deploy slash commands
npm run deploy-commands

# Run in development mode with auto-reload
npm run dev

# Or build and run
npm run build
npm start
```

### Running with Docker

```bash
# Build the image
docker build -t gamepoll .

# Run with volume for persistence
docker run -d \
  --name gamepoll \
  --env-file .env \
  -v gamepoll-data:/app/data \
  gamepoll
```

### Deploy to Railway

1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Create a new project: `railway init`
4. Add environment variables:
   ```bash
   railway variables set DISCORD_TOKEN=your_token
   railway variables set DISCORD_APP_ID=1559173131107827793
   railway variables set DISCORD_PUBLIC_KEY=098b5609176fafc641fc027dad115da9e8a0ae07cc6bff585d905954797d43b4
   railway variables set BGG_API_TOKEN=your_bgg_token
   railway variables set COLLECTION_CHANNEL_ID=your_channel_id
   ```
5. Add a volume for SQLite persistence:
   - Go to your Railway project dashboard
   - Click "New" → "Volume"
   - Mount at `/app/data`
6. Deploy: `railway up`

**Railway Hobby Plan Notes:**
- Includes 500 hours/month ($5 credit)
- Bot should run well within the free tier
- Volume ensures data persists across deploys

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage
```

Tests cover:
- BGG URL parsing
- BGG XML collection and game detail parsing
- Game filtering logic
- Random selection

## Data Credits

All game data is sourced from [BoardGameGeek](https://boardgamegeek.com/) via their XML API2.

## Architecture

- **Database**: SQLite with better-sqlite3 (synchronous, fast)
- **Discord**: discord.js v14 with gateway (not slash command HTTP)
- **BGG API**: XML API2 with 202 retry handling and batch requests
- **Caching**: Daily per-user refresh, manual `/refresh` override

## License

MIT
