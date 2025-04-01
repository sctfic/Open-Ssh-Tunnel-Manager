const tunnelService = require('../src/services/tunnel.service'); // Chemin vers votre service
const { readTunnelsConfig, writeTunnelsConfig } = require('../src/utils/rwTunnelsConfig');

// Mock des dépendances
jest.mock('../src/utils/rwTunnelsConfig');

describe('tunnelService.addPortForward', () => {
  beforeEach(() => {
    // Réinitialiser les mocks avant chaque test
    jest.clearAllMocks();
  });

  test('devrait ajouter un port forward de type -L avec succès', async () => {
    // Mock de la configuration existante
    const mockConfig = {
      tunnels: { '-L': {} }
    };
    readTunnelsConfig.mockReturnValue(mockConfig);
    writeTunnelsConfig.mockReturnValue(true);

    const tunnelId = 'testTunnel';
    const portData = {
      type: '-L',
      name: 'printer1',
      listen_port: '9101',
      endpoint_host: 'HP',
      endpoint_port: '9100'
    };

    const result = await tunnelService.addPortForward(tunnelId, portData);

    expect(result).toEqual({
      success: true,
      tunnelId: 'testTunnel',
      config: {
        name: 'printer1',
        listen_port: 9101, // Converti en nombre
        endpoint_host: 'HP',
        endpoint_port: 9100 // Converti en nombre
      },
      message: 'Port 9101 ajouté avec succès'
    });
    expect(writeTunnelsConfig).toHaveBeenCalledWith(tunnelId, {
      tunnels: {
        '-L': {
          '9101': {
            name: 'printer1',
            listen_port: 9101,
            endpoint_host: 'HP',
            endpoint_port: 9100
          }
        }
      }
    });
  });

  test('devrait échouer si le tunnel n’existe pas', async () => {
    readTunnelsConfig.mockReturnValue(null); // Tunnel non trouvé

    const tunnelId = 'unknownTunnel';
    const portData = {
      type: '-L',
      name: 'printer1',
      listen_port: '9101',
      endpoint_host: 'HP',
      endpoint_port: '9100'
    };

    await expect(tunnelService.addPortForward(tunnelId, portData))
      .rejects
      .toThrow('Tunnel unknownTunnel non trouvé');
  });
});