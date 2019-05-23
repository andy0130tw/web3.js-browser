const path = require('path')

module.exports = {
  entry: './web3.js/packages/web3/dist/web3.esm.js',
  output: {
    path: path.resolve(__dirname, 'dist-webpack'),
    filename: 'web3.bundle.js'
  }
};
