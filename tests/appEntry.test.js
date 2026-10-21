import test from 'node:test'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'

test('application entry evaluates its menus and mounts the React root',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url))
 const previousDocument=globalThis.document
 globalThis.document={getElementById:id=>({id})}
 const server=await createServer({
  root,configFile:false,mode:'production',logLevel:'silent',envPrefix:'APP_ENTRY_TEST_',
  resolve:{alias:{'react-dom/client':'virtual:capture-root-mount'}},
  server:{middlewareMode:true,hmr:false,watch:null},
  plugins:[{
   name:'capture-root-mount',enforce:'pre',
   resolveId:id=>id==='virtual:capture-root-mount'?'\0capture-root-mount':null,
   load:id=>id==='\0capture-root-mount'?`
    export let mounted;
    export function createRoot(node){return {render(element){mounted={node,element}}}}
   `:null
  }]
 })
 try{
  await server.ssrLoadModule('/src/main.jsx')
  const {mounted}=await server.ssrLoadModule('virtual:capture-root-mount')
  assert.equal(mounted.node.id,'root')
  assert.equal(mounted.element.type.name,'App')
 }finally{
  await server.close()
  if(previousDocument===undefined)delete globalThis.document
  else globalThis.document=previousDocument
 }
})
