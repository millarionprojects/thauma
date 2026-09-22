import {Muxer,ArrayBufferTarget} from './vendor/mp4-muxer.min.mjs';

const fail=message=>{throw Object.assign(new Error(message),{code:'REMUX_FAILED'});};
const u16=(v,p)=>v.getUint16(p);
const u32=(v,p)=>v.getUint32(p);
const i32=(v,p)=>v.getInt32(p);
const u64=(v,p)=>{
  const n=u32(v,p)*4294967296+u32(v,p+4);
  if(!Number.isSafeInteger(n))fail('MP4 integer exceeds safe range');
  return n;
};
const tag=(v,p)=>String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+p,4));
function boxes(v,start=0,end=v.byteLength){
  const out=[];
  for(let p=start;p<end;){
    if(p+8>end)fail('Truncated MP4 box');
    let size=u32(v,p),header=8;
    if(size===1){if(p+16>end)fail('Truncated large MP4 box');size=u64(v,p+8);header=16;}
    if(!size)size=end-p;
    if(size<header||p+size>end)fail('Invalid MP4 box');
    out.push({type:tag(v,p+4),start:p,data:p+header,end:p+size,size});
    p+=size;
  }
  return out;
}
const child=(v,b,type,start=b.data)=>boxes(v,start,b.end).find(x=>x.type===type);
const need=(x,msg='Missing MP4 structure')=>x||fail(msg);

function timescaleOf(v,mdhd){
  const version=v.getUint8(mdhd.data);
  return u32(v,mdhd.data+(version===1?20:12));
}
function handlerOf(v,hdlr){return tag(v,hdlr.data+8);}

function expandTiming(v,box,signed=false){
  if(!box)return [];
  const version=v.getUint8(box.data);
  const rows=u32(v,box.data+4),out=[];
  if(box.data+8+rows*8>box.end)fail('Truncated MP4 timing table');
  for(let p=box.data+8,i=0;i<rows;i++,p+=8){
    const count=u32(v,p);
    const value=signed||version===1?i32(v,p+4):u32(v,p+4);
    for(let n=0;n<count;n++)out.push(value);
  }
  return out;
}
function sampleSizes(v,stsz){
  const fixed=u32(v,stsz.data+4),count=u32(v,stsz.data+8),out=new Array(count);
  if(fixed){out.fill(fixed);return out;}
  if(stsz.data+12+count*4>stsz.end)fail('Truncated MP4 sample sizes');
  for(let i=0;i<count;i++)out[i]=u32(v,stsz.data+12+i*4);
  return out;
}
function chunkOffsets(v,box){
  const count=u32(v,box.data+4),stride=box.type==='co64'?8:4,out=[];
  if(box.data+8+count*stride>box.end)fail('Truncated MP4 chunk offsets');
  for(let i=0;i<count;i++)out.push(stride===8?u64(v,box.data+8+i*stride):u32(v,box.data+8+i*stride));
  return out;
}
function stscEntries(v,stsc){
  const count=u32(v,stsc.data+4),out=[];
  if(stsc.data+8+count*12>stsc.end)fail('Truncated MP4 chunk map');
  for(let i=0,p=stsc.data+8;i<count;i++,p+=12){
    out.push({first:u32(v,p),per:u32(v,p+4),description:u32(v,p+8)});
  }
  if(!out.length||out[0].first!==1)fail('Invalid MP4 chunk map');
  return out;
}
function syncSet(v,stss,total){
  if(!stss)return null;
  const count=u32(v,stss.data+4),set=new Set();
  if(stss.data+8+count*4>stss.end)fail('Truncated MP4 sync table');
  for(let i=0;i<count;i++)set.add(u32(v,stss.data+8+i*4)-1);
  return set;
}
function buildTrack(v,trak,buffer){
  const mdia=need(child(v,trak,'mdia')),mdhd=need(child(v,mdia,'mdhd')),hdlr=need(child(v,mdia,'hdlr'));
  const kind=handlerOf(v,hdlr);
  if(kind!=='vide'&&kind!=='soun')return null;
  const timescale=timescaleOf(v,mdhd);
  if(!timescale)fail('Invalid MP4 timescale');
  const minf=need(child(v,mdia,'minf')),stbl=need(child(v,minf,'stbl'));
  const stsd=need(child(v,stbl,'stsd')),entry=need(boxes(v,stsd.data+8,stsd.end)[0]);
  const stts=need(child(v,stbl,'stts')),stsz=need(child(v,stbl,'stsz'));
  const stsc=need(child(v,stbl,'stsc')),co=need(child(v,stbl,'stco')||child(v,stbl,'co64'));
  const sizes=sampleSizes(v,stsz),durations=expandTiming(v,stts);
  if(durations.length!==sizes.length)fail('MP4 sample timing mismatch');
  const composition=child(v,stbl,'ctts')?expandTiming(v,child(v,stbl,'ctts')):new Array(sizes.length).fill(0);
  if(composition.length&&composition.length!==sizes.length)fail('MP4 composition timing mismatch');
  const sync=syncSet(v,child(v,stbl,'stss'),sizes.length);
  const chunks=chunkOffsets(v,co),maps=stscEntries(v,stsc);
  const samples=[];let sample=0,map=0,dts=0;
  for(let chunk=1;chunk<=chunks.length;chunk++){
    while(map+1<maps.length&&maps[map+1].first<=chunk)map++;
    let offset=chunks[chunk-1];
    for(let n=0;n<maps[map].per;n++){
      if(sample>=sizes.length)fail('Too many samples in MP4 chunks');
      const size=sizes[sample];
      if(offset<0||offset+size>buffer.byteLength)fail('MP4 sample outside media data');
      samples.push({
        offset,size,duration:durations[sample],composition:composition[sample]||0,
        sync:sync?sync.has(sample):true,dts
      });
      dts+=durations[sample];offset+=size;sample++;
    }
  }
  if(sample!==sizes.length)fail('Missing MP4 samples');

  if(kind==='vide'&&samples.length>1){
    const previous=samples[samples.length-2].duration||Math.max(1,Math.round(timescale/30));
    const last=samples[samples.length-1];
    if(last.duration>=0x80000000||last.duration>Math.max(previous*8,timescale*.5))last.duration=previous;
  }

  if(kind==='vide'){
    if(entry.type!=='avc1'&&entry.type!=='avc3')fail('Unsupported video codec for remux');
    const width=u16(v,entry.data+24),height=u16(v,entry.data+26);
    const avcC=need(child(v,entry,'avcC',entry.data+78),'Missing AVC decoder config');
    const cfg=new Uint8Array(buffer,avcC.data,avcC.end-avcC.data);
    const hx=n=>n.toString(16).padStart(2,'0').toUpperCase();
    const codec=cfg.length>=4?`avc1.${hx(cfg[1])}${hx(cfg[2])}${hx(cfg[3])}`:'avc1.42E01F';
    const nominal=samples.length?samples[Math.min(1,samples.length-1)].duration:Math.max(1,Math.round(timescale/30));
    const frameRate=Math.max(1,Math.round(timescale/nominal));
    return {kind,timescale,samples,width,height,frameRate,codec,avcConfig:new Uint8Array(cfg)};
  }

  if(entry.type!=='mp4a')fail('Unsupported audio codec for remux');
  const channels=u16(v,entry.data+16)||2;
  const sampleRate=(u32(v,entry.data+24)>>>16)||timescale;
  return {kind,timescale,samples,channels,sampleRate};
}

