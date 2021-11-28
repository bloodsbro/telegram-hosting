const path = require('path');
const DotenvFlow = require('dotenv-flow-webpack');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ]
  },
  entry: {
    index: './src/index.ts',
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  devtool: 'source-map',
  target: 'node', // in order to ignore built-in modules like path, fs, etc.
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: '/node_modules/'
      },
    ]
  },
  plugins: [
    new DotenvFlow()
  ],
  externals: [
    nodeExternals()
  ],
};
