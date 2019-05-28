const path = require('path')

const babelConfig = {
  presets: [
    [
      '@babel/env',
      {
        modules: false,
        useBuiltIns: 'usage',
        corejs: 3,
      }
    ]
  ],
  plugins: [
    '@babel/plugin-proposal-export-default-from',
    '@babel/plugin-proposal-export-namespace-from',
    ['@babel/plugin-transform-runtime', {
      helpers: true,
      regenerator: true,
      useESModules: true,
    }]
  ]
}

module.exports = {
  entry: './src/web3.js',
  resolve: {
    mainFields: ['module', 'browser', 'main'],
    modules: [
      'web3.js/packages',
      // only resolve from project root, preventing version conflict of
      // dependencies in different web3-* packages
      path.resolve(__dirname, 'node_modules')
    ],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'web3.js',
    library: 'Web3',
    libraryTarget: 'var',
    libraryExport: 'default',
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: babelConfig,
        }
      }
    ]
  }
}
