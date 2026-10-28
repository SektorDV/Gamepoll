import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { createDatabase } from './database.js';
import { BGGAPIClient } from './bgg-api.js';
import { CollectionSync } from './collection-sync.js';
import { createCommands } from './commands.js';

config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!DISCORD_TOKEN || !DISCORD_APP_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_APP_ID');
  process.exit(1);
}

async function deployCommands() {
  if (!process.env.BGG_API_TOKEN) {
    console.error('Missing BGG_API_TOKEN');
    process.exit(1);
  }

  const DATABASE_PATH = process.env.DATABASE_PATH || './data/gamepoll.db';
  const db = await createDatabase(DATABASE_PATH);
  const bggClient = new BGGAPIClient(process.env.BGG_API_TOKEN);
  const sync = new CollectionSync(db, bggClient);

  const commands = createCommands(db, bggClient, sync);
  const commandData = commands.map(command => command.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);

  try {
    console.log(`Deploying ${commandData.length} application (/) commands...`);

    if (GUILD_ID) {
      console.log(`Deploying to guild: ${GUILD_ID}`);
      await rest.put(
        Routes.applicationGuildCommands(DISCORD_APP_ID!, GUILD_ID),
        { body: commandData }
      );
      console.log('✅ Guild commands deployed successfully!');
    } else {
      console.log('Deploying globally...');
      await rest.put(
        Routes.applicationCommands(DISCORD_APP_ID!),
        { body: commandData }
      );
      console.log('✅ Global commands deployed successfully! (May take up to 1 hour to propagate)');
    }
  } catch (error) {
    console.error('Error deploying commands:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

deployCommands();
