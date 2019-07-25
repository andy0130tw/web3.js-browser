# web3.js-browser
An intent to bundle a standalone version of web3.js for browsers.

# Usage

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

## `Scrypt`
This bundle current follows **v2.0.0-alpha.1**. Current implementation deprecates `scrypt` dependency in higher versions of Node.js, likely because its lack of security. If you see the following message, it can be safely ignored.

```
WARNING in ./web3.js/packages/web3-eth-accounts/dist/web3-eth-accounts.esm.js
Module not found: Error: Can't resolve 'scrypt' in '/.../web3.js-browser/web3.js/packages/web3-eth-accounts/dist'
```

Please refer to [this commit](https://github.com/ethereum/web3.js/commit/5ec0eacc2ef653fe14f6395e7e1a2f2a5ec85c01#diff-c8c34ba606a9444fb16f52d7f80a306e) for details.
