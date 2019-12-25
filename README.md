# web3.js-browser
[![jsdelivr](https://data.jsdelivr.com/v1/package/gh/andy0130tw/web3.js-browser/badge)](https://www.jsdelivr.com/package/gh/andy0130tw/web3.js-browser) \
[![NPM](https://nodei.co/npm/web3.js-browser.png)](https://nodei.co/npm/web3.js-browser/)

An intent to bundle a standalone version of web3.js for browsers, because web3.js SHOULD have a 2.x minified version for dApp developers.

FYI: [web3.js#2623](https://github.com/ethereum/web3.js/issues/2623).

# tl;dr

* Download scripts in [build/](build) directory, or
* Use it as a typical [npm module](https://www.npmjs.com/package/web3.js-browser), or
* Import from CDN services like [jsDelivr](https://cdn.jsdelivr.net/gh/andy0130tw/web3.js-browser@0.2.0/build/web3.min.js).

It is recommended to **pin** this bundle **to some specific version**, because web3.js varies dramatically across versions. You may waste much time debugging on some inconsistencies like me if used naively.

# Build

```bash
git submodule init
git submodule update

# configure web3
cd web3.js
npm install
npm run build  # build web3 packages; we only need *.esm.js
cd ..

# build web3.js
yarn
npm run build
```

# Web3.js caveats

The author was not careful enough to mistake v2.0.0-alpha for v2.0.0-alpha.1. To reduce confusion, this project deserves its own semantics versioning. See the releases page for details.

## `Scrypt`
This bundle current follows **v2.0.0-alpha.1**. Current implementation deprecates `scrypt` dependency in higher versions of Node.js, likely because its lack of security. If you see the following message, it can be safely ignored.

```
WARNING in ./web3.js/packages/web3-eth-accounts/dist/web3-eth-accounts.esm.js
Module not found: Error: Can't resolve 'scrypt' in '/.../web3.js-browser/web3.js/packages/web3-eth-accounts/dist'
```

Please refer to [this commit](https://github.com/ethereum/web3.js/commit/5ec0eacc2ef653fe14f6395e7e1a2f2a5ec85c01#diff-c8c34ba606a9444fb16f52d7f80a306e) for details.
