import { describe, it, expect } from 'vitest';
import { extractBGGUsernames, filterGames, selectRandomGames } from './utils.js';
import { Game } from './database.js';

describe('extractBGGUsernames', () => {
  it('should extract username from basic collection URL', () => {
    const text = 'Check out my collection: https://boardgamegeek.com/collection/user/testuser';
    const usernames = extractBGGUsernames(text);
    expect(usernames).toEqual(['testuser']);
  });

  it('should extract username from collection URL with query params', () => {
    const text = 'https://boardgamegeek.com/collection/user/testuser?own=1&subtype=boardgame';
    const usernames = extractBGGUsernames(text);
    expect(usernames).toEqual(['testuser']);
  });

  it('should extract username from www subdomain', () => {
    const text = 'https://www.boardgamegeek.com/collection/user/testuser';
    const usernames = extractBGGUsernames(text);
    expect(usernames).toEqual(['testuser']);
  });

  it('should extract multiple usernames', () => {
    const text = `
      Check these out:
      https://boardgamegeek.com/collection/user/alice
      https://boardgamegeek.com/collection/user/bob?own=1
    `;
    const usernames = extractBGGUsernames(text);
    expect(usernames).toEqual(['alice', 'bob']);
  });

  it('should deduplicate usernames', () => {
    const text = `
      https://boardgamegeek.com/collection/user/testuser
      https://boardgamegeek.com/collection/user/testuser?own=1
    `;
    const usernames = extractBGGUsernames(text);
    expect(usernames).toEqual(['testuser']);
  });

  it('should return empty array for no matches', () => {
    const text = 'No BGG links here';
    const usernames = extractBGGUsernames(text);
    expect(usernames).toEqual([]);
  });

  it('should handle http protocol', () => {
    const text = 'http://boardgamegeek.com/collection/user/testuser';
    const usernames = extractBGGUsernames(text);
    expect(usernames).toEqual(['testuser']);
  });

  it('should extract username with underscores and numbers', () => {
    const text = 'https://boardgamegeek.com/collection/user/test_user_123';
    const usernames = extractBGGUsernames(text);
    expect(usernames).toEqual(['test_user_123']);
  });
});

describe('filterGames', () => {
  const mockGames: Array<Game & { owners: string[] }> = [
    {
      id: 1,
      bgg_id: 1001,
      name: 'Game A',
      min_players: 2,
      max_players: 4,
      best_players: '3,4',
      recommended_players: '2,3,4',
      playing_time: 60,
      min_playtime: 45,
      max_playtime: 60,
      weight: 2.5,
      categories: 'Strategy,Economic',
      mechanics: 'Worker Placement,Drafting',
      is_expansion: false,
      last_updated: Date.now(),
      owners: ['alice', 'bob'],
    },
    {
      id: 2,
      bgg_id: 1002,
      name: 'Game B',
      min_players: 3,
      max_players: 6,
      best_players: '5',
      recommended_players: '4,5,6',
      playing_time: 120,
      min_playtime: 90,
      max_playtime: 150,
      weight: 3.8,
      categories: 'Fantasy,Adventure',
      mechanics: 'Dice Rolling,Area Control',
      is_expansion: false,
      last_updated: Date.now(),
      owners: ['alice'],
    },
    {
      id: 3,
      bgg_id: 1003,
      name: 'Game C',
      min_players: 2,
      max_players: 2,
      best_players: '2',
      recommended_players: '2',
      playing_time: 30,
      min_playtime: 20,
      max_playtime: 40,
      weight: 1.5,
      categories: 'Card Game,Family',
      mechanics: 'Hand Management',
      is_expansion: false,
      last_updated: Date.now(),
      owners: ['bob', 'charlie'],
    },
  ];

  it('should filter by exact player count', () => {
    const filtered = filterGames(mockGames, { players: 3 });
    expect(filtered.map(g => g.name)).toEqual(['Game A', 'Game B']);
  });

  it('should filter by best player count', () => {
    const filtered = filterGames(mockGames, { bestAt: 5 });
    expect(filtered.map(g => g.name)).toEqual(['Game B']);
  });

  it('should filter by minimum time', () => {
    const filtered = filterGames(mockGames, { minTime: 60 });
    expect(filtered.map(g => g.name)).toEqual(['Game A', 'Game B']);
  });

  it('should filter by maximum time', () => {
    const filtered = filterGames(mockGames, { maxTime: 60 });
    expect(filtered.map(g => g.name)).toEqual(['Game A', 'Game C']);
  });

  it('should filter by weight range', () => {
    const filtered = filterGames(mockGames, { minWeight: 2.0, maxWeight: 3.0 });
    expect(filtered.map(g => g.name)).toEqual(['Game A']);
  });

  it('should filter by category', () => {
    const filtered = filterGames(mockGames, { category: 'Strategy' });
    expect(filtered.map(g => g.name)).toEqual(['Game A']);
  });

  it('should filter by mechanic', () => {
    const filtered = filterGames(mockGames, { mechanic: 'Dice Rolling' });
    expect(filtered.map(g => g.name)).toEqual(['Game B']);
  });

  it('should filter by owner', () => {
    const filtered = filterGames(mockGames, { owners: ['charlie'] });
    expect(filtered.map(g => g.name)).toEqual(['Game C']);
  });

  it('should apply multiple filters', () => {
    const filtered = filterGames(mockGames, {
      players: 4,
      maxTime: 90,
      owners: ['alice'],
    });
    expect(filtered.map(g => g.name)).toEqual(['Game A']);
  });

  it('should return empty array when no games match', () => {
    const filtered = filterGames(mockGames, { players: 10 });
    expect(filtered).toEqual([]);
  });

  it('should handle case-insensitive category matching', () => {
    const filtered = filterGames(mockGames, { category: 'fantasy' });
    expect(filtered.map(g => g.name)).toEqual(['Game B']);
  });
});

describe('selectRandomGames', () => {
  it('should select requested number of games', () => {
    const games = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
      { id: 4, name: 'D' },
      { id: 5, name: 'E' },
    ];

    const selected = selectRandomGames(games, 3);
    expect(selected).toHaveLength(3);
  });

  it('should return all games when count exceeds array length', () => {
    const games = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ];

    const selected = selectRandomGames(games, 5);
    expect(selected).toHaveLength(2);
  });

  it('should not modify original array', () => {
    const games = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ];

    const original = [...games];
    selectRandomGames(games, 2);
    expect(games).toEqual(original);
  });
});
