const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { loansEnabled } = require('./webpack.flags');

module.exports = {
  mode: 'production',
  entry: {
    main: path.join(__dirname, 'src/index.jsx'),
  },
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name]-[contenthash].js',
    chunkFilename: '[name]-[contenthash].chunk.js',
    assetModuleFilename: 'assets/[name]-[contenthash][ext]',
    publicPath: '/',
    clean: true,
  },
  cache: {
    type: 'filesystem',
    /*
     * The filesystem cache is not invalidated by the environment, so a warm
     * cache served the enabled graph into a build that asked for it disabled —
     * a silent failure. Including the flag makes both directions correct.
     */
    version: `${loansEnabled}`,
    buildDependencies: {
      config: [__filename],
    },
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: { sourceMap: false },
          },
        ],
      },
      {
        test: /\.(jpe?g|png|gif|svg|webp|avif)$/,
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: 10000 } },
        generator: { filename: '[name]-[hash][ext]' },
      },
      {
        test: /\.(woff2?|eot|ttf|otf)$/,
        type: 'asset/resource',
        generator: { filename: '[name]-[hash][ext]' },
      },
    ],
  },
  resolve: {
    modules: [path.join(__dirname, 'src'), 'node_modules'],
    extensions: ['.js', '.jsx', '.css'],
    /*
     * This is what actually removes the feature's code. With `Loans` mapped to
     * webpack's empty module, the specifier never enters the module graph, so
     * the chunk disappears instead of shipping unused. Gating the lazy import
     * on a constant would keep it: webpack registers the `import()` before the
     * constant is folded.
     */
    alias: {
      ...(loansEnabled ? {} : { Loans: false }),
    },
  },
  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        reactVendor: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
          name: 'react-vendor',
          chunks: 'initial',
          priority: 30,
          enforce: true,
        },
        editorVendor: {
          test: /[\\/]node_modules[\\/](quill)[\\/]/,
          name: 'editor-vendor',
          chunks: 'async',
          priority: 20,
          enforce: true,
        },
        nonCriticalVendor: {
          test: /[\\/]node_modules[\\/](dayjs)[\\/]/,
          name: 'non-critical-vendor',
          chunks: 'async',
          priority: 15,
          enforce: true,
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks: 'initial',
          priority: 10,
          maxSize: 180000,
        },
      },
    },
    minimizer: ['...', new CssMinimizerPlugin()],
  },
  // This budget increase is intentional: the initial payload was reduced,
  // but the product still exceeds webpack's default 244 KiB hint threshold.
  // Keep these explicit budgets as a documented product decision rather than
  // relying on the implicit default warning level.
  performance: {
    hints: 'warning',
    maxEntrypointSize: 500000,
    maxAssetSize: 300000,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src/index.html'),
      favicon: path.join(__dirname, 'src/favicon.png'),
    }),
    new MiniCssExtractPlugin({
      filename: '[name]-[contenthash].css',
      chunkFilename: '[name]-[contenthash].chunk.css',
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production'),
        API_URL: JSON.stringify(process.env.API_URL || 'http://localhost:3824'),
        REACT_APP_TEMPO_TASK_KEY: JSON.stringify(process.env.REACT_APP_TEMPO_TASK_KEY || 'VIS-2'),
        REACT_APP_DEFAULT_PROJECT_ROUTE: JSON.stringify(
          process.env.REACT_APP_DEFAULT_PROJECT_ROUTE || 'board',
        ),
        REACT_APP_JIRA_BASE_URL: JSON.stringify(process.env.REACT_APP_JIRA_BASE_URL || ''),
        REACT_APP_ENABLED_LOANS: JSON.stringify(loansEnabled ? 'true' : 'false'),
      },
    }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }),
  ],
};
