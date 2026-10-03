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
  const root=need(boxes(header).find(b=>b.type==='moov')),mvhd=need(child(header,root,'mvhd'));
  const movieScale=u32(header,mvhd.data+(header.getUint8(mvhd.data)===1?20:12));
  if(!movieScale)fail('Invalid movie timescale');
  const video=[...tracks.values()].find(t=>t.kind==='vide');
  if(!video?.samples||!video.width||!video.height)fail('MP4 contains no video samples');
  return {duration:video.duration,width:video.width,height:video.height,
    movieDuration:durationField(header,mvhd).value/movieScale,
    startTime:(video.first||0)/video.timescale,
    tracks:[...tracks.values()].map(({id,kind,codec,duration,samples,bytes,first,timescale})=>
      ({id,kind,codec,duration,samples,bytes,timescale,startTime:(first||0)/timescale}))};
}


const interrupted=signal=>{
  if(signal?.aborted)throw new DOMException('Recording interrupted','AbortError');
};
const write64=(v,p,n)=>{
  if(!Number.isSafeInteger(n)||n<0)fail('Invalid MP4 timestamp');
  v.setUint32(p,Math.floor(n/4294967296));v.setUint32(p+4,n>>>0);
};
const durationField=(v,b)=>{
  const wide=v.getUint8(b.data)===1;
  const p=b.data+(b.type==='tkhd'?(wide?28:20):b.type==='mehd'?4:(wide?24:16));
  if(p+(wide?8:4)>b.end)fail('Truncated MP4 duration');
  return {p,wide,value:wide?u64(v,p):u32(v,p)};
};
const writeDuration=(v,b,value)=>{
  const {p,wide}=durationField(v,b);
  if(wide)write64(v,p,value);
  else{
    if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)fail('MP4 duration out of range');
    v.setUint32(p,value);
  }
};

