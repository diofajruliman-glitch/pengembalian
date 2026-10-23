import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate'
import {renderAsync} from 'docx-preview'
import html2canvas from 'html2canvas'
import {jsPDF} from 'jspdf'
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
async function waitForDocumentAssets(container){
 if(document.fonts?.ready)await document.fonts.ready
 await Promise.all([...container.querySelectorAll('img')].map(async img=>{
  // docx-preview uses an octet-stream MIME type for embedded Word images.
  // Give browsers a concrete type before waiting for decoding and PDF capture.
  if(img.src.startsWith('data:application/octet-stream;base64,iVBOR'))img.src=img.src.replace('data:application/octet-stream','data:image/png')
  if(img.src.startsWith('data:application/octet-stream;base64,/9j/'))img.src=img.src.replace('data:application/octet-stream','data:image/jpeg')
  if(img.decode)await img.decode()
  else if(!img.complete)await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject})
  if(!img.naturalWidth)throw Error('Gambar kop surat belum dapat dimuat. Buka ulang pratinjau.')
 }))
}
function fillAnswerLeaders(container){
 const measure=document.createElement('canvas').getContext('2d')
 for(const tab of container.querySelectorAll('[class$="-tab-stop"],.bap-answer-leader')){
  const paragraph=tab.closest('p');if(!paragraph||!paragraph.closest('td'))continue
  const pBox=paragraph.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(paragraph);range.setEndBefore(tab)
  const lines=[...range.getClientRects()].filter(r=>r.width>0),last=lines.at(-1),style=getComputedStyle(tab)
  measure.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const remaining=Math.max(0,pBox.right-(last?.right||pBox.left)-8),unit=measure.measureText('- ').width
  tab.classList.add('bap-answer-leader');tab.style.cssText='display:inline;white-space:nowrap;word-spacing:normal;text-decoration:none;'
  tab.textContent='- '.repeat(Math.max(0,Math.floor(remaining/unit)))
 }
}
let previewSequence=0
export async function renderPreview(blob,target,{draftLabel}={}){
 const className=`interview-doc-${++previewSequence}`
 const source=document.createElement('div');source.className='bap-render-source';document.body.appendChild(source)
 try{
  await renderAsync(blob,source,source,{className,ignoreHeight:true,ignoreLastRenderedPageBreak:true,breakPages:false,useBase64URL:true,experimental:true})
  await waitForDocumentAssets(source)
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
  fillAnswerLeaders(originalArticle)
  const originalFooter=original.querySelector(':scope > footer')
  const parafFooter=originalFooter?.querySelector('table')?originalFooter:null
  const sectionStyle=getComputedStyle(original),paddingTop=parseFloat(sectionStyle.paddingTop),paddingBottom=parseFloat(sectionStyle.paddingBottom)
  const footerBottom=parafFooter?Math.max(24,paddingBottom-(parseFloat(getComputedStyle(parafFooter).minHeight)||0)):0
  const bottomReserve=parafFooter?Math.max(paddingBottom,footerBottom+parafFooter.getBoundingClientRect().height+12):paddingBottom
  const wrapper=document.createElement('div');wrapper.className=`docx-wrapper ${className}-wrapper`;target.appendChild(wrapper)
  let article,page,table
  function newPage(){
   page=original.cloneNode(false);page.classList.add('bap-page');page.style.height='1122.52px';page.style.minHeight='1122.52px';page.style.width='793.7px';page.style.boxSizing='border-box';page.style.overflow='hidden'
   article=originalArticle.cloneNode(false);article.style.height=(1122.52-paddingTop-bottomReserve)+'px';article.style.overflow='visible';page.appendChild(article);wrapper.appendChild(page);table=null
  }
  function overflow(){return article.scrollHeight>article.clientHeight+2}
  function tableFor(node){if(!table){table=node.cloneNode(false);node.querySelectorAll(':scope > colgroup').forEach(g=>table.appendChild(g.cloneNode(true)));article.appendChild(table)}return table}
  newPage()
  const blocks=[...originalArticle.children]
  while(blocks.length&&blocks.at(-1).tagName==='P'&&!blocks.at(-1).textContent.trim()&&!blocks.at(-1).querySelector('img'))blocks.pop()
  for(const block of blocks){
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
    if(overflow()){
     copy.remove()
     const previous=article.lastElementChild
     const signature=copy.textContent.includes('Yang diperiksa:')&&copy.textContent.includes('Pemeriksa:')
     const date=signature&&previous?.tagName==='P'&&/\d{1,2} \p{L}+ \d{4}/u.test(previous.textContent)?previous:null
     date?.remove();newPage();if(date)article.appendChild(date);article.appendChild(copy)
    }
    continue
   }
   table=null
   const rows=[...block.rows]
   for(let rowIndex=0;rowIndex<rows.length;rowIndex++){
    const row=rows[rowIndex]
    // Preserve each short question-and-answer group as one unit. Long answers
    // still flow over pages and retain every character.
    if(rows.length===88&&rowIndex%4===0){
     const group=rows.slice(rowIndex,rowIndex+4).map(r=>r.cloneNode(true)),currentTable=tableFor(block)
     group.forEach(r=>currentTable.appendChild(r))
     const groupHeight=group.at(-1).getBoundingClientRect().bottom-group[0].getBoundingClientRect().top,needsPage=overflow()
     group.forEach(r=>r.remove())
     if(needsPage&&groupHeight<=article.clientHeight&&(currentTable.rows.length>0||article.children.length>1))newPage()
    }
    let copy=row.cloneNode(true);tableFor(block).appendChild(copy)
    if(!overflow())continue
    copy.remove();newPage();tableFor(block).appendChild(copy)
    if(!overflow())continue
    let cell=copy.cells[copy.cells.length-1]
    const tab=cell.querySelector('.bap-answer-leader,[class$="-tab-stop"]'),leader=tab?.cloneNode(true);tab?.remove()
    const text=cell.innerText
    function prepareCell(target){
     const originalP=target.querySelector('p'),p=originalP?originalP.cloneNode(false):document.createElement('p')
     const originalRun=originalP?.querySelector('span'),run=originalRun?originalRun.cloneNode(false):document.createElement('span')
     run.style.whiteSpace='pre-wrap';p.appendChild(run);target.replaceChildren(p);return run
    }
    let content=prepareCell(cell)
    if(!text)throw Error('Tabel belum dapat dimuat dalam satu halaman.')
    let remaining=text
    while(remaining){
     let low=0,high=remaining.length
     while(low<high){const mid=Math.ceil((low+high)/2);content.textContent=remaining.slice(0,mid);if(overflow())high=mid-1;else low=mid}
     if(low===0)throw Error('Jawaban terlalu panjang untuk tata letak halaman.')
     // Prefer a word boundary without losing any characters.
     const space=remaining.lastIndexOf(' ',low);const cut=space>low*.8?space:low
     content.textContent=remaining.slice(0,cut);remaining=remaining.slice(cut)
     if(remaining){newPage();copy=row.cloneNode(true);for(let i=0;i<copy.cells.length-1;i++)copy.cells[i].textContent='';tableFor(block).appendChild(copy);cell=copy.cells[copy.cells.length-1];content=prepareCell(cell)}
     else if(leader)content.parentElement.appendChild(leader)
    }
   }
   table=null
  }
  wrapper.querySelectorAll('.bap-page').forEach((p,i)=>{
   if(parafFooter){
    const footer=parafFooter.cloneNode(true);footer.classList.add('bap-paraf-footer');footer.style.cssText=`position:absolute;left:${sectionStyle.paddingLeft};right:${sectionStyle.paddingRight};bottom:${footerBottom}px;margin:0;min-height:0;`
    const pageNumber=footer.querySelector('table tr td:first-child p');if(pageNumber)pageNumber.textContent=String(i+1)
    p.appendChild(footer)
   }else{
    const footer=document.createElement('div');footer.className='bap-page-number';footer.textContent=`${draftLabel?draftLabel+" · ":""}${i+1}`;p.appendChild(footer)
   }
  })
  // Only continuation cells need their tab leader measured again after splitting.
  fillAnswerLeaders(wrapper)
  await waitForDocumentAssets(target)
 }finally{source.remove()}
}
export async function buildPdf(target){
 const pages=[...target.querySelectorAll('.bap-page')]
 if(!pages.length)throw Error('Buka pratinjau terlebih dahulu.')
 await waitForDocumentAssets(target)
 const pdf=new jsPDF({unit:'mm',format:'a4'})
 for(let i=0;i<pages.length;i++){
  const canvas=await html2canvas(pages[i],{scale:1.5,backgroundColor:'#ffffff',logging:false,windowWidth:1200})
  if(i)pdf.addPage();pdf.addImage(canvas.toDataURL('image/jpeg',.95),'JPEG',0,0,210,297)
  canvas.width=0;canvas.height=0
 }
 return pdf.output('blob')
}
