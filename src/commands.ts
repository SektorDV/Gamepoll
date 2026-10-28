import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from 'discord.js';
import { GameDatabase } from './database.js';
import { BGGAPIClient } from './bgg-api.js';
import { CollectionSync } from './collection-sync.js';
import { filterGames, selectRandomGames, formatGameForDisplay, getAllCategories, getAllMechanics } from './utils.js';

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export function createCommands(
  db: GameDatabase,
  bggClient: BGGAPIClient,
  sync: CollectionSync
): Command[] {
  return [
    createCollectionCommand(db, sync),
    createRefreshCommand(db, sync),
    createPollCommand(db),
    createGamesCommand(db),
  ];
}

function createCollectionCommand(db: GameDatabase, sync: CollectionSync): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('collection')
      .setDescription('Manage BGG collection tracking')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add a BGG username to track')
          .addStringOption(option =>
            option
              .setName('username')
              .setDescription('BoardGameGeek username')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove a BGG username')
          .addStringOption(option =>
            option
              .setName('username')
              .setDescription('BoardGameGeek username')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('List all tracked BGG usernames')
      ) as SlashCommandBuilder,

    execute: async (interaction: ChatInputCommandInteraction) => {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'add') {
        const username = interaction.options.getString('username', true);
        
        await interaction.deferReply();

        try {
          db.addUser(username);
          await sync.syncUser(username, true);
          
          await interaction.editReply(`✅ Added **${username}** and synced their collection!`);
        } catch (error) {
          console.error('Error adding user:', error);
          await interaction.editReply(`❌ Failed to add **${username}**. Please check the username and try again.`);
        }
      } else if (subcommand === 'remove') {
        const username = interaction.options.getString('username', true);
        
        const removed = db.removeUser(username);
        
        if (removed) {
          await interaction.reply(`✅ Removed **${username}** from tracking.`);
        } else {
          await interaction.reply(`❌ **${username}** is not being tracked.`);
        }
      } else if (subcommand === 'list') {
        const users = db.getUsers();
        
        if (users.length === 0) {
          await interaction.reply('No BGG usernames are being tracked yet. Use `/collection add` to add one!');
          return;
        }

        const userList = users.map(u => `• ${u.bgg_username}`).join('\n');
        
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('📚 Tracked BGG Collections')
          .setDescription(userList)
          .setFooter({ text: `Tracking ${users.length} user${users.length === 1 ? '' : 's'}` });

        await interaction.reply({ embeds: [embed] });
      }
    },
  };
}

function createRefreshCommand(db: GameDatabase, sync: CollectionSync): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('refresh')
      .setDescription('Refresh collections from BGG')
      .addStringOption(option =>
        option
          .setName('username')
          .setDescription('Specific username to refresh (optional)')
          .setRequired(false)
      ) as SlashCommandBuilder,

    execute: async (interaction: ChatInputCommandInteraction) => {
      const username = interaction.options.getString('username');

      await interaction.deferReply();

      try {
        if (username) {
          await sync.syncUser(username, true);
          await interaction.editReply(`✅ Refreshed collection for **${username}**!`);
        } else {
          await sync.syncAll(true);
          await interaction.editReply('✅ Refreshed all collections!');
        }
      } catch (error) {
        console.error('Error refreshing:', error);
        await interaction.editReply('❌ Failed to refresh collections. Please try again.');
      }
    },
  };
}

function createPollCommand(db: GameDatabase): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('poll')
      .setDescription('Create a poll of games to play')
      .addIntegerOption(option =>
        option
          .setName('players')
          .setDescription('Exact player count')
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('bestat')
          .setDescription('Best at this player count')
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('mintime')
          .setDescription('Minimum playing time (minutes)')
          .setMinValue(1)
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('maxtime')
          .setDescription('Maximum playing time (minutes)')
          .setMinValue(1)
          .setRequired(false)
      )
      .addNumberOption(option =>
        option
          .setName('minweight')
          .setDescription('Minimum complexity (1-5)')
          .setMinValue(1)
          .setMaxValue(5)
          .setRequired(false)
      )
      .addNumberOption(option =>
        option
          .setName('maxweight')
          .setDescription('Maximum complexity (1-5)')
          .setMinValue(1)
          .setMaxValue(5)
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('category')
          .setDescription('Game category')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('mechanic')
          .setDescription('Game mechanic')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('owner')
          .setDescription('Filter by owner (username)')
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('options')
          .setDescription('Number of poll options (default: 5)')
          .setMinValue(2)
          .setMaxValue(10)
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('duration')
          .setDescription('Poll duration in hours (default: 24)')
          .setMinValue(1)
          .setMaxValue(168)
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('randomize')
          .setDescription('Randomize selection (default: true)')
          .setRequired(false)
      ) as SlashCommandBuilder,

    execute: async (interaction: ChatInputCommandInteraction) => {
      await interaction.deferReply();

      const filters = {
        players: interaction.options.getInteger('players') ?? undefined,
        bestAt: interaction.options.getInteger('bestat') ?? undefined,
        minTime: interaction.options.getInteger('mintime') ?? undefined,
        maxTime: interaction.options.getInteger('maxtime') ?? undefined,
        minWeight: interaction.options.getNumber('minweight') ?? undefined,
        maxWeight: interaction.options.getNumber('maxweight') ?? undefined,
        category: interaction.options.getString('category') ?? undefined,
        mechanic: interaction.options.getString('mechanic') ?? undefined,
        owners: interaction.options.getString('owner')?.split(',').map(s => s.trim()) ?? undefined,
      };

      const numOptions = interaction.options.getInteger('options') ?? 5;
      const randomize = interaction.options.getBoolean('randomize') ?? true;
      const durationHours = interaction.options.getInteger('duration') ?? 24;

      const allGames = db.getOwnedGames(false);
      const filtered = filterGames(allGames, filters);

      if (filtered.length === 0) {
        await interaction.editReply('❌ No games match those filters!');
        return;
      }

      const selected = randomize
        ? selectRandomGames(filtered, numOptions)
        : filtered.slice(0, numOptions);

      if (selected.length < 2) {
        await interaction.editReply('❌ Need at least 2 games for a poll!');
        return;
      }

      const pollAnswers = selected.map(game => {
        const displayName = game.name.length > 55 ? game.name.substring(0, 52) + '...' : game.name;
        return {
          text: displayName,
          emoji: undefined,
        };
      });

      try {
        if (!interaction.channel || !('send' in interaction.channel)) {
          await interaction.editReply('❌ Cannot create poll in this channel type.');
          return;
        }

        const message = await interaction.channel.send({
          poll: {
            question: { text: '🎲 What game should we play?' },
            answers: pollAnswers,
            duration: durationHours,
            allowMultiselect: false,
          },
        });

        const gameDetails = selected.map(game => 
          `• [${game.name}](https://boardgamegeek.com/boardgame/${game.bgg_id}) - ${formatGameForDisplay(game)}`
        ).join('\n');

        const embed = new EmbedBuilder()
          .setColor(0x00aa00)
          .setTitle('🎲 Game Poll Created!')
          .setDescription(gameDetails)
          .setFooter({ text: 'Data from BoardGameGeek' });

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Error creating poll:', error);
        await interaction.editReply('❌ Failed to create poll. Please try again.');
      }
    },

    autocomplete: async (interaction: AutocompleteInteraction) => {
      const focusedOption = interaction.options.getFocused(true);
      const allGames = db.getOwnedGames(false);

      if (focusedOption.name === 'category') {
        const categories = getAllCategories(allGames);
        const filtered = categories
          .filter(c => c.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25);

        await interaction.respond(
          filtered.map(c => ({ name: c, value: c }))
        );
      } else if (focusedOption.name === 'mechanic') {
        const mechanics = getAllMechanics(allGames);
        const filtered = mechanics
          .filter(m => m.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25);

        await interaction.respond(
          filtered.map(m => ({ name: m, value: m }))
        );
      }
    },
  };
}

