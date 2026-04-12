const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

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
      },
    }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }),
  ],
};
