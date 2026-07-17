const path = require('node:path');

module.exports = {
  entry: './src/portal.js',
  output: {
    filename: 'portal.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  devtool: false,
  performance: {
    hints: false,
  },
};
