export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['jest-extended/all'],
  setupFiles: ['<rootDir>/src/tests/setup/envSetup.ts'],
  globalSetup: './src/tests/setup/globalSetup.ts',
  globalTeardown: './src/tests/setup/globalTeardown.ts',
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: false,
  collectCoverageFrom: ['src/**/*.ts', '!src/tests/**'],
  coverageThreshold: {
    global: {
      lines: 70
    }
  }
};
