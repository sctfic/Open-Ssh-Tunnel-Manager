const request = require('supertest');
const app = require('../src/app'); // Chemin vers votre fichier principal (app.js)
const tunnelService = require('../src/services/tunnel.service');
const fs = require('fs');

// Mock du service et du système de fichiers
jest.mock('../src/services/tunnel.service');
jest.mock('fs');

describe('POST /api/addPortForward/:tunnelId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('devrait ajouter un port et retourner un succès', async () => {
    // Mock de la réponse du service
    tunnelService.addPortForward.mockResolvedValue({
      success: true,
      tunnelId: 'testTunnel',
      config: { name: 'printer1', listen_port: 9101, endpoint_host: 'HP', endpoint_port: 9100 },
      message: 'Port 9101 ajouté avec succès'
    });

    // Simuler qu’aucun tunnel n’est actif (pas de fichier PID)
    fs.existsSync.mockReturnValue(false);

    const response = await request(app)
      .post('/api/addPortForward/testTunnel')
      .send({
        type: '-L',
        name: 'printer1',
        listen_port: '9101',
        endpoint_host: 'HP',
        endpoint_port: '9100'
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Port ajouté.',
      result: {
        success: true,
        tunnelId: 'testTunnel',
        config: { name: 'printer1', listen_port: 9101, endpoint_host: 'HP', endpoint_port: 9100 },
        message: 'Port 9101 ajouté avec succès'
      },
      needRestart: false
    });
  });

  test('devrait indiquer un redémarrage nécessaire si le tunnel est actif', async () => {
    tunnelService.addPortForward.mockResolvedValue({
      success: true,
      tunnelId: 'testTunnel',
      config: { name: 'printer1', listen_port: 9101, endpoint_host: 'HP', endpoint_port: 9100 },
      message: 'Port 9101 ajouté avec succès'
    });

    // Simuler qu’un tunnel est actif (fichier PID existe)
    fs.existsSync.mockReturnValue(true);

    const response = await request(app)
      .post('/api/addPortForward/testTunnel')
      .send({
        type: '-L',
        name: 'printer1',
        listen_port: '9101',
        endpoint_host: 'HP',
        endpoint_port: '9100'
      });

    expect(response.status).toBe(200);
    expect(response.body.needRestart).toBe(true);
    expect(response.body.message).toBe('Port ajouté. Veuillez redémarrer le tunnel pour appliquer les changements');
  });
});