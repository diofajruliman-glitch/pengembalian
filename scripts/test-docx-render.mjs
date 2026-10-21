import fs from 'node:fs'
import { JSDOM } from 'jsdom'
import { renderAsync } from 'docx-preview'

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.navigator = dom.window.navigator
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.HTMLImageElement = dom.window.HTMLImageElement

const buf = fs.readFileSync('public/templates/sptjm-2026.docx')
const container = dom.window.document.getElementById('container')

try {
  await renderAsync(buf, container, container, {
    className: 'docx',
    ignoreHeight: true,
    breakPages: false,
    useBase64URL: true
  })

  const table = container.querySelector('table')
  if (table) {
    console.log('TABLE HTML:')
    console.log(table.outerHTML.slice(0, 2000))
  } else {
    console.log('No table found in container')
  }
} catch (err) {
  console.error('Render error:', err)
}
