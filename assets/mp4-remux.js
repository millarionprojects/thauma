const fail=message=>{throw Object.assign(new Error(message),{code:'REMUX_FAILED'});};
const u32=(v,p)=>v.getUint32(p);
const u64=(v,p)=>{
  const n=u32(v,p)*4294967296+u32(v,p+4);
  if(!Number.isSafeInteger(n))fail('MP4 integer exceeds safe range');
  return n;
};
const tag=(v,p)=>String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+p,4));

function boxes(v,start=0,end=v.byteLength){
  const result=[];
  for(let p=start;p<end;){
    if(p+8>end)fail('Truncated MP4 box');
    let size=u32(v,p),header=8;
    if(size===1){
      if(p+16>end)fail('Truncated large MP4 box');
      size=u64(v,p+8);header=16;
    }
    if(!size)size=end-p;
    if(size<header||p+size>end)fail('Incomplete MP4 box');
    result.push({type:tag(v,p+4),start:p,data:p+header,end:p+size,size});
    p+=size;
  }
  return result;
}
const child=(v,parent,type)=>boxes(v,parent.data,parent.end).find(b=>b.type===type);
const need=(value,message='Missing MP4 structure')=>value||fail(message);
const within=(ranges,start,end)=>ranges.some(r=>start>=r.start&&end<=r.end&&end>start);
const movieTimescale=(v,mvhd)=>u32(v,mvhd.data+(v.getUint8(mvhd.data)===1?20:12));
const mediaTimescale=(v,mdhd)=>u32(v,mdhd.data+(v.getUint8(mdhd.data)===1?20:12));

const ascii=s=>Uint8Array.from([...s].map(c=>c.charCodeAt(0)));
const concat=parts=>{
  const size=parts.reduce((sum,part)=>sum+part.byteLength,0),out=new Uint8Array(size);
  let offset=0;
  for(const part of parts){out.set(part,offset);offset+=part.byteLength;}
  return out;
};
const be32=n=>{
  const out=new Uint8Array(4);
  new DataView(out.buffer).setUint32(0,n);
  return out;
};
const box=(type,payload=new Uint8Array())=>concat([be32(8+payload.byteLength),ascii(type),payload]);
const fullbox=(type,version,flags,payload=new Uint8Array())=>
  box(type,concat([Uint8Array.of(version,(flags>>16)&255,(flags>>8)&255,flags&255),payload]));
const raw=(bytes,b)=>bytes.slice(b.start,b.end);

function write64(v,p,n){
  if(!Number.isSafeInteger(n)||n<0)fail('Invalid MP4 integer');
  v.setUint32(p,Math.floor(n/4294967296));
  v.setUint32(p+4,n>>>0);
}
function patchDuration(source,type,value){
  const out=source.slice(),v=new DataView(out.buffer,out.byteOffset,out.byteLength),version=v.getUint8(8);
  let p;
  if(type==='mvhd'||type==='mdhd')p=8+(version===1?24:16);
  else if(type==='tkhd')p=8+(version===1?28:20);
  else return out;
  if(version===1)write64(v,p,value);
  else{
    if(value>0xffffffff)fail('MP4 duration exceeds version 0 range');
    v.setUint32(p,value);
  }
  return out;
}
function compress(values){
  const rows=[];
  for(const value of values){
    const last=rows[rows.length-1];
    if(last&&last[1]===value)last[0]++;
    else rows.push([1,value]);
  }
  return rows;
}
function runBox(type,rows,signed=false){
  const parts=[be32(rows.length)];
  for(const [count,value] of rows){
    parts.push(be32(count),be32(value>>>0));
  }
  return fullbox(type,signed?1:0,0,concat(parts));
}

