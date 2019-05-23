// https://github.com/browserify/browserify/blob/master/lib/builtins.js

import builtins from 'browserify/lib/builtins'

const libs = new Map()

libs.set('os', require.resolve('os-browserify/browser.js'))
libs.set('stream', require.resolve('stream-browserify'))
libs.set('assert', require.resolve('assert/'))
libs.set('http', require.resolve('stream-http'))
libs.set('https', require.resolve('https-browserify'))

export default function rollupPluginBuiltins(options) {
  return {
    resolveId(importee) {
      if (importee && importee.slice(-1) === '/') {
        importee = importee.slice(0, -1)
      }

      if (builtins.hasOwnProperty(importee)) {
        return builtins[importee]
      }

      if (libs.has(importee)) {
        return libs.get(importee)
      }
    }
  }
}
