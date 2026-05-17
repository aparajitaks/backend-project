export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['jest-extended/all'],
  globalSetup: './src/tests/setup/globalSetup.ts',
  globalTeardown: './src/tests/setup/globalTeardown.ts',
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.ts', '!src/tests/**'],
  coverageThreshold: {
    global: {
      lines: 70
    }
  }
};
