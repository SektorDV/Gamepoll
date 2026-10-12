import { Game } from './database.js';

export function extractBGGUsernames(text: string): string[] {
  const regex = /https?:\/\/(?:www\.)?boardgamegeek\.com\/collection\/user\/([^\/\s?]+)/gi;
  const matches = [...text.matchAll(regex)];
  const usernames = matches.map(match => match[1]);
  return [...new Set(usernames)];
}

export interface GameFilters {
  players?: number;
  bestAt?: number;
  minTime?: number;
  maxTime?: number;
  minWeight?: number;
  maxWeight?: number;
  category?: string;
  mechanic?: string;
  owners?: string[];
}

export function filterGames(games: Array<Game & { owners: string[] }>, filters: GameFilters): Array<Game & { owners: string[] }> {
  return games.filter(game => {
    if (filters.players !== undefined) {
      if (game.min_players && filters.players < game.min_players) return false;
      if (game.max_players && filters.players > game.max_players) return false;
    }

    if (filters.bestAt !== undefined) {
      if (!game.best_players) return false;
      const bestCounts = game.best_players.split(',').map(s => s.trim());
      if (!bestCounts.includes(filters.bestAt.toString())) return false;
    }

    if (filters.minTime !== undefined) {
      if (!game.playing_time || game.playing_time < filters.minTime) return false;
    }

    if (filters.maxTime !== undefined) {
      if (!game.playing_time || game.playing_time > filters.maxTime) return false;
    }

    if (filters.minWeight !== undefined) {
      if (!game.weight || game.weight < filters.minWeight) return false;
    }

    if (filters.maxWeight !== undefined) {
      if (!game.weight || game.weight > filters.maxWeight) return false;
    }

    if (filters.category) {
      if (!game.categories) return false;
      const categories = game.categories.split(',').map(c => c.trim().toLowerCase());
      if (!categories.some(c => c.includes(filters.category!.toLowerCase()))) return false;
    }

    if (filters.mechanic) {
      if (!game.mechanics) return false;
      const mechanics = game.mechanics.split(',').map(m => m.trim().toLowerCase());
      if (!mechanics.some(m => m.includes(filters.mechanic!.toLowerCase()))) return false;
    }

    if (filters.owners && filters.owners.length > 0) {
      if (!game.owners.some(owner => filters.owners!.includes(owner))) return false;
    }

    return true;
  });
}

export function selectRandomGames<T>(games: T[], count: number): T[] {
  const shuffled = [...games].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, games.length));
}

export function formatGameForDisplay(game: Game & { owners: string[] }): string {
  const parts: string[] = [game.name];

  if (game.year_published) {
    parts.push(`(${game.year_published})`);
  }

  const details: string[] = [];

  if (game.min_players && game.max_players) {
    if (game.min_players === game.max_players) {
      details.push(`${game.min_players}p`);
    } else {
      details.push(`${game.min_players}-${game.max_players}p`);
    }
  }

  if (game.playing_time) {
    details.push(`${game.playing_time}m`);
  }

  if (game.weight) {
    details.push(`⚖️${game.weight.toFixed(1)}`);
  }

  if (details.length > 0) {
    parts.push(`[${details.join(' • ')}]`);
  }

  parts.push(`👥 ${game.owners.join(', ')}`);

  return parts.join(' ');
}

export function getAllCategories(games: Array<Game & { owners: string[] }>): string[] {
  const categorySet = new Set<string>();
  
  for (const game of games) {
    if (game.categories) {
      const categories = game.categories.split(',').map(c => c.trim());
      categories.forEach(c => categorySet.add(c));
    }
  }

  return Array.from(categorySet).sort();
}

export function getAllMechanics(games: Array<Game & { owners: string[] }>): string[] {
  const mechanicSet = new Set<string>();
  
  for (const game of games) {
    if (game.mechanics) {
      const mechanics = game.mechanics.split(',').map(m => m.trim());
      mechanics.forEach(m => mechanicSet.add(m));
    }
  }

  return Array.from(mechanicSet).sort();
}
