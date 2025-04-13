const channelControllers = require('../src/controllers/channel.controllers');
const tunnelService = require('../src/services/tunnel.service');
const tunnelController = require('../src/controllers/tunnel.controllers');
const fs = require('fs');
const path = require('path');

jest.mock('../src/services/tunnel.service');
jest.mock('../src/controllers/tunnel.controllers');
jest.mock('fs');

describe('Channel Controllers', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Express request et response
    req = {
      params: {},
      body: {},
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    // Mock fs.existsSync par défaut
    fs.existsSync.mockReturnValue(false);
  });

  describe('checkTunnel', () => {
    it('should return tunnel status successfully', async () => {
      const mockResult = {
        success: true,
        user: 'tunnel_user',
        ip: '142.16.102.35',
        ssh_port: 22,
        ssh_status: 100,
        channels: {
          '-L': {
            '1212': {
              name: 'example',
              listen_port: 1212,
              endpoint_host: 'localhost',
              endpoint_port: 12122,
              listen_status: 50,
              endpoint_status: 60,
              success: true,
            },
          },
        },
      };

      tunnelService.checkTunnel.mockResolvedValue(mockResult);
      req.params.id = 'test_tunnel';

      await channelControllers.checkTunnel(req, res);

      expect(tunnelService.checkTunnel).toHaveBeenCalledWith('test_tunnel');
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 500 status on error', async () => {
      const error = new Error('Tunnel check failed');
      tunnelService.checkTunnel.mockRejectedValue(error);
      req.params.id = 'test_tunnel';

      await channelControllers.checkTunnel(req, res);

      expect(tunnelService.checkTunnel).toHaveBeenCalledWith('test_tunnel');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tunnel check failed',
      });
    });
  });

  describe('addPortForward', () => {
    it('should add a port forward successfully and restart tunnel if active', async () => {
      const mockResult = {
        success: true,
        tunnelId: 'test_tunnel',
        config: {
          name: 'new_port',
          listen_port: 8080,
          endpoint_host: '127.0.0.1',
          endpoint_port: 8081,
        },
        message: 'Port 8080 ajouté avec succès',
      };

      tunnelService.addPortForward.mockResolvedValue(mockResult);
      fs.existsSync.mockReturnValue(true); // Simulate active tunnel
      tunnelController.restartTunnel.mockReturnValue();

      req.params.tunnelId = 'test_tunnel';
      req.body = {
        type: '-L',
        name: 'new_port',
        listen_port: '8080',
        endpoint_host: '127.0.0.1',
        endpoint_port: '8081',
      };

      await channelControllers.addPortForward(req, res);

      expect(tunnelService.addPortForward).toHaveBeenCalledWith('test_tunnel', req.body);
      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(__dirname, '../src/configs/pid', 'test_tunnel.pid')
      );
      expect(tunnelController.restartTunnel).toHaveBeenCalledWith('test_tunnel');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Port ajouté',
        result: mockResult,
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 if required fields are missing', async () => {
      req.params.tunnelId = 'test_tunnel';
      req.body = {
        type: '-L',
        // name manquant
        listen_port: '8080',
      };

      await channelControllers.addPortForward(req, res);

      expect(tunnelService.addPortForward).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Veuillez fournir le type de tunnel et le nom',
      });
    });

    it('should return 404 if tunnel is not found', async () => {
      const error = new Error('Tunnel test_tunnel non trouvé');
      tunnelService.addPortForward.mockRejectedValue(error);

      req.params.tunnelId = 'test_tunnel';
      req.body = {
        type: '-L',
        name: 'new_port',
        listen_port: '8080',
        endpoint_host: '127.0.0.1',
        endpoint_port: '8081',
      };

      await channelControllers.addPortForward(req, res);

      expect(tunnelService.addPortForward).toHaveBeenCalledWith('test_tunnel', req.body);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tunnel test_tunnel non trouvé',
      });
    });

    it('should return 500 for other errors', async () => {
      const error = new Error('Internal server error');
      tunnelService.addPortForward.mockRejectedValue(error);

      req.params.tunnelId = 'test_tunnel';
      req.body = {
        type: '-L',
        name: 'new_port',
        listen_port: '8080',
        endpoint_host: '127.0.0.1',
        endpoint_port: '8081',
      };

      await channelControllers.addPortForward(req, res);

      expect(tunnelService.addPortForward).toHaveBeenCalledWith('test_tunnel', req.body);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error',
      });
    });
  });

  describe('removePortForward', () => {
    it('should remove a port forward successfully and restart tunnel if active', async () => {
      const mockResult = {
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
      };

      tunnelService.removePortForward.mockResolvedValue(mockResult);
      fs.existsSync.mockReturnValue(true); // Simulate active tunnel
      tunnelController.restartTunnel.mockReturnValue();

      req.params = {
        tunnelId: 'test_tunnel',
        type: '-L',
        port: '1212',
      };

      await channelControllers.removePortForward(req, res);

      expect(tunnelService.removePortForward).toHaveBeenCalledWith('test_tunnel', '-L', '1212');
      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(__dirname, '../src/configs/pid', 'test_tunnel.pid')
      );
      expect(tunnelController.restartTunnel).toHaveBeenCalledWith('test_tunnel');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Port supprimé',
        result: mockResult,
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 if required parameters are missing', async () => {
      req.params = {
        tunnelId: 'test_tunnel',
        type: '-L',
        // port manquant
      };

      await channelControllers.removePortForward(req, res);

      expect(tunnelService.removePortForward).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Veuillez fournir l\'identifiant du tunnel, le type et le port',
      });
    });

    it('should return 404 if port or tunnel is not found', async () => {
      const error = new Error('Le port 9999 de type -L n\'existe pas dans la configuration');
      tunnelService.removePortForward.mockRejectedValue(error);

      req.params = {
        tunnelId: 'test_tunnel',
        type: '-L',
        port: '9999',
      };

      await channelControllers.removePortForward(req, res);

      expect(tunnelService.removePortForward).toHaveBeenCalledWith('test_tunnel', '-L', '9999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Le port 9999 de type -L n\'existe pas dans la configuration',
      });
    });

    it('should return 500 for other errors', async () => {
      const error = new Error('Internal server error');
      tunnelService.removePortForward.mockRejectedValue(error);

      req.params = {
        tunnelId: 'test_tunnel',
        type: '-L',
        port: '1212',
      };

      await channelControllers.removePortForward(req, res);

      expect(tunnelService.removePortForward).toHaveBeenCalledWith('test_tunnel', '-L', '1212');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error',
      });
    });
  });
});