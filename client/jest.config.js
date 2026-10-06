module.exports = {
  moduleFileExtensions: ['*', 'js', 'jsx'],
  moduleDirectories: ['src', 'node_modules'],
  /*
   * Without this, Jest's default testMatch also collects cypress/integration,
   * and `npm run test:jest` fails on every Cypress global instead of running the
   * unit tests. Cypress has its own runner; the two must not share a glob.
   */
  testPathIgnorePatterns: ['/node_modules/', '/cypress/', '/build/'],
  testMatch: ['<rootDir>/src/**/*.test.{js,jsx}'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/jest/fileMock.js',
    '\\.(css|scss|less)$': '<rootDir>/jest/styleMock.js',
  },
};
