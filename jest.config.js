module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/tests/**/*.js', '**/?(*.)+(spec|test).js'], // Où chercher les fichiers de test
};