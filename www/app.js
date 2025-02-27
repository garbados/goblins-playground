/* globals Goblins, PouchDB, emit */

/**
 * The Guestbook
 * 
 * A social blogging app where users can exchange
 * blog feeds as sturdy-refs.
 * A neutral relay is used to exchange streams.
 * 
 * The intent is to demonstrate
 * Alchemist, PouchDB, and Goblins
 * in orchestration, facilitating
 * networked social applications
 * running entirely in the browser.
 */

import { alchemize, snag, listento } from 'https://cdn.jsdelivr.net/npm/html-alchemist/index.min.js'
import { default as uuid } from 'https://cdn.jsdelivr.net/npm/uuid@11.1.0/dist/esm-browser/v4.min.js'

// DATABASE PREAMBLE

const DDOC = {
  _id: '_design/guestbook',
  views: {
    archive: {
      map: function archive (doc) {
        if (doc.type === 'guestbook-entry') {
          const rawDate = new Date(doc.createdAt)
          const rawDatetime = rawDate.toISOString()
          dateparts = rawDatetime.split('T')
          date = dateparts[0].split('-')
          const rawTime = dateparts[1].split(':')
          year = date[0]
          month = date[1]
          day = date[2]
          hour = rawTime[0]
          minute = rawTime[1]
          second = rawTime[2].split('.').slice(0, -1)
          second = second[0]
          const time = [hour, minute, second]
          const datetime = date.concat(time)
          emit(datetime)
        }
      }.toString(),
      reduce: '_count'
    },
    tags: {
      map: function tags (doc) {
        if (doc.type === 'guestbook-entry') {
          for (const tag of doc.tags) {
            emit([tag, doc['created-at']])
          }
        }
      }.toString(),
      reduce: '_count'
    }
  }
}

async function forcePut (db, doc) {
  try {
    return await db.put(doc)
  } catch (e) {
    if (e.status !== 409) throw e
    const { _rev, ...oldDoc } = await db.get(doc._id)
    if (JSON.stringify(oldDoc) !== JSON.stringify(doc)) {
      return db.put({ ...doc, _rev })
    }
  }
}

async function forceRemove (db, doc) {
  try {
    return await db.remove(doc)
  } catch (e) {
    if (e.status !== 409) throw e
    const { _id, _rev } = await db.get(doc._id)
    return db.remove({ _id, _rev })
  }
}

async function saveEntry (db, content, tags) {
  const id = `guestbook-entry:${uuid()}`
  const doc = { _id: id, content, tags, createdAt: Date.now(), type: 'guestbook-entry' }
  return db.put(doc)
}

async function updateEntry (db, id, content, tags) {
  const doc = await db.get(id)
  return forcePut(db, { ...doc, content, tags, updatedAt: Date.now() })
}

async function removeEntry (db, id) {
  return forceRemove(db, id)
}

function resToDocs ({ rows }) {
  return rows.map(({ doc }) => doc)
}

const INCLUDE_DOCS = { descending: true, include_docs: true, reduce: false }

const getDocsByTime = async (db, options = {}) =>
  resToDocs(await db.query('guestbook/archive', { ...INCLUDE_DOCS, ...options }))

const getDocsByTags = async (db, options = {}) =>
  resToDocs(await db.query('guestbook/tags', { ...INCLUDE_DOCS, ...options }))

const groupDocsByTime = async (db, options = {}) =>
  db.query('guestbook/archive', { group: true, group_level: 2, ...options })

const groupDocsByTags = async (db, options = {}) =>
  db.query('guestbook/tags', { group: true, group_level: 1, ...options })

// VAT OBJECTS -- THE RIGHTS

// 0. fn = (bcom, ...options) => (...args) => bcom(fn(bcom, ...options), result)
// 1. instantiate with vat.do(() => goblins.spawn(fn, ...options))
// 1a. this returns fnCap
// 2. invoke with await vat.doPromise(() => fnCap.send(...args))
// 2a. this returns the result of calling fn(...args)
// 2b. the vats do not need to be the same. use sturdyrefs to cross machines.

const addToGuestbook = (become, db) => 
  (content, tags) => 
    become(addToGuestbook(become, db), saveEntry(db, content, tags))

