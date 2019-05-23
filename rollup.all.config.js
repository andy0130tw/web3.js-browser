import fs from 'fs'
import alias from 'rollup-plugin-alias'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import globals from 'rollup-plugin-node-globals'
import cjs from 'rollup-plugin-cjs-es'
import inject from 'rollup-plugin-inject'
import includePaths from 'rollup-plugin-includepaths'
import babel from 'rollup-plugin-babel'
import json from 'rollup-plugin-json'


import _builtins from './builtins'

// for packing you also need
// xhr2-cookies websocket url-parse eventemitter3 oboe number-to-bn utf8 ethjs-unit randomhex swarm-js eth-lib scrypt.js eth-ens-namehash ethers

const packageAliases = fs.readdirSync('web3.js/packages')
  .reduce((acc, pkg) => {
    acc[pkg] = `web3.js/packages/${pkg}/dist/${pkg}.esm.js`
    return acc
  }, {})

export default {
  input: 'web3.js/packages/web3/dist/web3.esm.js',
  context: 'window',
  output: [
    { format: 'cjs', file: 'dist/web3.bundle.cjs.js', sourcemap: false },
    { format: 'umd', file: 'dist/web3.bundle.umd.js', name: 'Web3', globals: ['typeof'] },
  ],
  external: ['XMLHttpRequest', 'w3cwebsocket'],
  plugins: [
    json(),
    // builtins(),
    alias(packageAliases),
    _builtins(),
    resolve({
      browser: true,
      preferBuiltins: false,
      customResolveOptions: {
        moduleDirectory: ['includes', 'node_modules']
      },
    }),
    commonjs({
      namedExports: {
        'xhr2-cookies': ['XMLHttpRequest'],
        // 'websocket/lib/browser.js': ['w3cwebsocket'],
        'includes/websocket/websocket.js': ['w3cwebsocket'],
        'swarm-js/lib/api-browser.js': ['at'],
      },
    }),
    babel({
      exclude: 'node_modules/**',
      runtimeHelpers: true,
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
          'helpers': true,
          'regenerator': true,
        }]
      ]
    }),
    // cjs({
    //   nested: true,
    // }),
    // use global in case of name conflicts
    // ref. https://github.com/rollup/rollup/issues/1743#issuecomment-349432759
    globals(),
  ]
}
