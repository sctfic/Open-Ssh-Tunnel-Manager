const pairingControllers = require('../src/controllers/pairing.controllers');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { writeTunnelsConfig, readTunnelsConfig } = require('../src/utils/rwTunnelsConfig');
const { logTrace } = require('../src/utils/tools');

jest.mock('fs');
jest.mock('child_process');
jest.mock('../src/utils/rwTunnelsConfig');
jest.mock('../src/utils/tools');

describe('Pairing Controllers', () => {
  let req, res;

  const mockConfig = {
    user: 'tunnel_user',
    ip: '142.16.102.35',
    ssh_port: 22,
    ssh_key: '/path/to/configs/key/test_config_key',
    options: {
      Compression: 'yes',
      ServerAliveInterval: 15,
      ServerAliveCountMax: 3,
    },
    bandwidth: { up: 1000, down: 5000 },
    channels: { '-L': {}, '-R': {}, '-D': {} },
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
    fs.mkdirSync.mockImplementation(() => {});
    fs.chmodSync.mockImplementation(() => {});
    fs.readFileSync.mockReturnValue('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... ostm-test_config');
    fs.writeSync.mockImplementation(() => {});
    fs.unlinkSync.mockImplementation(() => {});

    // Mock child_process
    execSync
      .mockImplementationOnce(() => {}) // ssh-keygen
      .mockImplementationOnce(() => {}) // sshpass ensure dir
      .mockImplementationOnce(() => {}) // sshpass add key
      .mockImplementationOnce(() => 'OSTM_PAIRING_SUCCESS'); // SSH test

    // Mock utilitaires
    writeTunnelsConfig.mockReturnValue();
    readTunnelsConfig.mockReturnValue(mockConfig);
    logTrace.mockImplementation(() => {});
  });

  describe('pairing', () => {
    it('should pair a server successfully', async () => {
      req.body = {
        ip: '142.16.102.35',
        adminUser: 'tunnel_user',
        adminPass: 'secure_password',
        configName: 'test_config',
      };

      fs.existsSync
        .mockReturnValueOnce(false) // key dir exists
        .mockReturnValueOnce(false) // key does not exist
        .mockReturnValueOnce(true); // pub key exists

      await pairingControllers.pairing(req, res);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join(__dirname, '../src/configs/key'),
        { recursive: true }
      );
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('ssh-keygen -t ed25519'),
        { stdio: 'pipe' }
      );
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('sshpass -p'),
        { stdio: 'pipe', timeout: 15000 }
      );
      expect(writeTunnelsConfig).toHaveBeenCalledWith('test_config', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Pairing réussi pour test_config',
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 if required fields are missing', async () => {
      req.body = {
        ip: '142.16.102.35',
        adminUser: 'tunnel_user',
        // adminPass manquant
        configName: 'test_config',
      };

      await pairingControllers.pairing(req, res);

      expect(execSync).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Données manquantes (ip, adminUser, adminPass, configName).',
      });
    });

    it('should return 500 on SSH authentication failure', async () => {
      req.body = {
        ip: '142.16.102.35',
        adminUser: 'tunnel_user',
        adminPass: 'wrong_password',
        configName: 'test_config',
      };

      fs.existsSync
        .mockReturnValueOnce(false) // key dir
        .mockReturnValueOnce(false) // key
        .mockReturnValueOnce(true); // pub key

      execSync
        .mockImplementationOnce(() => {}) // ssh-keygen
        .mockImplementationOnce(() => {
          throw new Error('Permission denied');
        }); // sshpass fails

      await pairingControllers.pairing(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Échec de l\'authentification'),
      });
    });

    it('should return 500 if config name is invalid', async () => {
      req.body = {
        ip: '142.16.102.35',
        adminUser: 'tunnel_user',
        adminPass: 'secure_password',
        configName: 'invalid#name',
      };

      await pairingControllers.pairing(req, res);

      expect(execSync).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Nom de configuration invalide'),
      });
    });
  });

  describe('unpairing', () => {
    it('should unpair a server successfully', async () => {
      req.params.tunnelId = 'test_config';

      fs.existsSync
        .mockReturnValueOnce(true) // config file exists
        .mockReturnValueOnce(true) // pub key exists
        .mockReturnValueOnce(true) // private key exists
        .mockReturnValueOnce(true); // config file exists for deletion

      execSync.mockReturnValue('Clé publique supprimée avec succès.');

      await pairingControllers.unpairing(req, res);

      expect(readTunnelsConfig).toHaveBeenCalledWith('test_config');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join(__dirname, '../src/configs/key', 'test_config_key.pub'),
        'utf-8'
      );
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('grep -vF'),
        { stdio: 'inherit' }
      );
      expect(fs.unlinkSync).toHaveBeenCalledTimes(3); // private key, pub key, config
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('Unpairing de test_config terminé'),
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle partial success if remote key deletion fails', async () => {
      req.params.tunnelId = 'test_config';

      fs.existsSync
        .mockReturnValueOnce(true) // config file
        .mockReturnValueOnce(true) // pub key
        .mockReturnValueOnce(true) // private key
        .mockReturnValueOnce(true); // config file

      execSync.mockImplementation(() => {
        throw new Error('SSH connection failed');
      });

      await pairingControllers.unpairing(req, res);

      expect(fs.unlinkSync).toHaveBeenCalledTimes(3); // continue local cleanup
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('Unpairing de test_config terminé'),
      });
      expect(logTrace).toHaveBeenCalledWith(
        expect.stringContaining('Échec de la suppression de la clé publique distante')
      );
    });

    it('should return 500 if config is invalid or missing', async () => {
      req.params.tunnelId = 'test_config';
      readTunnelsConfig.mockReturnValue(null);

      await pairingControllers.unpairing(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Configuration invalide ou incomplète'),
      });
    });

    it('should handle unexpected errors gracefully', async () => {
      req.params.tunnelId = 'test_config';
      readTunnelsConfig.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await pairingControllers.unpairing(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Erreur serveur interne lors de l\'unpairing'),
      });
    });
  });
});