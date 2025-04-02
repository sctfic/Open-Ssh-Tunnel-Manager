const request = require('supertest');
const app = require('../src/app');
const tunnelService = require('../src/services/tunnel.service');
const fs = require('fs');
const { pid } = require('process');

jest.mock('../src/services/tunnel.service');
jest.mock('fs');

describe('Channel Controllers', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/tunnels/addPortForward/:tunnelId', () => {
    // Tests existants...
  });

  describe('GET /api/tunnels/checkTunnel/:id', () => {
    test('devrait retourner le statut du tunnel', async () => {
      tunnelService.checkTunnel.mockResolvedValue({ success: true });

      const response = await request(app)
        .get('/api/tunnels/checkTunnel/testTunnel');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE /api/tunnels/removePortForward/:tunnelId/:type/:port', () => {
    test('devrait supprimer un port avec succès', async () => {
      tunnelService.removePortForward.mockResolvedValue({
        success: true,
        message: 'Port supprimé'
      });

      const response = await request(app)
        .delete('/api/tunnels/removePortForward/testTunnel/-L/9101');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('devrait gérer les erreurs de validation', async () => {
      const response = await request(app)
        .delete('/api/tunnels/removePortForward/invalidTunnel');

      expect(response.status).toBe(400);
    });
  });
});