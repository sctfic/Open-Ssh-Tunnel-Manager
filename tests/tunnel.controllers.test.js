const request = require('supertest');
const app = require('../src/app');
const fs = require('fs');
const { execSync } = require('child_process');
const { readTunnelsConfig } = require('../src/utils/rwTunnelsConfig');

jest.mock('fs');
jest.mock('child_process');
jest.mock('../src/utils/rwTunnelsConfig');

describe('Tunnel Controllers', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/tunnels/startTunnel/:tunnelId?', () => {
    test('devrait démarrer tous les tunnels', async () => {
      fs.readdirSync.mockReturnValue(['tunnel1.json']);
      readTunnelsConfig.mockReturnValue({});
      execSync.mockImplementation(() => Buffer.from(''));

      const response = await request(app)
        .post('/api/tunnels/startTunnel');

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/tunnels/stopTunnel/:tunnelId?', () => {
    test('devrait arrêter un tunnel spécifique', async () => {
      fs.readdirSync.mockReturnValue(['tunnel1.pid']);
      
      const response = await request(app)
        .post('/api/tunnels/stopTunnel/tunnel1');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/tunnels/status/:tunnelId?', () => {
    test('devrait retourner le statut des tunnels', async () => {
      fs.readdirSync.mockReturnValue(['tunnel1.json']);
      execSync.mockReturnValue(' 1234 autossh ...');

      const response = await request(app)
        .get('/api/tunnels/status');

      expect(response.body.tunnels.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/tunnels/setBandwidth/:tunnelId', () => {
    test('devrait modifier la bande passante', async () => {
      readTunnelsConfig.mockReturnValue({ bandwidth: {} });
      
      const response = await request(app)
        .post('/api/tunnels/setBandwidth/tunnel1')
        .send({ up: 100, down: 100 });

      expect(response.status).toBe(200);
    });
  });
});