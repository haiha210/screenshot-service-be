module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js', // Exclude main entry point
    '!src/config/**', // Exclude config files
  ],
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 40,
      lines: 60,
      statements: 60,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 5000,
  verbose: true,
};
