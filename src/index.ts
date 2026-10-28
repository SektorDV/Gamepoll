import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { config } from 'dotenv';
import { createDatabase } from './database.js';
import { BGGAPIClient } from './bgg-api.js';
import { CollectionSync } from './collection-sync.js';
import { createCommands, Command } from './commands.js';
import { extractBGGUsernames } from './utils.js';

config();

const REQUIRED_ENV_VARS = [
  'DISCORD_TOKEN',
  'DISCORD_APP_ID',
  'BGG_API_TOKEN',
  'COLLECTION_CHANNEL_ID',
];

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const DATABASE_PATH = process.env.DATABASE_PATH || './data/gamepoll.db';
const COLLECTION_CHANNEL_ID = process.env.COLLECTION_CHANNEL_ID!;

async function main() {
  const db = await createDatabase(DATABASE_PATH);
  const bggClient = new BGGAPIClient(process.env.BGG_API_TOKEN!);
  const sync = new CollectionSync(db, bggClient);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const commands = new Collection<string, Command>();
  const commandList = createCommands(db, bggClient, sync);
  
  for (const command of commandList) {
    commands.set(command.data.name, command);
  }

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}`);
    console.log(`👀 Watching channel: ${COLLECTION_CHANNEL_ID}`);

    const users = db.getUsers();
    console.log(`📚 Tracking ${users.length} BGG users`);

    sync.syncAll(false).catch(error => {
      console.error('Background sync failed:', error);
    });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);

      if (!command) {
        console.error(`Unknown command: ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error('Error executing command:', error);
        
        const errorMessage = '❌ There was an error executing this command!';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    } else if (interaction.isAutocomplete()) {
      const command = commands.get(interaction.commandName);

      if (!command || !command.autocomplete) {
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error('Error handling autocomplete:', error);
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (message.channelId !== COLLECTION_CHANNEL_ID) return;

    const usernames = extractBGGUsernames(message.content);
    
    if (usernames.length === 0) return;

    console.log(`Found BGG usernames in message: ${usernames.join(', ')}`);

    for (const username of usernames) {
      try {
        db.addUser(username);
        await message.react('✅');
        
        sync.syncUser(username, true).catch(error => {
          console.error(`Failed to sync ${username}:`, error);
        });
      } catch (error) {
        console.error(`Failed to add user ${username}:`, error);
        await message.react('❌');
      }
    }
  });

  client.on(Events.Error, (error) => {
    console.error('Discord client error:', error);
  });

  process.on('SIGINT', () => {
    console.log('Shutting down...');
    db.close();
    client.destroy();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Shutting down...');
    db.close();
    client.destroy();
    process.exit(0);
  });

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
