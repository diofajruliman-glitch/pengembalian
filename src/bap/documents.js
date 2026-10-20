import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate'
import {templateData} from './model.js'
const escapeXml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;').replaceAll('\n','</w:t><w:br/><w:t xml:space="preserve">')
export async function buildWord(row,identity,answers){return fillWord('/templates/bap-2026.docx',templateData(row,identity,answers))}
export async function fillWord(path,data){
 const response=await fetch(path)
 if(!response.ok)throw Error('Template dokumen belum dapat dimuat.')
 const files=unzipSync(new Uint8Array(await response.arrayBuffer()))
 files['word/document.xml']=strToU8(strFromU8(files['word/document.xml']).replace(/\{(\w+)\}/g,(_,key)=>escapeXml(data[key]??'')))
 return new Blob([zipSync(files)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
}
export function download(blob,filename){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)
}

// Render the original Word package, then paginate its table rows to A4. A long
// answer is split to new pages before PDF capture, rather than cropped.
let previewSequence=0
export async function renderPreview(blob,target,{draftLabel}={}){
 const className=`interview-doc-${++previewSequence}`
 const {renderAsync}=await import('docx-preview')
 const source=document.createElement('div');source.className='bap-render-source';document.body.appendChild(source)
 try{
  await renderAsync(blob,source,source,{className,ignoreHeight:true,ignoreLastRenderedPageBreak:true,breakPages:false,useBase64URL:true})
  target.replaceChildren()
  source.querySelectorAll('style').forEach(s=>target.appendChild(s.cloneNode(true)))
  const original=source.querySelector(`section.${className}`),originalArticle=original?.querySelector('article')
  if(!originalArticle)throw Error('Pratinjau template belum dapat dibuat.')
  // Word's anchored letterhead can overlap subsequent titles in HTML renderers.
  // Reserve its actual image height so RAHASIA and the BAP title stay visible.
  for(const p of originalArticle.querySelectorAll(':scope > p')){
   const images=[...p.querySelectorAll('img')]
   if(images.length)p.style.minHeight=Math.ceil(Math.max(...images.map(img=>img.getBoundingClientRect().height)))+16+'px'
  }
  const wrapper=document.createElement('div');wrapper.className=`docx-wrapper ${className}-wrapper`;target.appendChild(wrapper)
  let article,page,table
  function newPage(){
   page=original.cloneNode(false);page.classList.add('bap-page');page.style.height='1122.52px';page.style.minHeight='1122.52px';page.style.width='793.7px';page.style.boxSizing='border-box';page.style.overflow='hidden'
   article=originalArticle.cloneNode(false);article.style.height=(1122.52-parseFloat(getComputedStyle(original).paddingTop)-parseFloat(getComputedStyle(original).paddingBottom))+'px';article.style.overflow='visible';page.appendChild(article);wrapper.appendChild(page);table=null
  }
  function overflow(){return article.scrollHeight>article.clientHeight+2}
  function tableFor(node){if(!table){table=node.cloneNode(false);node.querySelectorAll(':scope > colgroup').forEach(g=>table.appendChild(g.cloneNode(true)));article.appendChild(table)}return table}
  newPage()
  for(const block of originalArticle.children){
   if(block.tagName!=='TABLE'){
    table=null;const copy=block.cloneNode(true);article.appendChild(copy)
    if(overflow()&&article.children.length>1&&copy.getBoundingClientRect().height<=article.clientHeight){copy.remove();newPage();article.appendChild(copy)}
    if(overflow()){
     if(copy.tagName!=='P'||!copy.textContent)throw Error('Blok dokumen terlalu besar untuk halaman.')
     let remaining=copy.innerText,current=copy
     current.style.whiteSpace='pre-wrap'
     while(remaining){
      let low=0,high=remaining.length
      while(low<high){const mid=Math.ceil((low+high)/2);current.textContent=remaining.slice(0,mid);if(overflow())high=mid-1;else low=mid}
      if(!low)throw Error('Paragraf tidak dapat dimuat pada halaman.')
      const space=remaining.lastIndexOf(' ',low),cut=space>low*.8?space:low
      current.textContent=remaining.slice(0,cut);remaining=remaining.slice(cut)
      if(remaining){newPage();current=copy.cloneNode(false);article.appendChild(current)}
     }
    }
    continue
   }
   if(block.rows.length<20&&block.getBoundingClientRect().height<article.clientHeight){
    table=null;const copy=block.cloneNode(true);article.appendChild(copy)
    if(overflow()){copy.remove();newPage();article.appendChild(copy)}
    continue
   }
   table=null
   for(const row of block.rows){
    let copy=row.cloneNode(true);tableFor(block).appendChild(copy)
    if(!overflow())continue
    copy.remove();newPage();tableFor(block).appendChild(copy)
    if(!overflow())continue
    let cell=copy.cells[copy.cells.length-1];const text=cell.textContent
    if(!text)throw Error('Tabel belum dapat dimuat dalam satu halaman.')
    let remaining=text
    while(remaining){
     let low=0,high=remaining.length
     while(low<high){const mid=Math.ceil((low+high)/2);cell.textContent=remaining.slice(0,mid);if(overflow())high=mid-1;else low=mid}
     if(low===0)throw Error('Jawaban terlalu panjang untuk tata letak halaman.')
     // Prefer a word boundary without losing any characters.
     const space=remaining.lastIndexOf(' ',low);const cut=space>low*.8?space:low
     cell.textContent=remaining.slice(0,cut);remaining=remaining.slice(cut)
     if(remaining){newPage();copy=row.cloneNode(true);for(let i=0;i<copy.cells.length-1;i++)copy.cells[i].textContent='';tableFor(block).appendChild(copy);cell=copy.cells[copy.cells.length-1]}
    }
   }
   table=null
  }
  wrapper.querySelectorAll('.bap-page').forEach((p,i)=>{const footer=document.createElement('div');footer.className='bap-page-number';footer.textContent=`${draftLabel?draftLabel+" · ":""}${i+1}`;p.appendChild(footer)})
 }finally{source.remove()}
}
export async function buildPdf(target){
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')])
 const pages=[...target.querySelectorAll('.bap-page')]
 if(!pages.length)throw Error('Buka pratinjau terlebih dahulu.')
 const pdf=new jsPDF({unit:'mm',format:'a4'})
 for(let i=0;i<pages.length;i++){
  const canvas=await html2canvas(pages[i],{scale:1.5,backgroundColor:'#ffffff',logging:false,windowWidth:1200})
  if(i)pdf.addPage();pdf.addImage(canvas.toDataURL('image/jpeg',.95),'JPEG',0,0,210,297)
  canvas.width=0;canvas.height=0
 }
 return pdf.output('blob')
}
