import React,{useEffect,useRef} from 'react'

export default function HistoryDialog({children,onClose}){
 const dialog=useRef(null)
 useEffect(()=>{
  const previous=document.activeElement
  dialog.current?.querySelector('button')?.focus()
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden'
  return()=>{document.body.style.overflow=overflow;previous?.focus?.()}
 },[])
 function keys(event){
  if(event.key==='Escape')onClose()
  if(event.key==='Tab'){
   const controls=[...dialog.current.querySelectorAll('button,a[href],input,select,[tabindex="0"]')].filter(x=>!x.disabled)
   if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus()}
   else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus()}
  }
 }
 return <div className="modal-mask" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><div ref={dialog} className="modal" style={{width:'min(1100px, 95vw)'}} role="dialog" aria-modal="true" aria-label="Detail dan riwayat SDM" onKeyDown={keys}><div className="modal-main">{children}</div></div></div>
}
