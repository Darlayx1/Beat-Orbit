import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioTransport, DEFAULT_AUDIO_SETTINGS, loadAudioSettings, makeDemoAudio, sanitizeAudioSettings, waveform } from '../src/audio';

class Source {
  buffer:unknown;onended:(()=>void)|null=null;active=false;startedAt=0;offset=0;
  connect(){}disconnect(){}
  start(at:number,offset:number){this.active=true;this.startedAt=at;this.offset=offset;}
  stop(){this.active=false;}
}
class MockContext {
  static latest:MockContext;
  state='running';currentTime=0;sampleRate=48000;destination={};onstatechange?:()=>void;sources:Source[]=[];
  decoded={duration:10,length:480000,numberOfChannels:2,getChannelData:()=>new Float32Array([0,.5,-.9,.2])};
  constructor(){MockContext.latest=this;}
  createGain(){return{gain:{value:1,setTargetAtTime(){}},connect(){}};}
  createBufferSource(){const source=new Source();this.sources.push(source);return source;}
  async resume(){this.state='running';}
  async close(){this.state='closed';}
  async decodeAudioData(){return this.decoded;}
}
beforeEach(()=>vi.stubGlobal('AudioContext',MockContext));
afterEach(()=>vi.unstubAllGlobals());
class ToneContext extends MockContext {
  oscillators=0;stopped=0;
  createGain(){return{gain:{value:1,setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
  createOscillator(){const ctx=this;ctx.oscillators++;return{type:'',frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){ctx.stopped++;}};}
  createBiquadFilter(){return{type:'',frequency:{value:0},Q:{value:0},connect(){}};}
  createBuffer(){return{getChannelData:()=>new Float32Array(16)};}
}
describe('audio settings and sound effects',()=>{
  it('clamps invalid values, keeps valid ones and migrates the old master volume',()=>{
    const clean=sanitizeAudioSettings({master:5,music:-1,offsetMs:999,hitPreset:'nope' as never,muted:true});
    expect(clean).toMatchObject({master:1,music:0,offsetMs:200,hitPreset:DEFAULT_AUDIO_SETTINGS.hitPreset,muted:true});
    vi.stubGlobal('localStorage',{getItem:(key:string)=>key==='beatorbit-volume'?'0.3':null,setItem(){}});
    expect(loadAudioSettings()).toMatchObject({master:.3,sfx:DEFAULT_AUDIO_SETTINGS.sfx});
  });
  it('persists settings changes',()=>{
    const store=new Map<string,string>();
    vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v)});
    const audio=new AudioTransport();audio.updateSettings({sfx:.25,hitPreset:'synth',offsetMs:-30});
    expect(JSON.parse(store.get('beatorbit-audio-settings')!)).toMatchObject({sfx:.25,hitPreset:'synth',offsetMs:-30});
    expect(loadAudioSettings()).toMatchObject({sfx:.25,hitPreset:'synth',offsetMs:-30});
  });
  it('synthesises hits, wrong presses and hold sustain locally, and honours mute and sustain toggles',()=>{
    vi.stubGlobal('AudioContext',ToneContext);
    const audio=new AudioTransport(),ctx=()=>MockContext.latest as ToneContext;
    audio.sfx.hit('perfect',0);expect(ctx().oscillators).toBeGreaterThan(0);
    const before=ctx().oscillators;audio.sfx.hit('wrong',1);expect(ctx().oscillators-before).toBe(2);
    audio.sfx.startHold('note',2);const started=ctx().oscillators;expect(started).toBeGreaterThan(before+2);
    audio.sfx.stopHold('note');expect(ctx().stopped).toBeGreaterThan(0);
    audio.updateSettings({holdSustain:false});audio.sfx.startHold('other',0);expect(ctx().oscillators).toBe(started);
    audio.updateSettings({muted:true});audio.sfx.hit('perfect',0);audio.sfx.ui('click');expect(ctx().oscillators).toBe(started);
  });
  it('never throws when the audio context cannot synthesise',()=>{
    const audio=new AudioTransport();
    expect(()=>{audio.sfx.hit('good',0);audio.sfx.startHold('x',0);audio.sfx.gradeUp(2);audio.sfx.fanfare('S');}).not.toThrow();
  });
});
describe('audio clock and source lifecycle',()=>{
  it('loads audio and derives time from the audio clock rather than frames',async()=>{
    const audio=new AudioTransport();await audio.load(new Blob(['audio']));await audio.play();
    MockContext.latest.currentTime=1.75;expect(audio.nowMs).toBe(1750);
    audio.pause();MockContext.latest.currentTime=8;expect(audio.nowMs).toBe(1750);audio.dispose();
  });
  it('seek and repeated restarts leave only one active source',async()=>{
    const audio=new AudioTransport();await audio.load(new Blob(['audio']));await audio.play();
    await audio.seek(4000);expect(audio.nowMs).toBe(4000);
    await audio.play(0);await audio.play(0);
    expect(MockContext.latest.sources.filter(s=>s.active)).toHaveLength(1);
    audio.stop();expect(MockContext.latest.sources.filter(s=>s.active)).toHaveLength(0);
  });
  it('maps event timestamps into the audio clock and accounts for dispatch delay',async()=>{
    const audio=new AudioTransport();await audio.load(new Blob(['audio']));await audio.play();
    MockContext.latest.currentTime=1;
    const now=vi.spyOn(performance,'now').mockReturnValue(5000);
    expect(audio.eventTimeMs(4980)).toBe(980);
    expect(audio.eventTimeMs(performance.timeOrigin+4980)).toBeCloseTo(980);
    now.mockRestore();audio.dispose();
  });
  it('ignores stale ended callbacks from an older session',async()=>{
    const audio=new AudioTransport();await audio.load(new Blob(['audio']));await audio.play();
    const ended=MockContext.latest.sources[0].onended,callback=vi.fn();audio.onEnded=callback;
    await audio.play(2000);ended?.();expect(audio.isPlaying).toBe(true);expect(callback).not.toHaveBeenCalled();audio.dispose();
  });
  it('does not start after stop cancels an outstanding resume',async()=>{
    const audio=new AudioTransport();await audio.load(new Blob(['audio']));
    const request=audio.play();audio.stop();await request;
    expect(audio.isPlaying).toBe(false);expect(MockContext.latest.sources).toHaveLength(0);
  });
  it('rejects empty, damaged, and oversized decoded audio',async()=>{
    const audio=new AudioTransport();
    await expect(audio.decode(new Blob())).rejects.toThrow(/empty/);
    const ctx=audio.ctx as unknown as MockContext;vi.spyOn(ctx,'decodeAudioData').mockRejectedValueOnce(new Error('bad'));
    await expect(audio.decode(new Blob(['bad']))).rejects.toThrow(/codec/);
    ctx.decoded.length=48000*600;
    await expect(audio.decode(new Blob(['large']))).rejects.toThrow(/memory/);
  });
  it('bounds waveform output and derives it from actual PCM samples',()=>{
    const buffer={length:8,getChannelData:()=>new Float32Array([0,.5,-.9,.2,0,.2,-.4,.1])} as unknown as AudioBuffer;
    const peaks=waveform(buffer,2);expect(peaks).toHaveLength(2);expect(peaks[0]).toBeCloseTo(.9);expect(peaks[1]).toBeCloseTo(.4);
  });
  it('creates playable PCM WAV demo headers without remote assets',async()=>{
    const blob=makeDemoAudio(120,1),bytes=new DataView(await blob.arrayBuffer());
    expect(blob.type).toBe('audio/wav');expect(bytes.getUint32(24,true)).toBe(16000);expect(bytes.getUint16(22,true)).toBe(1);expect(bytes.getUint32(40,true)).toBe(32000);
  });
});