const editGuestbook = (become, db) =>
  (id, content, tags) =>
    become(editGuestbook(become, db), updateEntry(db, id, content, tags))

const readGuestbook = (become, db) =>
  (options = {}) =>
    become(readGuestbook(become, db), getDocsByTime(db, options))

const readGuestbookTags = (become, db) =>
  (options = {}) =>
    become(readGuestbookTags(become, db), getDocsByTags(db, options))

const readGuestbookArchive = (become, db) =>
  (options = {}) =>
    become(readGuestbookArchive(become, db), groupDocsByTime(db, options))

const readGuestbookArchiveTags = (become, db) =>
  (options = {}) =>
    become(readGuestbookArchiveTags(become, db), groupDocsByTags(db, options))

// TEMPLATES -- THE GARMENTS

const showEntry = ({ content, tags, createdAt, updatedAt }, { onedit, ondelete }) => [
  'section',
  ['article', content],
  // ['p', tags.join(', ')],
  ['hr', ''],
  ['div.grid',
    ['p', (new Date(createdAt)).toLocaleString()
      + (updatedAt ? ' | ' + (new Date(updatedAt)).toLocaleString() : '')],
    [`button.secondary`, { onclick: onedit }, 'Edit'],
    [`button.contrast`, { onclick: ondelete }, 'Delete']
  ]
]

const editEntry = ({ text: content, tags, _rev }, { textinputid, tagsinputid, onsave, oncancel }) => [
  'form',
  [
    'fieldset',
    ['label',
      _rev ? 'Edit Entry' : 'Log Entry',
      [`textarea#${textinputid}`, { placeholder: 'What happened?' }, content],
      ['small', 'Use Markdown!']
    ],
    ['label',
      'Tags',
      [`input#${tagsinputid}`, { type: 'text', value: tags.join(', ') }],
      ['small', 'Comma-separated!']
    ],
    [
      'div.grid',
      ['button', { onclick: onsave }, 'Save'],
      _rev ? ['button.outline.secondary', { onclick: oncancel }, 'Cancel'] : ''
    ]
  ]
]

// VIEWS -- THE PRISMS

async function mainview (node, vat, mycaps) {
  const textinputid = uuid()
  const tagsinputid = uuid()
  const onsave = async (textinputid, tagsinputid, e) => {
    e.preventDefault()
    const content = snag(textinputid).value
    const tags = snag(tagsinputid).value.split(',').map(s => s.trim())
    await vat.doPromise(() => mycaps.addToGuestbook.send(content, tags))
  }
  node.appendChild(alchemize([
    [
      'hgroup',
      ['h1', 'A Guestbook for Goblins'],
      ['p', 'Scrawl your gibberish and share it by link.']
    ],
    editEntry({ content: '', tags: [] }, { textinputid, tagsinputid, onsave: onsave.bind(null, textinputid, tagsinputid) }),
    ['hr']
  ]))
  const docs = await vat.doPromise(() => mycaps.readGuestbook.send())
  node.appendChild(alchemize(docs.map((doc) => {
    const editbuttonid = uuid()
    const deletebuttonid = uuid()
    return showEntry(doc, { editbuttonid, deletebuttonid })
  })))
}

// COMPONENTS -- MECHANISTIC INCANTATIONS

class PlaygroundApp extends HTMLElement {
  async connectedCallback () {
    const localdb = new PouchDB('goblins-guestbook')
    const ready = forcePut(localdb, DDOC)
    const goblins = await Goblins.init()
    const vat = goblins.spawnVat('playground')
    const mycaps = {
      addToGuestbook: await vat.do(() => goblins.spawn(addToGuestbook, localdb)),
      editGuestbook: await vat.do(() => goblins.spawn(editGuestbook, localdb)),
      readGuestbook: await vat.do(() => goblins.spawn(readGuestbook, localdb)),
      readGuestbookTags: await vat.do(() => goblins.spawn(readGuestbookTags, localdb)),
      readGuestbookArchive: await vat.do(() => goblins.spawn(readGuestbookArchive, localdb)),
      readGuestbookArchiveTags: await vat.do(() => goblins.spawn(readGuestbookArchiveTags, localdb))
    }
    await ready
    mainview(this, vat, mycaps)
  }
}

customElements.define('playground-app', PlaygroundApp)
