import { useRef } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'

export function ModalSurface({titleId,className='account-modal',busy=false,onClose,children}:{titleId:string;className?:string;busy?:boolean;onClose:()=>void;children:ReactNode}){
  const dialog=useRef<HTMLDivElement>(null)
  function keyDown(event:KeyboardEvent<HTMLDivElement>){
    if(event.key==='Escape'&&!busy){event.stopPropagation();onClose();return}
    if(event.key!=='Tab')return
    const items=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
    if(!items?.length)return
    const first=items[0]!,last=items[items.length-1]!
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  function backdrop(event:MouseEvent<HTMLDivElement>){if(event.target===event.currentTarget&&!busy)onClose()}
  return <div className="account-modal-backdrop" onMouseDown={backdrop}><div className={className} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog} onKeyDown={keyDown}>{children}</div></div>
}
