import test from 'node:test'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'

test('BAP module loading recovers safely from missing deployment assets',async t=>{
 const server=await createServer({
  root:fileURLToPath(new URL('../',import.meta.url)),
  configFile:false,mode:'production',logLevel:'silent',
  server:{middlewareMode:true,hmr:false,watch:null},
  plugins:[{
   name:'recovery-test-renderer',
   resolveId:id=>id==='virtual:recovery-test-renderer'?'\0recovery-test-renderer':null,
   load:id=>id==='\0recovery-test-renderer'?`
    export {Children,createElement} from 'react';
    export {renderToStaticMarkup} from 'react-dom/server';
   `:null
  }]
 })
 const previousWindow=globalThis.window
 let reloads=0
 globalThis.window={location:{reload(){reloads++}}}
 try{
  const {loadModuleWithRecovery,ModuleReloadNotice}=await server.ssrLoadModule('/src/moduleRecovery.jsx')
  const React=await server.ssrLoadModule('virtual:recovery-test-renderer')
  const {renderToStaticMarkup}=React

  await t.test('a successfully loaded module is returned intact',async()=>{
   const module={default:()=>React.createElement('p',null,'Portal BAP'),extra:'preserved'}
   let calls=0
   const result=await loadModuleWithRecovery(async()=>{calls++;return module})
   assert.equal(result,module)
   assert.equal(calls,1)
   assert.equal(reloads,0)
  })

  await t.test('a missing JavaScript or CSS asset resolves to a renderable lazy component',async()=>{
   for(const message of [
    'Failed to fetch dynamically imported module: https://pengembalian.vercel.app/assets/docx-preview-BdP050U6.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: https://example.test/assets/portal-old.js',
    'Unable to preload CSS for /assets/portal-old.css'
   ]){
    const result=await loadModuleWithRecovery(async()=>{throw new TypeError(message)})
    assert.equal(result.default,ModuleReloadNotice)
    const markup=renderToStaticMarkup(React.createElement(result.default))
    assert.match(markup,/role="alert"/)
    assert.match(markup,/Portal BAP belum dapat dimuat/)
    assert.match(markup,/<button[^>]*>Muat ulang aplikasi<\/button>/)
    assert.equal(reloads,0,'handling and rendering a failed import must preserve the current page')
   }
  })

  await t.test('other runtime failures retain the original error',async()=>{
   const runtimeError=new Error('Cannot read properties of undefined (reading person)')
   await assert.rejects(loadModuleWithRecovery(async()=>{throw runtimeError}),error=>error===runtimeError)
   assert.equal(reloads,0)
  })

  await t.test('reload happens only when the user presses the recovery button',()=>{
   const notice=ModuleReloadNotice()
   const button=React.Children.toArray(notice.props.children).find(child=>child.type==='button')
   assert.ok(button,'recovery notice offers an explicit reload action')
   assert.equal(reloads,0)
   button.props.onClick()
   assert.equal(reloads,1)
  })
 }finally{
  await server.close()
  if(previousWindow===undefined)delete globalThis.window
  else globalThis.window=previousWindow
 }
})
