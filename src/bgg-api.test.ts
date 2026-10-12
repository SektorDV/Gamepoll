import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { BGGAPIClient } from './bgg-api.js';

describe('BGG XML Parsing', () => {
  let collectionXml: string;
  let thingXml: string;
  let parser: XMLParser;

  beforeAll(async () => {
    collectionXml = await readFile('./src/fixtures/bgg-collection.xml', 'utf-8');
    thingXml = await readFile('./src/fixtures/bgg-thing.xml', 'utf-8');
    parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
    });
  });

  describe('Collection XML Parsing', () => {
    it('should parse collection items correctly', () => {
      const data = parser.parse(collectionXml);
      
      expect(data.items).toBeDefined();
      expect(data.items.item).toHaveLength(3);
    });

    it('should extract game IDs from collection', () => {
      const data = parser.parse(collectionXml);
      const items = data.items.item;

      expect(items[0]['@_objectid']).toBe(174430);
      expect(items[1]['@_objectid']).toBe(266192);
      expect(items[2]['@_objectid']).toBe(167791);
    });

    it('should extract game names from collection', () => {
      const data = parser.parse(collectionXml);
      const items = data.items.item;

      expect(items[0].name['#text']).toBe('Gloomhaven');
      expect(items[1].name['#text']).toBe('Wingspan');
      expect(items[2].name['#text']).toBe('Terraforming Mars');
    });

    it('should extract year published from collection', () => {
      const data = parser.parse(collectionXml);
      const items = data.items.item;

      expect(items[0].yearpublished).toBe(2017);
      expect(items[1].yearpublished).toBe(2019);
      expect(items[2].yearpublished).toBe(2016);
    });
  });

  describe('Thing XML Parsing', () => {
    it('should parse game details correctly', () => {
      const data = parser.parse(thingXml);
      
      expect(data.items).toBeDefined();
      expect(data.items.item).toHaveLength(2);
    });

    it('should extract primary name', () => {
      const data = parser.parse(thingXml);
      const item = data.items.item[0];
      
      const names = Array.isArray(item.name) ? item.name : [item.name];
      const primaryName = names.find((n: any) => n['@_type'] === 'primary');
      
      expect(primaryName['@_value']).toBe('Gloomhaven');
    });

    it('should extract player count info', () => {
      const data = parser.parse(thingXml);
      const item = data.items.item[0];

      expect(item.minplayers['@_value']).toBe(1);
      expect(item.maxplayers['@_value']).toBe(4);
    });

    it('should extract playing time', () => {
      const data = parser.parse(thingXml);
      const gloomhaven = data.items.item[0];
      const wingspan = data.items.item[1];

      expect(gloomhaven.playingtime['@_value']).toBe(120);
      expect(gloomhaven.minplaytime['@_value']).toBe(60);
      expect(gloomhaven.maxplaytime['@_value']).toBe(120);

      expect(wingspan.playingtime['@_value']).toBe(70);
      expect(wingspan.minplaytime['@_value']).toBe(40);
      expect(wingspan.maxplaytime['@_value']).toBe(70);
    });

    it('should extract weight rating', () => {
      const data = parser.parse(thingXml);
      const gloomhaven = data.items.item[0];
      const wingspan = data.items.item[1];

      const gloomhavenWeight = gloomhaven.statistics.ratings.averageweight['@_value'];
      const wingspanWeight = wingspan.statistics.ratings.averageweight['@_value'];

      expect(gloomhavenWeight).toBe(3.86);
      expect(wingspanWeight).toBe(2.45);
    });

    it('should extract categories', () => {
      const data = parser.parse(thingXml);
      const item = data.items.item[0];
      
      const links = Array.isArray(item.link) ? item.link : [item.link];
      const categories = links
        .filter((l: any) => l['@_type'] === 'boardgamecategory')
        .map((l: any) => l['@_value']);

      expect(categories).toContain('Adventure');
      expect(categories).toContain('Fantasy');
      expect(categories).toContain('Fighting');
    });

    it('should extract mechanics', () => {
      const data = parser.parse(thingXml);
      const item = data.items.item[0];
      
      const links = Array.isArray(item.link) ? item.link : [item.link];
      const mechanics = links
        .filter((l: any) => l['@_type'] === 'boardgamemechanic')
        .map((l: any) => l['@_value']);

      expect(mechanics).toContain('Cooperative Game');
      expect(mechanics).toContain('Hand Management');
      expect(mechanics).toContain('Variable Player Powers');
    });
  });

  describe('parseGameDetails', () => {
    it('should parse best player counts', () => {
      const data = parser.parse(thingXml);
      const gloomhaven = data.items.item[0];
      
      const client = new BGGAPIClient('dummy-token');
      const details = client.parseGameDetails(gloomhaven);

      expect(details.bestPlayers).toBe('3,4');
    });

    it('should parse recommended player counts', () => {
      const data = parser.parse(thingXml);
      const gloomhaven = data.items.item[0];
      
      const client = new BGGAPIClient('dummy-token');
      const details = client.parseGameDetails(gloomhaven);

      expect(details.recommendedPlayers).toBe('1,2,3,4');
    });

    it('should handle games with no poll data', () => {
      const data = parser.parse(thingXml);
      const item = data.items.item[0];
      
      const itemNoPoll = { ...item };
      delete itemNoPoll.poll;
      
      const client = new BGGAPIClient('dummy-token');
      const details = client.parseGameDetails(itemNoPoll);

      expect(details.bestPlayers).toBeUndefined();
      expect(details.recommendedPlayers).toBeUndefined();
    });

    it('should parse full game details for Gloomhaven', () => {
      const data = parser.parse(thingXml);
      const gloomhaven = data.items.item[0];
      
      const client = new BGGAPIClient('dummy-token');
      const details = client.parseGameDetails(gloomhaven);

      expect(details.bggId).toBe(174430);
      expect(details.name).toBe('Gloomhaven');
      expect(details.yearPublished).toBe(2017);
      expect(details.minPlayers).toBe(1);
      expect(details.maxPlayers).toBe(4);
      expect(details.bestPlayers).toBe('3,4');
      expect(details.playingTime).toBe(120);
      expect(details.weight).toBe(3.86);
      expect(details.categories).toContain('Fantasy');
      expect(details.mechanics).toContain('Cooperative Game');
      expect(details.isExpansion).toBe(false);
    });

    it('should parse full game details for Wingspan', () => {
      const data = parser.parse(thingXml);
      const wingspan = data.items.item[1];
      
      const client = new BGGAPIClient('dummy-token');
      const details = client.parseGameDetails(wingspan);

      expect(details.bggId).toBe(266192);
      expect(details.name).toBe('Wingspan');
      expect(details.yearPublished).toBe(2019);
      expect(details.minPlayers).toBe(1);
      expect(details.maxPlayers).toBe(5);
      expect(details.bestPlayers).toBe('3');
      expect(details.recommendedPlayers).toBe('1,2,3,4,5');
      expect(details.playingTime).toBe(70);
      expect(details.weight).toBe(2.45);
      expect(details.categories).toContain('Animals');
      expect(details.mechanics).toContain('Worker Placement');
      expect(details.isExpansion).toBe(false);
    });
  });
});