// Repair only demonstrably invalid recorder timing. Keep sample payloads,
// composition offsets, chunk positions, and valid edit lists byte-for-byte.
// Blob slices avoid copying the compressed recording on memory-limited phones.
export async function normalizeMp4Timeline(blob,signal,{expectedDuration=0,videoSeconds=expectedDuration}={}){
  if(!blob?.type?.toLowerCase().startsWith('video/mp4'))return blob;
  interrupted(signal);
  if(!Number.isFinite(expectedDuration)||expectedDuration<=0)fail('Missing expected recording duration');
  const before=await inspectMp4(blob,signal);
  const top=[];
  for(let p=0;p<blob.size;){
    interrupted(signal);
    const h=view(await blob.slice(p,p+16).arrayBuffer());
    let size=u32(h,0),header=8;
    if(size===1){size=u64(h,8);header=16;}if(!size)size=blob.size-p;
    if(size<header||p+size>blob.size)fail('Incomplete MP4 file');
    top.push({type:tag(h,4),start:p,data:p+header,end:p+size});p+=size;
  }
  const moov=need(top.find(b=>b.type==='moov'));
  const buffer=await blob.slice(moov.start,moov.end).arrayBuffer(),v=view(buffer);
  const root=need(boxes(v).find(b=>b.type==='moov')),mvhd=need(child(v,root,'mvhd'));
  const movieScale=u32(v,mvhd.data+(v.getUint8(mvhd.data)===1?20:12));
  if(!movieScale)fail('Invalid MP4 movie timescale');
  const meta=new Map(),changedParts=[];
  let changed=false;
  for(const trak of boxes(v,root.data,root.end).filter(b=>b.type==='trak')){
    const tkhd=need(child(v,trak,'tkhd')),mdia=need(child(v,trak,'mdia'));
    const mdhd=need(child(v,mdia,'mdhd')),hdlr=need(child(v,mdia,'hdlr'));
    const id=u32(v,tkhd.data+(v.getUint8(tkhd.data)===1?20:12));
    const t=need(before.tracks.find(t=>t.id===id));
    meta.set(id,{trak,tkhd,mdhd,track:t});
    if(t.kind!=='vide'||top.some(b=>b.type==='moof')||t.duration<=expectedDuration+.75)continue;
    const minf=need(child(v,mdia,'minf')),stbl=need(child(v,minf,'stbl')),stts=need(child(v,stbl,'stts'));
    const rows=u32(v,stts.data+4);
    if(rows<2)continue;
    const last=stts.data+8+(rows-1)*8,count=u32(v,last),duration=u32(v,last+4);
    // A single trailing still can have a wrapped/absurd duration. Require the
    // preceding frames to cover the actual visual content before repairing it.
    if(count!==1||(duration<0x80000000&&t.duration<=Math.max(expectedDuration*2,expectedDuration+5)))continue;
    const prefixTicks=Math.round(t.duration*t.timescale)-duration,prefix=prefixTicks/t.timescale;
    const remainder=Math.round(expectedDuration*t.timescale)-prefixTicks;
    if(prefix<videoSeconds-.35||prefix>expectedDuration||remainder<1||remainder>0xffffffff)continue;
    v.setUint32(last+4,remainder);
    t.duration=(prefixTicks+remainder)/t.timescale;changed=true;
  }

  // A shared device-clock origin must be removed equally from audio and video;
  // rebasing each track separately would discard their relative start offset.
  const active=before.tracks.filter(t=>t.samples);
  const origin=Math.min(...active.map(t=>t.startTime));
  if(top.some(b=>b.type==='moof')&&origin>expectedDuration+.75){
    if(top.some(b=>b.type==='sidx'||b.type==='mfra'))fail('Indexed MP4 timeline cannot be repaired safely');
    for(const {trak,track:t} of meta.values()){
      const edts=child(v,trak,'edts'),elst=edts&&child(v,edts,'elst');
      if(!elst)continue;
      const wide=v.getUint8(elst.data)===1,count=u32(v,elst.data+4),stride=wide?20:12;
      if(elst.data+8+count*stride>elst.end)fail('Truncated MP4 edit list');
      for(let i=0,p=elst.data+8;i<count;i++,p+=stride){
        const time=wide?v.getBigInt64(p+8):BigInt(v.getInt32(p+4));
        if(time>BigInt(Math.round((expectedDuration+.75)*t.timescale)))fail('Ambiguous MP4 edit-list clock origin');
      }
    }
    for(const moof of top.filter(b=>b.type==='moof')){
      interrupted(signal);
      const part=await blob.slice(moof.start,moof.end).arrayBuffer(),fv=view(part);
      const fr=need(boxes(fv).find(b=>b.type==='moof'));let partChanged=false;
      for(const traf of boxes(fv,fr.data,fr.end).filter(b=>b.type==='traf')){
        const tfhd=need(child(fv,traf,'tfhd')),tfdt=child(fv,traf,'tfdt');
        if(!tfdt)fail('Missing MP4 fragment timestamp');
        const t=need(meta.get(u32(fv,tfhd.data+4))).track;
        const wide=fv.getUint8(tfdt.data)===1,p=tfdt.data+4;
        const time=wide?u64(fv,p):u32(fv,p),next=time-Math.round(origin*t.timescale);
        if(next<0)fail('Invalid MP4 fragment origin');
        if(wide)write64(fv,p,next);else fv.setUint32(p,next);
        partChanged=true;
      }
      if(partChanged)changedParts.push({start:moof.start,end:moof.end,buffer:part});
    }
    for(const t of active)t.startTime-=origin;
  }

  // Leave ordinary headers and edit lists untouched. Repair only zero or
  // clearly incorrect declared lengths, using validated samples as evidence.
  let movieDuration=0;
  for(const {trak,tkhd,mdhd,track:t} of meta.values()){
    if(!t.samples)continue;
    const mediaTicks=Math.round(t.duration*t.timescale);
    let presentation=t.duration+t.startTime;
    const edts=child(v,trak,'edts'),elst=edts&&child(v,edts,'elst');
    if(elst){
      const wide=v.getUint8(elst.data)===1,rows=u32(v,elst.data+4),stride=wide?20:12;
      if(elst.data+8+rows*stride>elst.end)fail('Truncated MP4 edit list');
      let editTicks=0;
      for(let i=0,p=elst.data+8;i<rows;i++,p+=stride)editTicks+=wide?u64(v,p):u32(v,p);
      const editSeconds=editTicks/movieScale;
      if(editSeconds>0&&editSeconds<=expectedDuration+.75)presentation=editSeconds;
      else if(rows===1&&editSeconds>expectedDuration+.75){
        const p=elst.data+8,time=wide?v.getBigInt64(p+8):BigInt(v.getInt32(p+4));
        const rateAt=p+(wide?16:8);
        if(time<0n||fvRate(v,rateAt)!==1)fail('Unsupported invalid MP4 edit list');
        if(top.some(b=>b.type==='moof'))fail('Unsupported invalid fragmented MP4 edit list');
        const minf=need(child(v,need(child(v,trak,'mdia')),'minf')),stbl=need(child(v,minf,'stbl'));
        const end=flatPresentationEnd(v,stbl);
        presentation=Math.max(0,(end-Number(time))/t.timescale);
        const ticks=Math.round(presentation*movieScale);
        if(wide)write64(v,p,ticks);else v.setUint32(p,ticks);
        changed=true;
      }else if(editSeconds>expectedDuration+.75)fail('Unsupported invalid MP4 edit list');
    }
    const trackTicks=Math.round(presentation*movieScale);
    for(const [b,ticks,scale] of [[mdhd,mediaTicks,t.timescale],[tkhd,trackTicks,movieScale]]){
      const declared=durationField(v,b).value;
      if(!declared||Math.abs(declared/scale-ticks/scale)>.75){writeDuration(v,b,ticks);changed=true;}
    }
    movieDuration=Math.max(movieDuration,trackTicks);
  }
  const mvex=child(v,root,'mvex'),mehd=mvex&&child(v,mvex,'mehd');
  for(const b of [mvhd,mehd].filter(Boolean)){
    const declared=durationField(v,b).value;
    if(!declared||Math.abs(declared/movieScale-movieDuration/movieScale)>.75){
      writeDuration(v,b,movieDuration);changed=true;
    }
  }
  interrupted(signal);
  if(changed)changedParts.push({start:moov.start,end:moov.end,buffer});
  if(!changedParts.length)return blob;
  changedParts.sort((a,b)=>a.start-b.start);
  const parts=[];let cursor=0;
  for(const p of changedParts){parts.push(blob.slice(cursor,p.start),p.buffer);cursor=p.end;}
  parts.push(blob.slice(cursor));
  return new Blob(parts,{type:blob.type});
}
const fvRate=(v,p)=>v.getInt16(p)+v.getUint16(p+2)/65536;


