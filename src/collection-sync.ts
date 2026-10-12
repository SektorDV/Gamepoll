import { BGGAPIClient } from './bgg-api.js';
import { GameDatabase } from './database.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class CollectionSync {
  constructor(
    private db: GameDatabase,
    private bggClient: BGGAPIClient
  ) {}

  async syncUser(bggUsername: string, force: boolean = false): Promise<void> {
    if (!force) {
      const lastFetched = this.db.getCacheTimestamp(bggUsername);
      if (lastFetched && Date.now() - lastFetched < ONE_DAY_MS) {
        console.log(`Skipping ${bggUsername}: synced within last 24 hours`);
        return;
      }
    }

    console.log(`Syncing collection for ${bggUsername}...`);

    const collection = await this.bggClient.fetchCollection(bggUsername);
    console.log(`Found ${collection.length} owned games for ${bggUsername}`);

    if (collection.length === 0) {
      this.db.setCacheTimestamp(bggUsername, Date.now());
      return;
    }

    const gameIds = collection.map(item => item.bggId);

    const existingGames = this.db.getGamesByBggIds(gameIds);
    const existingGameIds = new Set(existingGames.map(g => g.bgg_id));

    const newGameIds = gameIds.filter(id => !existingGameIds.has(id));

    if (newGameIds.length > 0) {
      console.log(`Fetching details for ${newGameIds.length} new games...`);
      const gameDetails = await this.bggClient.fetchGameDetails(newGameIds);

      for (const details of gameDetails) {
        this.db.upsertGame({
          bgg_id: details.bggId,
          name: details.name,
          year_published: details.yearPublished,
          min_players: details.minPlayers,
          max_players: details.maxPlayers,
          best_players: details.bestPlayers,
          recommended_players: details.recommendedPlayers,
          playing_time: details.playingTime,
          min_playtime: details.minPlaytime,
          max_playtime: details.maxPlaytime,
          weight: details.weight,
          categories: details.categories?.join(','),
          mechanics: details.mechanics?.join(','),
          is_expansion: details.isExpansion,
          last_updated: Date.now(),
        });
      }
    }

    const user = this.db.getUsers().find(u => u.bgg_username === bggUsername);
    if (!user) {
      throw new Error(`User ${bggUsername} not found in database`);
    }

    this.db.setOwnership(user.id, gameIds);
    this.db.setCacheTimestamp(bggUsername, Date.now());

    console.log(`Sync complete for ${bggUsername}`);
  }

  async syncAll(force: boolean = false): Promise<void> {
    const users = this.db.getUsers();
    console.log(`Syncing ${users.length} users...`);

    for (const user of users) {
      try {
        await this.syncUser(user.bgg_username, force);
      } catch (error) {
        console.error(`Failed to sync ${user.bgg_username}:`, error);
      }
    }

    console.log('All syncs complete');
  }
}
