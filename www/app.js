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

import { alchemize, profane, snag, listento } from 'https://cdn.jsdelivr.net/npm/html-alchemist/index.min.js'
import { default as uuid } from 'https://cdn.jsdelivr.net/npm/uuid@11.1.0/dist/esm-browser/v4.min.js'
import { default as purify } from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.es.min.mjs'
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15.0.7/lib/marked.esm.min.js'

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

const removeFromGuestbook = (become, db) =>
  (id) =>
    become(removeFromGuestbook(become, db), removeEntry(db, id))

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

const showEntry = ({ content, tags, createdAt, updatedAt }, { oneditid, ondeleteid }) => [
  'section',
  [
    'article',
    profane('p', purify.sanitize(marked(content))),
    ['hr'],
    [
      'nav',
      ['ul', ...tags.map(t => [
        'li', ['a', `#${t}`]
      ])]
    ],
    [
      'nav',
      [
        'ul',
        ['li', (new Date(createdAt)).toLocaleString()
          + (updatedAt ? ' | ' + (new Date(updatedAt)).toLocaleString() : '')]
      ],
      [
        'ul',
        ['li', [`button.secondary#${oneditid}`, 'Edit']],
        ['li', [`button.contrast#${ondeleteid}`, 'Delete']]
      ]
    ]
  ]
]

const editEntry = ({ content, tags, _rev }, { textinputid, tagsinputid, onsaveid, oncancelid }) => [
  'form',
  [
    'fieldset',
    ['label',
      _rev ? 'Edit Entry' : 'Add Entry',
      [`textarea#${textinputid}`, { placeholder: 'What happened?' }, content],
      ['small', 'Use markdown!']
    ],
    ['label',
      'Tags',
      [`input#${tagsinputid}`, { type: 'text', value: tags.join(', ') }],
      ['small', 'Comma-separated!']
    ],
    [
      'div.grid',
      [`button#${onsaveid}`, 'Save'],
      _rev ? [`button.outline.secondary#${oncancelid}`, 'Cancel'] : ''
    ]
  ]
]

// VIEWS -- THE PRISMS

async function composeEntry (node, vat, { addToGuestbook }) {
  const textinputid = uuid()
  const tagsinputid = uuid()
  const onsaveid = uuid()
  const initialdoc = { content: '', tags: [] }
  const composeoptions = { textinputid, tagsinputid, onsaveid }
  node.replaceChildren(alchemize(editEntry(initialdoc, composeoptions)))
  listento(onsaveid, 'click', async () => {
    const content = snag(textinputid).value
    const tags = snag(tagsinputid).value.split(',').map(s => s.trim())
    await vat.doPromise(() => addToGuestbook.send(content, tags))
    snag(textinputid).value = ''
    snag(tagsinputid).value = ''
  })
}

async function listEntries (node, vat, docs, { editGuestbook, removeFromGuestbook }) {
  for (const doc of docs) {
    const entryid = `guestbook-entry:${doc._id}`
    const textinputid = uuid()
    const tagsinputid = uuid()
    const onsaveid = uuid()
    const oncancelid = uuid()
    const oneditid = uuid()
    const ondeleteid = uuid()
    function refreshShow (e) {
      if (e) e.preventDefault()
      snag(entryid).replaceChildren(alchemize(
        showEntry(doc, { oneditid, ondeleteid })
      ))
      if (editGuestbook)
        listento(oneditid, 'click', refreshEdit)
      if (removeFromGuestbook)
        listento(ondeleteid, 'click', async (e) => {
          if (e) e.preventDefault()
          if (confirm("Are you sure you want to delete this entry?")) {
            await vat.doPromise(() => removeFromGuestbook.send(doc._id))
            snag(entryid).innerHTML = ''
          }
        })
    }
    function refreshEdit (e) {
      if (e) e.preventDefault()
      snag(entryid).replaceChildren(alchemize(
        editEntry(doc, { textinputid, tagsinputid, onsaveid, oncancelid })
      ))
      listento(onsaveid, 'click', async (e) => {
        e.preventDefault()
        const content = snag(textinputid).value
        const tags = snag(tagsinputid).value.split(',').map(s => s.trim())
        await vat.doPromise(() => editGuestbook.send(doc._id, content, tags))
        doc.content = content
        doc.tags = tags
        refreshShow()
      })
      listento(oncancelid, 'click', refreshShow)
    }
    node.appendChild(alchemize([`div#${entryid}`]))
    refreshShow()
  }
}

async function mainview (node, vat, mycaps) {
  node.appendChild(alchemize([
    [
      'hgroup',
      ['h1', 'A Guestbook for Goblins'],
      ['p', 'Scrawl your gibberish and share it by link.']
    ],
    ['div#compose'],
    ['hr'],
    ['div#entries']
  ]))
  composeEntry(snag('compose'), vat, mycaps)
  const docs = await vat.doPromise(() => mycaps.readGuestbook.send())
  listEntries(snag('entries'), vat, docs, mycaps)
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
      removeFromGuestbook: await vat.do(() => goblins.spawn(removeFromGuestbook, localdb)),
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
