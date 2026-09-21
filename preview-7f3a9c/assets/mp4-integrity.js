// Inspect the actual recorded samples without starting a second video decoder.
// Only headers/sample tables are read; mdat payloads remain in the original Blob.
// Supports flat MP4 and movie fragments produced by MediaRecorder.
const fail = message => { throw Object.assign(new Error(message), {code:'INVALID_MP4'}); };
const u32 = (v,p) => v.getUint32(p);
const u64 = (v,p) => {
  const n=u32(v,p)*4294967296+u32(v,p+4);
  if(!Number.isSafeInteger(n)) fail('MP4 integer exceeds safe range');
  return n;
};
const tag = (v,p) => String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+p,4));
function boxes(v,start=0,end=v.byteLength){
  const result=[];
  for(let p=start;p<end;){
    if(p+8>end) fail('Truncated MP4 box');
    let size=u32(v,p),header=8;
    if(size===1){if(p+16>end)fail('Truncated large MP4 box');size=u64(v,p+8);header=16;}
    if(!size)size=end-p;
    if(size<header||p+size>end)fail('Incomplete MP4 box');
    result.push({type:tag(v,p+4),start:p,data:p+header,end:p+size});p+=size;
  }
  return result;
}
const child=(v,parent,type)=>boxes(v,parent.data,parent.end).find(b=>b.type===type);
const need=(value)=>value||fail('Missing MP4 sample table');
const view=buffer=>new DataView(buffer);
const within=(ranges,start,end)=>ranges.some(r=>start>=r.start&&end<=r.end&&end>start);

function movie(v){
  const root=need(boxes(v).find(b=>b.type==='moov')),tracks=new Map();
  for(const trak of boxes(v,root.data,root.end).filter(b=>b.type==='trak')){
    const tkhd=need(child(v,trak,'tkhd')),mdia=need(child(v,trak,'mdia'));
    const mdhd=need(child(v,mdia,'mdhd')),hdlr=need(child(v,mdia,'hdlr'));
    const id=u32(v,tkhd.data+(v.getUint8(tkhd.data)===1?20:12));
    const timescale=u32(v,mdhd.data+(v.getUint8(mdhd.data)===1?20:12));
    if(!timescale)fail('Invalid MP4 timescale');
    const minf=need(child(v,mdia,'minf')),stbl=need(child(v,minf,'stbl'));
    const stsd=need(child(v,stbl,'stsd')),entry=need(boxes(v,stsd.data+8,stsd.end)[0]);
    const kind=tag(v,hdlr.data+8);
    tracks.set(id,{id,kind,timescale,stbl,codec:entry.type,
      width:kind==='vide'?v.getUint16(entry.data+24):0,
      height:kind==='vide'?v.getUint16(entry.data+26):0,
      duration:0,samples:0,first:null,last:0,bytes:0});
  }
  const mvex=child(v,root,'mvex');
  if(mvex)for(const b of boxes(v,mvex.data,mvex.end).filter(b=>b.type==='trex')){
    const t=tracks.get(u32(v,b.data+4));
    if(t){t.defaultDuration=u32(v,b.data+12);t.defaultSize=u32(v,b.data+16);}
  }
  return tracks;
}

function flatSamples(v,t,ranges){
  const stts=need(child(v,t.stbl,'stts')),stsz=need(child(v,t.stbl,'stsz'));
  let count=0,ticks=0;
  const rows=u32(v,stts.data+4);
  if(stts.data+8+rows*8>stts.end)fail('Truncated MP4 timing table');
  for(let p=stts.data+8;p<stts.data+8+rows*8;p+=8){count+=u32(v,p);ticks+=u32(v,p)*u32(v,p+4);}
  const fixed=u32(v,stsz.data+4),total=u32(v,stsz.data+8);
  if(total!==count||(!fixed&&stsz.data+12+total*4>stsz.end))fail('Incomplete MP4 sample table');
  if(!count)return;
  const offsets=need(child(v,t.stbl,'stco')||child(v,t.stbl,'co64'));
  const stsc=need(child(v,t.stbl,'stsc')),mappings=[];
  const n=u32(v,stsc.data+4);
  if(stsc.data+8+n*12>stsc.end)fail('Truncated MP4 chunk table');
  for(let p=stsc.data+8;p<stsc.data+8+n*12;p+=12)mappings.push({first:u32(v,p),count:u32(v,p+4)});
  if(!mappings.length||mappings[0].first!==1)fail('Invalid MP4 chunks');
  const chunks=u32(v,offsets.data+4),stride=offsets.type==='co64'?8:4;
  if(offsets.data+8+chunks*stride>offsets.end)fail('Truncated MP4 offsets');
  let sample=0,mapping=0;
  for(let i=1;i<=chunks;i++){
    while(mapping+1<mappings.length&&mappings[mapping+1].first<=i)mapping++;
    let bytes=0;
    for(let j=0;j<mappings[mapping].count;j++){
      if(sample>=count)fail('Invalid MP4 sample count');
      const size=fixed||u32(v,stsz.data+12+sample*4);
      if(!size)fail('Empty MP4 sample');
      bytes+=size;sample++;
    }
    const p=offsets.data+8+(i-1)*stride,start=stride===8?u64(v,p):u32(v,p);
    if(!within(ranges,start,start+bytes))fail('Missing MP4 media bytes');
    t.bytes+=bytes;
  }
  if(sample!==count)fail('Missing MP4 chunks');
  t.samples=count;t.duration=ticks/t.timescale;t.first=0;t.last=ticks;
}

