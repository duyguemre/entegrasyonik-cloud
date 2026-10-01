var path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './entegrasyonik.ts',
  target: 'node',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
/*   externals: [nodeExternals()], // Node.js modüllerini dışarıda tutar
 */  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist')
  }
};