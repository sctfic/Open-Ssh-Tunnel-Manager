const request = require('supertest');
const app = require('../src/app');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

jest.mock('child_process');
jest.mock('fs');

describe('Pairing Controllers', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/tunnels/pairing', () => {
    test('devrait créer une nouvelle configuration avec génération de clé', async () => {
      fs.existsSync.mockReturnValue(false);
      execSync.mockReturnValue(Buffer.from('Yes!'));

      const response = await request(app)
        .post('/api/tunnels/pairing')
        .send({
          ip: '192.168.1.1',
          adminUser: 'user',
          adminPass: 'pass',
          configName: 'test'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('devrait utiliser une clé existante', async () => {
      fs.existsSync.mockReturnValue(true);

      const response = await request(app)
        .post('/api/tunnels/pairing')
        .send({
          ip: '192.168.1.1',
          adminUser: 'user',
          adminPass: 'ssh-rsa AAA...',
          configName: 'test'
        });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/tunnels/unpairing', () => {
    test('devrait supprimer une configuration existante', async () => {
      fs.existsSync.mockReturnValue(true);

      const response = await request(app)
        .post('/api/tunnels/unpairing')
        .send({
          configName: 'test',
          adminUser: 'user',
          adminPass: 'pass'
        });

      expect(response.status).toBe(200);
    });
  });
});