export async function remuxSafariMp4(blob,signal){
  if(!blob?.type?.toLowerCase().startsWith('video/mp4'))return blob;
  if(signal?.aborted)throw new DOMException('Recording interrupted','AbortError');
  if(blob.size>128*1024*1024)fail('MP4 too large to remux');
  const buffer=await blob.arrayBuffer();
  if(signal?.aborted)throw new DOMException('Recording interrupted','AbortError');
  const v=new DataView(buffer),top=boxes(v);
  if(top.some(b=>b.type==='moof'))return blob; // Safari short exports are flat; keep other platforms untouched.
  const moov=need(top.find(b=>b.type==='moov'));
  const tracks=boxes(v,moov.data,moov.end).filter(b=>b.type==='trak').map(t=>buildTrack(v,t,buffer)).filter(Boolean);
  const video=tracks.find(t=>t.kind==='vide'),audio=tracks.find(t=>t.kind==='soun');
  if(!video)fail('MP4 has no video track');

  const target=new ArrayBufferTarget();
  const muxer=new Muxer({
    target,
    video:{codec:'avc',width:video.width,height:video.height,frameRate:video.frameRate},
    audio:audio?{codec:'aac',numberOfChannels:audio.channels,sampleRate:audio.sampleRate}:undefined,
    fastStart:'in-memory',
    firstTimestampBehavior:'strict'
  });

  let vi=0,ai=0,videoMetaSent=false;
  const us=(ticks,scale)=>Math.max(0,Math.round(ticks*1e6/scale));
  while(vi<video.samples.length||(audio&&ai<audio.samples.length)){
    if(signal?.aborted)throw new DOMException('Recording interrupted','AbortError');
    const vs=vi<video.samples.length?video.samples[vi]:null;
    const as=audio&&ai<audio.samples.length?audio.samples[ai]:null;
    const vd=vs?vs.dts/video.timescale:Infinity;
    const ad=as?as.dts/audio.timescale:Infinity;
    if(vd<=ad){
      const pts=us(vs.dts+vs.composition,video.timescale);
      const dts=us(vs.dts,video.timescale);
      const meta=!videoMetaSent?{decoderConfig:{
        codec:video.codec,codedWidth:video.width,codedHeight:video.height,
        description:video.avcConfig
      }}:undefined;
      muxer.addVideoChunkRaw(
        new Uint8Array(buffer,vs.offset,vs.size),
        vs.sync?'key':'delta',
        pts,
        us(vs.duration,video.timescale),
        meta,
        pts-dts
      );
      videoMetaSent=true;vi++;
    }else{
      muxer.addAudioChunkRaw(
        new Uint8Array(buffer,as.offset,as.size),
        'key',
        us(as.dts,audio.timescale),
        us(as.duration,audio.timescale)
      );
      ai++;
    }
  }
  muxer.finalize();
  if(!target.buffer?.byteLength)fail('Remux produced an empty MP4');
  return new Blob([target.buffer],{type:'video/mp4'});
}
