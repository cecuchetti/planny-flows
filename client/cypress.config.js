/* eslint-disable import/no-extraneous-dependencies, import/extensions */
const { defineConfig } = require('cypress');
const webpack = require('@cypress/webpack-preprocessor');
const webpackOptions = require('./webpack.config');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8192',
    supportFile: 'cypress/support/index.js',
    specPattern: 'cypress/integration/**/*.spec.{js,jsx,ts,tsx}',
    viewportHeight: 800,
    viewportWidth: 1440,
    env: {
      apiBaseUrl: 'http://localhost:3824',
    },
    setupNodeEvents(on, config) {
      on('file:preprocessor', webpack({ webpackOptions }));
      return config;
    },
  },
});