// The displayed end uses PTS (DTS + ctts), not decode duration alone.
// Walk run-length tables together without expanding them into sample arrays.
function flatPresentationEnd(v,stbl){
  const stts=need(child(v,stbl,'stts')),ctts=child(v,stbl,'ctts');
  const timingRows=u32(v,stts.data+4),compositionRows=ctts?u32(v,ctts.data+4):0;
  if(ctts&&ctts.data+8+compositionRows*8>ctts.end)fail('Truncated MP4 composition table');
  let ci=0,remaining=0,offset=0,dts=0,end=0;
  for(let ti=0,p=stts.data+8;ti<timingRows;ti++,p+=8){
    let count=u32(v,p);const delta=u32(v,p+4);
    while(count){
      if(ctts&&!remaining){
        if(ci>=compositionRows)fail('Incomplete MP4 composition table');
        const cp=ctts.data+8+ci++*8;remaining=u32(v,cp);
        offset=v.getUint8(ctts.data)===1?v.getInt32(cp+4):u32(v,cp+4);
        if(!remaining)fail('Empty MP4 composition run');
      }
      const n=ctts?Math.min(count,remaining):count;
      end=Math.max(end,dts+n*delta+offset);dts+=n*delta;count-=n;
      if(ctts)remaining-=n;
    }
  }
  if(ctts&&(remaining||ci!==compositionRows))fail('Invalid MP4 composition count');
  return end;
}