function parseTrack(v,bytes,trak,index,ranges){
  const tkhd=need(child(v,trak,'tkhd')),mdia=need(child(v,trak,'mdia'));
  const mdhd=need(child(v,mdia,'mdhd')),hdlr=need(child(v,mdia,'hdlr'));
  const kind=tag(v,hdlr.data+8);
  if(kind!=='vide'&&kind!=='soun')return null;
  const timescale=mediaTimescale(v,mdhd);
  if(!timescale)fail('Invalid MP4 timescale');

  const minf=need(child(v,mdia,'minf')),stbl=need(child(v,minf,'stbl'));
  const stsd=need(child(v,stbl,'stsd')),stts=need(child(v,stbl,'stts'));
  const stsz=need(child(v,stbl,'stsz')),stsc=need(child(v,stbl,'stsc'));
  const offsets=need(child(v,stbl,'stco')||child(v,stbl,'co64'));

  const durations=[];
  let rows=u32(v,stts.data+4);
  if(stts.data+8+rows*8>stts.end)fail('Truncated MP4 timing table');
  for(let p=stts.data+8,i=0;i<rows;i++,p+=8){
    const count=u32(v,p),duration=u32(v,p+4);
    for(let j=0;j<count;j++)durations.push(duration);
  }

  const fixed=u32(v,stsz.data+4),count=u32(v,stsz.data+8),sizes=[];
  if(!fixed&&stsz.data+12+count*4>stsz.end)fail('Truncated MP4 sample sizes');
  for(let i=0;i<count;i++)sizes.push(fixed||u32(v,stsz.data+12+i*4));
  if(sizes.length!==durations.length)fail('MP4 sample timing mismatch');

  const mappings=[];
  rows=u32(v,stsc.data+4);
  if(stsc.data+8+rows*12>stsc.end)fail('Truncated MP4 chunk map');
  for(let p=stsc.data+8,i=0;i<rows;i++,p+=12){
    mappings.push({first:u32(v,p),per:u32(v,p+4)});
  }
  if(!mappings.length||mappings[0].first!==1)fail('Invalid MP4 chunk map');

  const chunkCount=u32(v,offsets.data+4),stride=offsets.type==='co64'?8:4,positions=[];
  if(offsets.data+8+chunkCount*stride>offsets.end)fail('Truncated MP4 chunk offsets');
  let sample=0,mapping=0;
  for(let chunk=1;chunk<=chunkCount;chunk++){
    while(mapping+1<mappings.length&&mappings[mapping+1].first<=chunk)mapping++;
    let pos=stride===8?u64(v,offsets.data+8+(chunk-1)*stride):u32(v,offsets.data+8+(chunk-1)*stride);
    for(let j=0;j<mappings[mapping].per;j++){
      if(sample>=sizes.length)fail('Too many MP4 samples');
      positions.push(pos);
      pos+=sizes[sample++];
    }
  }
  if(positions.length!==sizes.length)fail('Missing MP4 samples');

  const composition=new Array(count).fill(0),ctts=child(v,stbl,'ctts');
  if(ctts){
    const version=v.getUint8(ctts.data);
    rows=u32(v,ctts.data+4);
    if(ctts.data+8+rows*8>ctts.end)fail('Truncated MP4 composition table');
    let sampleIndex=0;
    for(let p=ctts.data+8,i=0;i<rows;i++,p+=8){
      const n=u32(v,p),offset=version===1?v.getInt32(p+4):u32(v,p+4);
      for(let j=0;j<n;j++)composition[sampleIndex++]=offset;
    }
    if(sampleIndex!==count)fail('Invalid MP4 composition count');
  }

  const stss=child(v,stbl,'stss');
  let sync=null;
  if(stss){
    sync=new Set();
    rows=u32(v,stss.data+4);
    if(stss.data+8+rows*4>stss.end)fail('Truncated MP4 sync table');
    for(let i=0;i<rows;i++)sync.add(u32(v,stss.data+8+i*4));
  }

  let dts=0;
  const samples=[];
  for(let i=0;i<count;i++){
    const start=positions[i],end=start+sizes[i];
    if(!within(ranges,start,end))fail('MP4 sample outside media data');
    samples.push({
      track:index,index:i+1,offset:start,size:sizes[i],duration:durations[i],
      dts,composition:composition[i],sync:sync?sync.has(i+1):true,timescale
    });
    dts+=durations[i];
  }

  // Safari occasionally writes one absurd final video-sample duration. Keep
  // every encoded frame but normalize only that clearly broken timing value.
  if(kind==='vide'&&samples.length>1){
    const previous=samples[samples.length-2].duration||Math.max(1,Math.round(timescale/30));
    const last=samples[samples.length-1];
    if(last.duration>=0x80000000||last.duration>Math.max(previous*8,timescale*.5)){
      last.duration=previous;
      dts=samples.slice(0,-1).reduce((sum,s)=>sum+s.duration,0)+last.duration;
    }
  }

  const mediaHead=need(boxes(v,minf.data,minf.end).find(b=>b.type==='vmhd'||b.type==='smhd'));
  return {
    index,kind,timescale,durationTicks:dts,samples,
    tkhd,mdhd,hdlr,mediaHead,dinf:need(child(v,minf,'dinf')),stsd
  };
}

const stts=t=>runBox('stts',compress(t.samples.map(s=>s.duration)));
const ctts=t=>{
  const values=t.samples.map(s=>s.composition);
  if(!values.some(Boolean))return new Uint8Array();
  return runBox('ctts',compress(values),values.some(v=>v<0));
};
const stss=t=>{
  if(t.kind!=='vide')return new Uint8Array();
  const values=t.samples.filter(s=>s.sync).map(s=>s.index);
  return fullbox('stss',0,0,concat([be32(values.length),...values.map(be32)]));
};
const stsc=()=>fullbox('stsc',0,0,concat([be32(1),be32(1),be32(1),be32(1)]));
const stsz=t=>fullbox('stsz',0,0,concat([
  be32(0),be32(t.samples.length),...t.samples.map(s=>be32(s.size))
]));
const stco=(t,base,relative)=>fullbox('stco',0,0,concat([
  be32(t.samples.length),
  ...t.samples.map(s=>{
    const offset=base+relative.get(s.track+':'+s.index);
    if(offset>0xffffffff)fail('MP4 chunk offset exceeds 32-bit range');
    return be32(offset);
  })
]));

