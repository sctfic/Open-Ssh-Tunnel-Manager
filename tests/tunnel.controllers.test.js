const tunnelControllers = require('../src/controllers/tunnel.controllers');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readTunnelsConfig, writeTunnelsConfig } = require('../src/utils/rwTunnelsConfig');
const { buildCmd } = require('../src/utils/buildCmd');
const { logTrace } = require('../src/utils/tools');

jest.mock('fs');
jest.mock('child_process');
jest.mock('../src/utils/rwTunnelsConfig');
jest.mock('../src/utils/buildCmd');
jest.mock('../src/utils/tools');

describe('Tunnel Controllers', () => {
  let req, res;

  const mockConfig = {
    user: 'tunnel_user',
    ip: '142.16.102.35',
    ssh_port: 22,
    ssh_key: '/path/to/key',
    options: {
      Compression: 'yes',
      ServerAliveInterval: 10,
      ServerAliveCountMax: 3,
    },
    bandwidth: {
      up: 9402,
      down: 9020,
    },
    channels: {
      '-L': {
        '1212': {
          name: 'example',
          listen_port: 1212,
          endpoint_host: 'localhost',
          endpoint_port: 12122,
        },
      },
    },
  };

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

    // Mock fs par défaut
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
    fs.unlinkSync.mockImplementation(() => {});
    fs.promises = {
      unlink: jest.fn().mockResolvedValue(),
    };

    // Mock child_process
    execSync.mockReturnValue('');

    // Mock utilitaires
    readTunnelsConfig.mockReturnValue(mockConfig);
    writeTunnelsConfig.mockReturnValue(true);
    buildCmd.mockReturnValue('autossh -M 0 -i /path/to/key tunnel_user@142.16.102.35');
    logTrace.mockImplementation(() => {});
  });

  describe('startTunnel', () => {
    it('should start a single tunnel successfully', async () => {
      req.params.tunnelId = 'test_tunnel';
      fs.readdirSync.mockReturnValue(['test_tunnel.json']);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('12345');
      execSync.mockReturnValue(''); // Simulate successful autossh execution

      await tunnelControllers.startTunnel(req, res);

      expect(readTunnelsConfig).toHaveBeenCalledWith('test_tunnel');
      expect(buildCmd).toHaveBeenCalledWith(mockConfig);
      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(__dirname, '../src/configs/pid', 'test_tunnel.pid')
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.any(String),
        tunnels: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            id: 'test_tunnel',
            pid: '12345',
            status: 'running',
          }),
        ]),
      });
    });

    it('should start all tunnels if no tunnelId is provided', async () => {
      req.params.tunnelId = undefined;
      fs.readdirSync.mockReturnValue(['tunnel1.json', 'tunnel2.json']);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('12345');

      await tunnelControllers.startTunnel(req, res);

      expect(fs.readdirSync).toHaveBeenCalledWith(path.join(__dirname, '../src/configs/tunnels/'));
      expect(readTunnelsConfig).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Tous les tunnel(s) ont été demarré.',
        tunnels: expect.arrayContaining([
          expect.objectContaining({ id: 'tunnel1' }),
          expect.objectContaining({ id: 'tunnel2' }),
        ]),
      });
    });

    it('should return 404 if no tunnels are configured', async () => {
      req.params.tunnelId = undefined;
      fs.readdirSync.mockReturnValue([]);

      await tunnelControllers.startTunnel(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Aucun tunnel configuré.',
        tunnels: [],
      });
    });
  });

  describe('stopTunnel', () => {
    it('should stop a single tunnel successfully', async () => {
      req.params.tunnelId = 'test_tunnel';
      fs.readdirSync.mockReturnValue(['test_tunnel.pid']);
      fs.readFileSync.mockReturnValue('12345');
      process.kill = jest.fn();

      await tunnelControllers.stopTunnel(req, res);

      expect(fs.readdirSync).toHaveBeenCalledWith(path.join(__dirname, '../src/configs/pid'));
      expect(process.kill).toHaveBeenCalledWith('12345', 'SIGTERM', expect.any(Function));
      expect(fs.unlink).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Tunnel arrêté avec succès.',
        tunnels: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            id: 'test_tunnel',
            status: 'stopped',
          }),
        ]),
      });
    });

    it('should return 404 if no tunnels are running', async () => {
      req.params.tunnelId = undefined;
      fs.readdirSync.mockReturnValue([]);

      await tunnelControllers.stopTunnel(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Aucun tunnel en cours d\'exécution.',
        tunnels: [],
      });
    });
  });

  describe('restartTunnel', () => {
    it('should restart a single tunnel successfully', async () => {
      req.params.tunnelId = 'test_tunnel';
      fs.readdirSync.mockReturnValue(['test_tunnel.pid']);
      fs.readFileSync.mockReturnValue('12345');
      fs.existsSync
        .mockReturnValueOnce(true) // PID exists initially
        .mockReturnValueOnce(false) // PID disappears after kill
        .mockReturnValueOnce(true); // New PID created
      process.kill = jest.fn();
      execSync.mockReturnValue('');

      await tunnelControllers.restartTunnel(req, res);

      expect(process.kill).toHaveBeenCalledWith('12345', 'SIGTERM', expect.any(Function));
      expect(fs.unlink).toHaveBeenCalled();
      expect(buildCmd).toHaveBeenCalledWith(mockConfig);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.any(String),
        tunnels: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            id: 'test_tunnel',
            status: 'running',
          }),
        ]),
      });
    });

    it('should return 404 if no tunnels are running', async () => {
      req.params.tunnelId = undefined;
      fs.readdirSync.mockReturnValue([]);

      await tunnelControllers.restartTunnel(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Aucun tunnel en cours d\'exécution.',
        tunnels: [],
      });
    });
  });

  describe('getStatus', () => {
    it('should return status of a single tunnel', async () => {
      req.params.tunnelId = 'test_tunnel';
      fs.readdirSync.mockReturnValue(['test_tunnel.json']);
      fs.readFileSync.mockReturnValue('12345');
      execSync.mockReturnValue('autossh -M 0 -i /path/to/key tunnel_user@142.16.102.35');

      await tunnelControllers.getStatus(req, res);

      expect(readTunnelsConfig).toHaveBeenCalledWith('test_tunnel');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.any(String),
        tunnels: expect.arrayContaining([
          expect.objectContaining({
            id: 'test_tunnel',
            pid: '12345',
            status: 'running',
            ip: '142.16.102.35',
            ssh_port: 22,
          }),
        ]),
      });
    });

    it('should return status of all tunnels including orphans', async () => {
      req.params.tunnelId = undefined;
      fs.readdirSync.mockReturnValue(['tunnel1.json']);
      execSync.mockReturnValue(
        'user 12345 1 0 autossh -M 0 -i /path/to/key tunnel_user@142.16.102.35\n' +
        'user 67890 1 0 autossh -M 0 -i /other/key other_user@other_ip'
      );

      await tunnelControllers.getStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('1/1 tunnels actifs (1 non gérés)'),
        tunnels: expect.arrayContaining([
          expect.objectContaining({ id: 'tunnel1', status: 'running' }),
          expect.objectContaining({ id: null, status: 'orphan', pid: 67890 }),
        ]),
      });
    });

    it('should handle errors gracefully', async () => {
      req.params.tunnelId = 'test_tunnel';
      fs.readdirSync.mockImplementation(() => {
        throw new Error('Directory read error');
      });

      await tunnelControllers.getStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Erreur lors de la récupération du statut: Directory read error',
        tunnels: [],
      });
    });
  });

  describe('setBandwidth', () => {
    it('should update bandwidth successfully', async () => {
      req.params.tunnelId = 'test_tunnel';
      req.body = { up: 10000, down: 20000 };

      await tunnelControllers.setBandwidth(req, res);

      expect(readTunnelsConfig).toHaveBeenCalledWith('test_tunnel');
      expect(writeTunnelsConfig).toHaveBeenCalledWith('test_tunnel', {
        ...mockConfig,
        bandwidth: { up: 10000, down: 20000 },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Bande passante du tunnel test_tunnel modifiée.',
        config: expect.objectContaining({
          bandwidth: { up: 10000, down: 20000 },
        }),
      });
    });

    it('should return 404 if tunnel does not exist', async () => {
      req.params.tunnelId = 'test_tunnel';
      req.body = { up: 10000, down: 20000 };
      readTunnelsConfig.mockReturnValue(null);

      await tunnelControllers.setBandwidth(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tunnel test_tunnel non trouvé.',
      });
    });

    it('should handle errors gracefully', async () => {
      req.params.tunnelId = 'test_tunnel';
      req.body = { up: 10000, down: 20000 };
      writeTunnelsConfig.mockImplementation(() => {
        throw new Error('Write error');
      });

      await tunnelControllers.setBandwidth(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Erreur lors de la modification de la bande passante: Write error',
      });
    });
  });
});