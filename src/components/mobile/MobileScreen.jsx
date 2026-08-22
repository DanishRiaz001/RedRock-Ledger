import { useRef, useState } from "react";
import { T } from "../../lib/theme.js";

// Full-screen mobile "page" with an iOS-style edge-swipe-to-go-back gesture
// instead of a back button/icon — start the drag within ~28px of the left
// edge and pull right past the threshold to dismiss.
export default function MobileScreen({title,subtitle,onClose,headerRight,children}){
  const[dragX,setDragX]=useState(0);
  const dragging=useRef(false);
  const valid=useRef(false);
  const startX=useRef(0);
  const startY=useRef(0);

  const onTouchStart=e=>{
    const t=e.touches[0];
    if(t.clientX>28)return;
    dragging.current=true;valid.current=true;
    startX.current=t.clientX;startY.current=t.clientY;
  };
  const onTouchMove=e=>{
    if(!dragging.current)return;
    const t=e.touches[0];
    const dx=t.clientX-startX.current, dy=t.clientY-startY.current;
    if(valid.current&&Math.abs(dy)>Math.abs(dx)*1.2){valid.current=false;setDragX(0);return;}
    if(valid.current&&dx>0)setDragX(dx);
  };
  const onTouchEnd=()=>{
    if(dragging.current&&valid.current&&dragX>90)onClose();
    else setDragX(0);
    dragging.current=false;
  };

  return(
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      style={{
        position:"fixed",inset:0,zIndex:100,background:T.bg,display:"flex",flexDirection:"column",
        transform:`translateX(${dragX}px)`,transition:dragX?"none":"transform 0.25s ease",
        boxShadow:dragX?"-16px 0 30px rgba(15,42,38,0.12)":"none",
      }}>
      <div style={{padding:"calc(env(safe-area-inset-top) + 18px) 20px 14px",flexShrink:0}}>
        <div style={{width:34,height:4,borderRadius:2,background:T.border,margin:"0 auto 14px"}}/>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:20,fontWeight:800,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
            {subtitle&&<div style={{fontSize:11.5,color:"#8A93A3",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{subtitle}</div>}
          </div>
          {headerRight&&<div style={{flexShrink:0}}>{headerRight}</div>}
        </div>
      </div>
      <div style={{flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"0 20px 30px"}}>
        {children}
      </div>
    </div>
  );
}