function fragment(v,offset,tracks,ranges){
  const root=need(boxes(v).find(b=>b.type==='moof'));
  let previousEnd=offset;
  for(const traf of boxes(v,root.data,root.end).filter(b=>b.type==='traf')){
    const tfhd=need(child(v,traf,'tfhd')),tfdt=child(v,traf,'tfdt');
    const flags=u32(v,tfhd.data)&0xffffff,t=need(tracks.get(u32(v,tfhd.data+4)));
    let p=tfhd.data+8,base=(flags&0x20000)?offset:previousEnd;
    if(flags&1){base=u64(v,p);p+=8;}
    if(flags&2)p+=4;
    let duration=t.defaultDuration||0,size=t.defaultSize||0;
    if(flags&8){duration=u32(v,p);p+=4;}
    if(flags&16){size=u32(v,p);p+=4;}
    if(flags&32)p+=4;
    if(p>tfhd.end)fail('Truncated MP4 fragment defaults');
    let time=tfdt?(v.getUint8(tfdt.data)===1?u64(v,tfdt.data+4):u32(v,tfdt.data+4)):t.last;
    if(t.first===null)t.first=time;
    if(Math.abs(time-t.last)>t.timescale*.35&&t.samples)fail('Discontinuous MP4 recording');
    let cursor=base;
    for(const run of boxes(v,traf.data,traf.end).filter(b=>b.type==='trun')){
      const bits=u32(v,run.data)&0xffffff,count=u32(v,run.data+4);p=run.data+8;
      if(bits&1){cursor=base+v.getInt32(p);p+=4;}
      if(bits&4)p+=4;
      const start=cursor;
      for(let i=0;i<count;i++){
        const dt=bits&0x100?u32(v,p):duration;if(bits&0x100)p+=4;
        const bytes=bits&0x200?u32(v,p):size;if(bits&0x200)p+=4;
        if(bits&0x400)p+=4;
        if(bits&0x800)p+=4;
        if(!dt||!bytes||p>run.end)fail('Invalid MP4 fragment sample');
        time+=dt;cursor+=bytes;t.bytes+=bytes;t.samples++;
      }
      if(count&&!within(ranges,start,cursor))fail('Missing MP4 fragment bytes');
    }
    previousEnd=cursor;t.last=time;t.duration=(time-t.first)/t.timescale;
  }
}

export async function inspectMp4(blob,signal){
  const top=[];
  for(let p=0;p<blob.size;){
    if(signal?.aborted)throw new DOMException('Recording interrupted','AbortError');
    if(blob.size-p<8)fail('Truncated MP4 header');
    const h=view(await blob.slice(p,p+16).arrayBuffer());
    let size=u32(h,0),header=8;
    if(size===1){size=u64(h,8);header=16;}
    if(!size)size=blob.size-p;
    if(size<header||p+size>blob.size)fail('Incomplete MP4 file');
    top.push({type:tag(h,4),start:p,data:p+header,end:p+size});p+=size;
  }
  const moov=need(top.find(b=>b.type==='moov'));
  if(moov.end-moov.start>16*1024*1024)fail('MP4 metadata too large');
  const header=view(await blob.slice(moov.start,moov.end).arrayBuffer());
  const tracks=movie(header),ranges=top.filter(b=>b.type==='mdat').map(b=>({start:b.data,end:b.end}));
  for(const t of tracks.values())flatSamples(header,t,ranges);
  for(const b of top.filter(b=>b.type==='moof')){
    if(signal?.aborted)throw new DOMException('Recording interrupted','AbortError');
    if(b.end-b.start>16*1024*1024)fail('MP4 fragment metadata too large');
    fragment(view(await blob.slice(b.start,b.end).arrayBuffer()),b.start,tracks,ranges);
  }
  const video=[...tracks.values()].find(t=>t.kind==='vide');
  if(!video?.samples||!video.width||!video.height)fail('MP4 contains no video samples');
  return {duration:video.duration,width:video.width,height:video.height,
    tracks:[...tracks.values()].map(({kind,codec,duration,samples,bytes})=>({kind,codec,duration,samples,bytes}))};
}
