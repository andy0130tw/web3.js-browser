const fs = require('fs')

const deps = fs.readdirSync('web3.js/packages')
  .reduce((acc, pkg) => {
    const deps = require(`./web3.js/packages/${pkg}/package.json`).dependencies
    Object.entries(deps)
      .forEach(([key, verspec]) => {
        if (key.indexOf('web3-') == 0)
          return
        if (['@babel/runtime',
             '@types/node',
             '@types/bn.js'].indexOf(key) >= 0)
          return

        if (acc.hasOwnProperty(key) && acc[key] != verspec) {
          console.warn(`Version conflict: ${key}, ${acc[key]} vs. ${verspec}, skipping`)
          return
        }
        acc[key] = verspec
      })
    return acc
  }, {})

console.log(Object.entries(deps).map(([key, ver]) => `${key}@${ver}`).join(' '))
