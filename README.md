# web3.js-browser
An intent to bundle a standalone version of web3.js for browsers.

# Usage

```bash
git submodule update

# configure web3
cd web3.js
npm install
npm run build  # build web3 packages; we only need *.esm.js
cd ..

# build web3.js
npm run build
```
