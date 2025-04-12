const tunnelService = require('../src/services/tunnel.service');
const { readTunnelsConfig, writeTunnelsConfig } = require('../src/utils/rwTunnelsConfig');

jest.mock('../src/utils/rwTunnelsConfig');

describe('Tunnel Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('removePortForward', () => {
    test('devrait supprimer un port existant', async () => {
      readTunnelsConfig.mockReturnValue({
        channels: { '-L': { '9101': {} } }
      });

      const result = await tunnelService.removePortForward('test', '-L', '9101');
      expect(result.success).toBe(true);
    });
  });

  describe('checkTunnel', () => {
    test('devrait retourner un statut de test', async () => {
      const result = await tunnelService.checkTunnel('test');
      expect(result.success).toBe(true);
    });
  });

  describe('addPortForward', () => {
    test('devrait rejeter les ports invalides', async () => {
      readTunnelsConfig.mockReturnValue({ tunnels: {} });
      
      await expect(tunnelService.addPortForward('test', {
        type: '-L',
        name: 'test',
        listen_port: 'invalid'
      })).rejects.toThrow('Le port doit être un nombre');
    });
  });
});