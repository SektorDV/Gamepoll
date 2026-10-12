import { XMLParser } from 'fast-xml-parser';

export interface BGGCollectionItem {
  bggId: number;
  name: string;
  yearPublished?: number;
}

export interface BGGGameDetails {
  bggId: number;
  name: string;
  yearPublished?: number;
  minPlayers?: number;
  maxPlayers?: number;
  bestPlayers?: string;
  recommendedPlayers?: string;
  playingTime?: number;
  minPlaytime?: number;
  maxPlaytime?: number;
  weight?: number;
  categories?: string[];
  mechanics?: string[];
  isExpansion: boolean;
}

export class BGGAPIError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'BGGAPIError';
  }
}

export class BGGAPIClient {
  private parser: XMLParser;
  private readonly baseUrl = 'https://boardgamegeek.com/xmlapi2';
  private readonly apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
    });
  }

  async fetchCollection(username: string, maxRetries = 5): Promise<BGGCollectionItem[]> {
    const url = `${this.baseUrl}/collection?username=${encodeURIComponent(username)}&own=1&excludesubtype=boardgameexpansion`;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
        },
      });

      if (response.status === 202) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await this.sleep(delay);
        continue;
      }

      if (!response.ok) {
        throw new BGGAPIError(
          `Failed to fetch collection for ${username}: ${response.statusText}`,
          response.status
        );
      }

      const text = await response.text();
      const data = this.parser.parse(text);

      if (!data.items || !data.items.item) {
        return [];
      }

      const items = Array.isArray(data.items.item) ? data.items.item : [data.items.item];

      return items.map((item: any) => {
        let name = 'Unknown';
        if (typeof item.name === 'string') {
          name = item.name;
        } else if (item.name?.['#text']) {
          name = item.name['#text'];
        }

        return {
          bggId: item['@_objectid'],
          name,
          yearPublished: item.yearpublished ? parseInt(item.yearpublished, 10) : undefined,
        };
      });
    }

    throw new BGGAPIError(`Collection queued after ${maxRetries} retries for ${username}`, 202);
  }

  async fetchGameDetails(gameIds: number[]): Promise<BGGGameDetails[]> {
    if (gameIds.length === 0) return [];

    const batchSize = 20;
    const results: BGGGameDetails[] = [];

    for (let i = 0; i < gameIds.length; i += batchSize) {
      const batch = gameIds.slice(i, i + batchSize);
      const batchResults = await this.fetchGameDetailsBatch(batch);
      results.push(...batchResults);

      if (i + batchSize < gameIds.length) {
        await this.sleep(1000);
      }
    }

    return results;
  }

  private async fetchGameDetailsBatch(gameIds: number[]): Promise<BGGGameDetails[]> {
    const idsParam = gameIds.join(',');
    const url = `${this.baseUrl}/thing?id=${idsParam}&stats=1`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      throw new BGGAPIError(
        `Failed to fetch game details: ${response.statusText}`,
        response.status
      );
    }

    const text = await response.text();
    const data = this.parser.parse(text);

    if (!data.items || !data.items.item) {
      return [];
    }

    const items = Array.isArray(data.items.item) ? data.items.item : [data.items.item];

    return items.map((item: any) => this.parseGameDetails(item));
  }

  parseGameDetails(item: any): BGGGameDetails {
    const names = Array.isArray(item.name) ? item.name : [item.name];
    const primaryName = names.find((n: any) => n['@_type'] === 'primary');
    const name = primaryName?.['@_value'] || names[0]?.['@_value'] || 'Unknown';

    const isExpansion = item['@_type'] === 'boardgameexpansion';

    const minPlayers = item.minplayers?.['@_value'];
    const maxPlayers = item.maxplayers?.['@_value'];

    let bestPlayers: string | undefined;
    let recommendedPlayers: string | undefined;

    if (item.poll) {
      const polls = Array.isArray(item.poll) ? item.poll : [item.poll];
      const playerPoll = polls.find((p: any) => p['@_name'] === 'suggested_numplayers');
      
      if (playerPoll && playerPoll.results) {
        const results = Array.isArray(playerPoll.results) ? playerPoll.results : [playerPoll.results];
        
        const best: string[] = [];
        const recommended: string[] = [];

        for (const result of results) {
          const numPlayers = result['@_numplayers'];
          if (!numPlayers) continue;

          const resultItems = Array.isArray(result.result) ? result.result : [result.result];
          
          let bestVotes = 0;
          let recommendedVotes = 0;
          let notRecommendedVotes = 0;

          for (const resultItem of resultItems) {
            const value = resultItem['@_value'];
            const numVotes = parseInt(resultItem['@_numvotes'], 10) || 0;

            if (value === 'Best') bestVotes = numVotes;
            else if (value === 'Recommended') recommendedVotes = numVotes;
            else if (value === 'Not Recommended') notRecommendedVotes = numVotes;
          }

          if (bestVotes > recommendedVotes && bestVotes > notRecommendedVotes) {
            best.push(numPlayers);
          }
          
          if (bestVotes + recommendedVotes > notRecommendedVotes) {
            recommended.push(numPlayers);
          }
        }

        if (best.length > 0) bestPlayers = best.join(',');
        if (recommended.length > 0) recommendedPlayers = recommended.join(',');
      }
    }

    const categories: string[] = [];
    const mechanics: string[] = [];

    if (item.link) {
      const links = Array.isArray(item.link) ? item.link : [item.link];
      
      for (const link of links) {
        const type = link['@_type'];
        const value = link['@_value'];
        
        if (type === 'boardgamecategory' && value) {
          categories.push(value);
        } else if (type === 'boardgamemechanic' && value) {
          mechanics.push(value);
        }
      }
    }

    const weight = item.statistics?.ratings?.averageweight?.['@_value'];

    return {
      bggId: item['@_id'],
      name,
      yearPublished: item.yearpublished?.['@_value'],
      minPlayers,
      maxPlayers,
      bestPlayers,
      recommendedPlayers,
      playingTime: item.playingtime?.['@_value'],
      minPlaytime: item.minplaytime?.['@_value'],
      maxPlaytime: item.maxplaytime?.['@_value'],
      weight: weight ? parseFloat(weight) : undefined,
      categories,
      mechanics,
      isExpansion,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