function createGamesCommand(db: GameDatabase): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('games')
      .setDescription('Browse the group\'s game library')
      .addIntegerOption(option =>
        option
          .setName('players')
          .setDescription('Exact player count')
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('bestat')
          .setDescription('Best at this player count')
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('mintime')
          .setDescription('Minimum playing time (minutes)')
          .setMinValue(1)
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('maxtime')
          .setDescription('Maximum playing time (minutes)')
          .setMinValue(1)
          .setRequired(false)
      )
      .addNumberOption(option =>
        option
          .setName('minweight')
          .setDescription('Minimum complexity (1-5)')
          .setMinValue(1)
          .setMaxValue(5)
          .setRequired(false)
      )
      .addNumberOption(option =>
        option
          .setName('maxweight')
          .setDescription('Maximum complexity (1-5)')
          .setMinValue(1)
          .setMaxValue(5)
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('category')
          .setDescription('Game category')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('mechanic')
          .setDescription('Game mechanic')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('owner')
          .setDescription('Filter by owner (username)')
          .setRequired(false)
      ) as SlashCommandBuilder,

    execute: async (interaction: ChatInputCommandInteraction) => {
      await interaction.deferReply();

      const filters = {
        players: interaction.options.getInteger('players') ?? undefined,
        bestAt: interaction.options.getInteger('bestat') ?? undefined,
        minTime: interaction.options.getInteger('mintime') ?? undefined,
        maxTime: interaction.options.getInteger('maxtime') ?? undefined,
        minWeight: interaction.options.getNumber('minweight') ?? undefined,
        maxWeight: interaction.options.getNumber('maxweight') ?? undefined,
        category: interaction.options.getString('category') ?? undefined,
        mechanic: interaction.options.getString('mechanic') ?? undefined,
        owners: interaction.options.getString('owner')?.split(',').map(s => s.trim()) ?? undefined,
      };

      const allGames = db.getOwnedGames(false);
      const filtered = filterGames(allGames, filters);

      if (filtered.length === 0) {
        await interaction.editReply('❌ No games match those filters!');
        return;
      }

      const maxGamesPerEmbed = 10;
      const gamesToShow = filtered.slice(0, maxGamesPerEmbed);

      const gameList = gamesToShow.map(game => 
        `• [${game.name}](https://boardgamegeek.com/boardgame/${game.bgg_id}) - ${formatGameForDisplay(game)}`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('🎲 Group Game Library')
        .setDescription(gameList)
        .setFooter({ 
          text: filtered.length > maxGamesPerEmbed 
            ? `Showing ${maxGamesPerEmbed} of ${filtered.length} games • Data from BoardGameGeek`
            : `${filtered.length} game${filtered.length === 1 ? '' : 's'} • Data from BoardGameGeek`
        });

      await interaction.editReply({ embeds: [embed] });
    },

    autocomplete: async (interaction: AutocompleteInteraction) => {
      const focusedOption = interaction.options.getFocused(true);
      const allGames = db.getOwnedGames(false);

      if (focusedOption.name === 'category') {
        const categories = getAllCategories(allGames);
        const filtered = categories
          .filter(c => c.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25);

        await interaction.respond(
          filtered.map(c => ({ name: c, value: c }))
        );
      } else if (focusedOption.name === 'mechanic') {
        const mechanics = getAllMechanics(allGames);
        const filtered = mechanics
          .filter(m => m.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25);

        await interaction.respond(
          filtered.map(m => ({ name: m, value: m }))
        );
      }
    },
  };
}
