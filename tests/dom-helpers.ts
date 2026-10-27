import { vi } from 'vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
export class DOMAudioContext {
  static latest: DOMAudioContext;
  state='running';currentTime=0;sampleRate=16000;destination={};onstatechange?:()=>void;
  sources: {active:boolean;onended:(()=>void)|null;stop:()=>void}[]=[];
  constructor(){DOMAudioContext.latest=this;}
  createGain(){return {gain:{value:1,setTargetAtTime(){}},connect(){}};}
  createBufferSource(){
    const source={active:false,onended:null as (()=>void)|null,buffer:undefined,connect(){},disconnect(){},start(){this.active=true;},stop(){this.active=false;}};
    this.sources.push(source);return source;
  }
  async resume(){this.state='running';}
  async close(){this.state='closed';}
  async decodeAudioData(raw:ArrayBuffer){
    const v=new DataView(raw);
    if(raw.byteLength<44||v.getUint32(0)!==0x52494646)throw new Error('Bad WAV');
    const length=v.getUint32(40,true)/2,rate=v.getUint32(24,true);
    return buffer(length/rate,rate);
  }
}
export function buffer(duration=10,rate=16000){
  return{duration,length:duration*rate,numberOfChannels:1,sampleRate:rate,getChannelData:()=>new Float32Array(duration*rate)} as unknown as AudioBuffer;
}
export function domSetup(){
  vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('File',NodeFile);
  vi.stubGlobal('AudioContext',DOMAudioContext);
  vi.stubGlobal('Audio',class{duration=2;preload='';onloadedmetadata?:()=>void;onerror?:()=>void;set src(_value:string){queueMicrotask(()=>this.onloadedmetadata?.());}removeAttribute(){}load(){}});
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  const frames:FrameRequestCallback[]=[];
  vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.push(fn);return frames.length;});
  vi.stubGlobal('cancelAnimationFrame',()=>{});
  // Canvas 2D mock: any drawing call is a no-op, gradients expose addColorStop.
  const store: Record<string|symbol, unknown> = {};
  const ctx = new Proxy(store, { get:(target,key)=>key in target?target[key]:(key==='createLinearGradient'||key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}), set:(target,key,value)=>{target[key]=value;return true;} });
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({x:0,y:0,left:0,top:0,width:800,height:350,right:800,bottom:350,toJSON(){}} as DOMRect);
  Object.defineProperty(HTMLElement.prototype,'clientWidth',{configurable:true,get:()=>800});
  Object.defineProperty(HTMLElement.prototype,'setPointerCapture',{configurable:true,value:()=>{}});
  Object.defineProperty(HTMLElement.prototype,'hasPointerCapture',{configurable:true,value:()=>false});
  URL.createObjectURL=()=> 'blob:fixture';URL.revokeObjectURL=()=>{};
  document.body.innerHTML='<div id="app"></div><div id="modal-root"></div><div id="toast"></div><div id="mount"></div>';
  return{frame:(time=0)=>{const pending=frames.splice(0);pending.forEach(fn=>fn(time));}};
}
export function pointer(target:Element,type:string,x:number,y:number){
  const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});
  Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);
}
export function click(selector:string){
  const button=document.querySelector<HTMLElement>(selector);
  if(!button)throw new Error('Missing control: '+selector);
  button.click();
}
export function change(selector:string,value:string){
  const field=document.querySelector<HTMLInputElement>(selector)!;field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));
}
