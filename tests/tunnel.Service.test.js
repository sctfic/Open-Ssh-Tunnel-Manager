const tunnelService = require('../src/services/tunnel.service');
const { readTunnelsConfig, writeTunnelsConfig } = require('../src/utils/rwTunnelsConfig');
const { logTrace } = require('../src/utils/tools');
const net = require('net');

jest.mock('../src/utils/rwTunnelsConfig');
jest.mock('../src/utils/tools');
jest.mock('net');

describe('Tunnel Service', () => {
  const mockConfig = {
    user: 'tunnel_user',
    ip: '142.16.102.35',
    ssh_port: 22,
    ssh_host: 'localhost',
    channels: {
      '-L': {
        '1212': {
          name: 'example',
          listen_port: 1212,
          endpoint_host: 'localhost',
          endpoint_port: 12122,
        },
      },
      '-R': {},
      '-D': {},
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addPortForward', () => {
    it('should add a new port forward successfully for type -L', async () => {
      readTunnelsConfig.mockReturnValue({ ...mockConfig });
      writeTunnelsConfig.mockReturnValue(true);

      const portData = {
        type: '-L',
        name: 'new_port',
        listen_port: '8080',
        endpoint_host: '127.0.0.1',
        endpoint_port: '8081',
      };

      const result = await tunnelService.addPortForward('test_tunnel', portData);

      expect(readTunnelsConfig).toHaveBeenCalledWith('test_tunnel');
      expect(writeTunnelsConfig).toHaveBeenCalledWith('test_tunnel', expect.any(Object));
      expect(result).toEqual({
        success: true,
        tunnelId: 'test_tunnel',
        config: {
          name: 'new_port',
          listen_port: 8080,
          endpoint_host: '127.0.0.1',
          endpoint_port: 8081,
        },
        message: 'Port 8080 ajouté avec succès',
      });
      expect(logTrace).toHaveBeenCalledWith('Port -L 8080 ajouté au tunnel test_tunnel');
    });

    it('should throw an error for invalid tunnel type', async () => {
      const portData = {
        type: '-X',
        name: 'invalid',
        listen_port: '8080',
      };

      await expect(tunnelService.addPortForward('test_tunnel', portData)).rejects.toThrow(
        'Le type doit être -L, -R ou -D'
      );
      expect(logTrace).toHaveBeenCalledWith(expect.stringContaining('Erreur lors de l\'ajout du port'));
    });

    it('should throw an error if tunnel does not exist', async () => {
      readTunnelsConfig.mockReturnValue(null);

      const portData = {
        type: '-L',
        name: 'new_port',
        listen_port: '8080',
        endpoint_host: '127.0.0.1',
        endpoint_port: '8081',
      };

      await expect(tunnelService.addPortForward('test_tunnel', portData)).rejects.toThrow(
        'Tunnel test_tunnel non trouvé'
      );
    });

    it('should throw an error if port already exists', async () => {
      readTunnelsConfig.mockReturnValue({ ...mockConfig });

      const portData = {
        type: '-L',
        name: 'example',
        listen_port: '1212',
        endpoint_host: 'localhost',
        endpoint_port: '12122',
      };

      await expect(tunnelService.addPortForward('test_tunnel', portData)).rejects.toThrow(
        'Le port 1212 est déjà configuré pour ce type de tunnel'
      );
    });
  });

  describe('removePortForward', () => {
    it('should remove a port forward successfully', async () => {
      readTunnelsConfig.mockReturnValue({ ...mockConfig });
      writeTunnelsConfig.mockReturnValue(true);

      const result = await tunnelService.removePortForward('test_tunnel', '-L', '1212');

      expect(readTunnelsConfig).toHaveBeenCalledWith('test_tunnel');
      expect(writeTunnelsConfig).toHaveBeenCalledWith('test_tunnel', expect.any(Object));
      expect(result).toEqual({
        success: true,
        tunnelId: 'test_tunnel',
        type: '-L',
        port: '1212',
        removedConfig: {
          name: 'example',
          listen_port: 1212,
          endpoint_host: 'localhost',
          endpoint_port: 12122,
        },
        message: 'Port 1212 supprimé avec succès',
      });
      expect(logTrace).toHaveBeenCalledWith('Port -L 1212 supprimé du tunnel test_tunnel');
    });

    it('should throw an error if port does not exist', async () => {
      readTunnelsConfig.mockReturnValue({ ...mockConfig });

      await expect(tunnelService.removePortForward('test_tunnel', '-L', '9999')).rejects.toThrow(
        'Le port 9999 de type -L n\'existe pas dans la configuration'
      );
    });

    it('should throw an error if tunnel does not exist', async () => {
      readTunnelsConfig.mockReturnValue(null);

      await expect(tunnelService.removePortForward('test_tunnel', '-L', '1212')).rejects.toThrow(
        'Tunnel test_tunnel non trouvé'
      );
    });
  });

  describe('checkTunnel', () => {
    let mockSocket;

    beforeEach(() => {
      mockSocket = {
        setTimeout: jest.fn(),
        connect: jest.fn().mockReturnThis(),
        on: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
      };
      net.Socket.mockImplementation(() => mockSocket);
    });

    it('should check tunnel and return status for open ports', async () => {
      readTunnelsConfig.mockReturnValue({ ...mockConfig });

      // Mock successful port check
      const mockConnect = jest.fn((port, host, callback) => {
        callback();
        return mockSocket;
      });
      mockSocket.connect.mockImplementation(mockConnect);

      const result = await tunnelService.checkTunnel('test_tunnel');

      expect(readTunnelsConfig).toHaveBeenCalledWith('test_tunnel');
      expect(result.success).toBe(true);
      expect(result.ssh_status).toBeGreaterThanOrEqual(0);
      expect(result.channels['-L']['1212'].listen_status).toBeGreaterThanOrEqual(0);
      expect(result.channels['-L']['1212'].endpoint_status).toBeGreaterThanOrEqual(0);
      expect(result.channels['-L']['1212'].success).toBe(true);
    });

    it('should return error if SSH port is not accessible', async () => {
      readTunnelsConfig.mockReturnValue({ ...mockConfig });

      // Mock SSH port check failure
      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'timeout' || event === 'error') callback();
        return mockSocket;
      });

      const result = await tunnelService.checkTunnel('test_tunnel');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Le port SSH (22) n\'est pas accessible');
    });

    it('should handle non-existent tunnel', async () => {
      readTunnelsConfig.mockReturnValue(null);

      const result = await tunnelService.checkTunnel('test_tunnel');

      expect(result).toEqual({
        success: false,
        message: 'Erreur: Tunnel test_tunnel non trouvé',
      });
    });
  });
});