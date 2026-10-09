import {unzipSync,strFromU8} from 'fflate'
// Only selected ZIP entries are expanded; hidden copies of the master are excluded.
const decode=s=>s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[v])
const attr=(s,key)=>decode(s.match(new RegExp(`(?:^|\\s)${key}="([^"]*)"`))?.[1]||'')
function entry(bytes,path){const files=unzipSync(bytes,{filter:f=>{if(f.name!==path)return false;if(f.originalSize>220*1024*1024)throw Error('Sheet terlalu besar untuk pratinjau browser.');return true}});if(!files[path])throw Error('Bagian workbook tidak ditemukan: '+path);if(files[path].length>220*1024*1024)throw Error('Sheet terlalu besar untuk pratinjau browser.');const xml=strFromU8(files[path]);if(xml.includes('<!DOCTYPE'))throw Error('XML workbook tidak didukung.');return xml}
export function openSnapshot(bytes){
 const workbook=entry(bytes,'xl/workbook.xml'),rels=entry(bytes,'xl/_rels/workbook.xml.rels'),links={}
 for(const m of rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g))links[attr(m[1],'Id')]=attr(m[1],'Target')
 const sheets={};for(const m of workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)){const path=links[attr(m[1],'r:id')];if(path)sheets[attr(m[1],'name')]=path.startsWith('/')?path.slice(1):'xl/'+path}
 const strings=[];const xml=entry(bytes,'xl/sharedStrings.xml');for(const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)){let text='';for(const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))text+=decode(t[1]);strings.push(text)}
 return {sheets,read(name){if(!sheets[name])throw Error('Sheet tidak ditemukan: '+name);const xml=entry(bytes,sheets[name]),rows=[]
  for(const m of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)){const number=Number(attr(m[1],'r'));if(!Number.isInteger(number)||number<1||number>1048576)throw Error('Nomor baris tidak valid.');const row=[]
   for(const c of m[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){const ref=attr(c[1],'r'),type=attr(c[1],'t');let col=0;for(const ch of ref.match(/^[A-Z]+/)?.[0]||'')col=col*26+ch.charCodeAt(0)-64;if(col<1||col>300)continue
    const value=c[2]?.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];if(value===undefined){if(type==='inlineStr'){row[col-1]=[...c[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t=>decode(t[1])).join('')}continue}
    row[col-1]=type==='s'?strings[Number(value)]:type==='e'?'#ERROR:'+decode(value):type==='str'?decode(value):Number(value)
   }
   if(row.length){while(rows.length<number)rows.push([]);rows[number-1]=row}
  }return rows
 }}
}
