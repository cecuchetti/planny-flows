const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: path.join(__dirname, 'src/index.jsx'),
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dev'),
    publicPath: '/',
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
        use: ['style-loader', { loader: 'css-loader' }],
      },
      {
        test: /\.(jpe?g|png|gif|webp|woff2?|eot|ttf|otf|svg)$/,
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: 15000 } },
      },
    ],
  },
  resolve: {
    modules: [path.join(__dirname, 'src'), 'node_modules'],
    extensions: ['.js', '.jsx'],
  },
  devtool: 'eval-source-map',
  devServer: {
    static: path.join(__dirname, 'dev'),
    historyApiFallback: true,
    hot: true,
    port: 8192,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:3824',
        pathRewrite: { '^/api': '' },
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.API_URL': JSON.stringify(process.env.API_URL || 'http://localhost:3824'),
      'process.env.REACT_APP_TEMPO_TASK_KEY': JSON.stringify(
        process.env.REACT_APP_TEMPO_TASK_KEY || 'VIS-2',
      ),
      'process.env.REACT_APP_DEFAULT_PROJECT_ROUTE': JSON.stringify(
        process.env.REACT_APP_DEFAULT_PROJECT_ROUTE || 'board',
      ),
      'process.env.REACT_APP_JIRA_BASE_URL': JSON.stringify(
        process.env.REACT_APP_JIRA_BASE_URL || '',
      ),
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src/index.html'),
      favicon: path.join(__dirname, 'src/favicon.png'),
    }),
  ],
};
