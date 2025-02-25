/* globals Goblins */

import { alchemize, snag } from 'https://cdn.jsdelivr.net/npm/html-alchemist'

function greeter (become, ourName, timesCalled) {
  return (yourName) => {
    const newTimesCalled = timesCalled + 1
    const msg = `Hello ${yourName}, my name is ${ourName}! I've been called ${newTimesCalled} times.`
    return become(greeter(become, ourName, newTimesCalled), msg)
  }
}

class PlaygroundApp extends HTMLElement {
  async connectedCallback () {
    const goblins = await Goblins.init()
    const vat = goblins.spawnVat('playground')
    const alice = await vat.do(() => goblins.spawn(greeter, 'Alice', 0))
    async function onclick () {
      const message = await vat.doPromise(() => alice.send('Bob'))
      snag('greeter').innerText = message
    }
    const message = await vat.doPromise(() => alice.send('Bob'))
    this.replaceChildren(alchemize([
      ['h1#greeter', { onclick }, message]
    ]))
  }
}

customElements.define('playground-app', PlaygroundApp)