export async function remuxSafariMp4(blob,signal){
  if(!blob?.type?.toLowerCase().startsWith('video/mp4'))return blob;
  if(signal?.aborted)throw new DOMException('Recording interrupted','AbortError');
  if(blob.size>128*1024*1024)fail('MP4 too large to remux');

  const buffer=await blob.arrayBuffer();
  if(signal?.aborted)throw new DOMException('Recording interrupted','AbortError');
  const v=new DataView(buffer),bytes=new Uint8Array(buffer),top=boxes(v);

  // The problematic iPhone MediaRecorder output is a flat MP4. Do not alter
  // unrelated fragmented MP4 output from other browsers.
  if(top.some(b=>b.type==='moof'))return blob;

  const ftyp=need(top.find(b=>b.type==='ftyp')),moov=need(top.find(b=>b.type==='moov'));
  const ranges=top.filter(b=>b.type==='mdat').map(b=>({start:b.data,end:b.end}));
  if(!ranges.length)fail('Missing MP4 media data');

  const mvhd=need(child(v,moov,'mvhd')),movieScale=movieTimescale(v,mvhd);
  if(!movieScale)fail('Invalid movie timescale');

  const sourceTracks=[];
  for(const trak of boxes(v,moov.data,moov.end).filter(b=>b.type==='trak')){
    const mdia=need(child(v,trak,'mdia')),hdlr=need(child(v,mdia,'hdlr')),kind=tag(v,hdlr.data+8);
    if(kind==='vide'||kind==='soun')sourceTracks.push(trak);
  }
  const tracks=sourceTracks.map((trak,index)=>parseTrack(v,bytes,trak,index,ranges)).filter(Boolean);
  if(!tracks.some(t=>t.kind==='vide'))fail('MP4 has no video track');

  // One sample per chunk makes the rebuilt sample tables deterministic. Media
  // bytes are copied byte-for-byte; only the MP4 container is regenerated.
  const all=tracks.flatMap(t=>t.samples);
  all.sort((a,b)=>a.dts/a.timescale-b.dts/b.timescale||
    ((tracks[a.track].kind==='soun'?0:1)-(tracks[b.track].kind==='soun'?0:1))||
    a.index-b.index);

  const relative=new Map();
  let payloadSize=0;
  for(const sample of all){
    relative.set(sample.track+':'+sample.index,payloadSize);
    payloadSize+=sample.size;
  }
  if(payloadSize+8>0xffffffff)fail('MP4 media data too large');

  const ftypRaw=raw(bytes,ftyp);
  const buildMoov=payloadBase=>{
    const rebuiltTracks=[];
    let movieDuration=0;
    for(const track of tracks){
      const seconds=track.durationTicks/track.timescale;
      const trackMovieDuration=Math.max(1,Math.round(seconds*movieScale));
      movieDuration=Math.max(movieDuration,trackMovieDuration);

      const tkhd=patchDuration(raw(bytes,track.tkhd),'tkhd',trackMovieDuration);
      const mdhd=patchDuration(raw(bytes,track.mdhd),'mdhd',track.durationTicks);
      const sampleTable=box('stbl',concat([
        raw(bytes,track.stsd),stts(track),ctts(track),stss(track),
        stsc(),stsz(track),stco(track,payloadBase,relative)
      ]));
      const minf=box('minf',concat([
        raw(bytes,track.mediaHead),raw(bytes,track.dinf),sampleTable
      ]));
      const mdia=box('mdia',concat([mdhd,raw(bytes,track.hdlr),minf]));
      rebuiltTracks.push(box('trak',concat([tkhd,mdia])));
    }
    const movieHeader=patchDuration(raw(bytes,mvhd),'mvhd',movieDuration);
    return box('moov',concat([movieHeader,...rebuiltTracks]));
  };

  const provisional=buildMoov(0);
  const payloadBase=ftypRaw.byteLength+provisional.byteLength+8;
  const rebuiltMoov=buildMoov(payloadBase);
  if(rebuiltMoov.byteLength!==provisional.byteLength)fail('Unstable MP4 remux layout');

  const output=new Uint8Array(ftypRaw.byteLength+rebuiltMoov.byteLength+8+payloadSize);
  let p=0;
  output.set(ftypRaw,p);p+=ftypRaw.byteLength;
  output.set(rebuiltMoov,p);p+=rebuiltMoov.byteLength;
  output.set(be32(8+payloadSize),p);
  output.set(ascii('mdat'),p+4);
  p+=8;

  for(const sample of all){
    if(signal?.aborted)throw new DOMException('Recording interrupted','AbortError');
    output.set(bytes.subarray(sample.offset,sample.offset+sample.size),p);
    p+=sample.size;
  }

  return new Blob([output],{type:'video/mp4'});
}
