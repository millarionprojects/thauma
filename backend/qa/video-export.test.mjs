// Independent MP4 fixtures and player oracle; run by the required sharing workflow.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inspectMp4,normalizeMp4Timeline} from '../../assets/mp4-integrity.js';
import {verifyVideo,checkDuration,checkDurationRange} from '../../assets/export-integrity.js';
import {shareVideoFile,saveMessage} from '../../assets/export-save.js';

const dir=mkdtempSync(join(tmpdir(),'thauma-export-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
const fixtures={};
const encode=(name,args=[])=>{
  const path=join(dir,name+'.mp4');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x288:rate=30',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-preset','ultrafast',
    '-bf','2','-g','30','-video_track_timescale','600','-c:a','aac',...args,path]);
  const bytes=readFileSync(path);
  return fixtures[name]={path,bytes,blob:new Blob([bytes],{type:'video/mp4'})};
};
encode('flat'); // moov at EOF: fixture mutations cannot move media payload offsets.
encode('fragmented',['-movflags','+frag_keyframe+empty_moov+default_base_moof+skip_trailer']);
encode('indexed',['-movflags','+frag_keyframe+empty_moov+default_base_moof']);
const probe=path=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8'}));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(name,blob)=>blob.arrayBuffer().then(buffer=>{
  const path=join(dir,name+'.mp4');writeFileSync(path,new Uint8Array(buffer));return path;
});
function boxes(bytes,start=0,end=bytes.length){
  const list=[];
  for(let p=start;p<end;){
    const size=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8);
    assert.ok(size>=8&&p+size<=end);list.push({type,start:p,data:p+8,end:p+size});p+=size;
  }
  return list;
}
const child=(bytes,parent,type)=>boxes(bytes,parent.data,parent.end).find(b=>b.type===type);
const moovTracks=bytes=>{
  const root=boxes(bytes).find(b=>b.type==='moov');
  return boxes(bytes,root.data,root.end).filter(b=>b.type==='trak').map(trak=>{
    const mdia=child(bytes,trak,'mdia'),hdlr=child(bytes,mdia,'hdlr'),mdhd=child(bytes,mdia,'mdhd');
    const version=bytes[mdhd.data],scale=bytes.readUInt32BE(mdhd.data+(version===1?20:12));
    const kind=bytes.toString('ascii',hdlr.data+8,hdlr.data+12);
    const tkhd=child(bytes,trak,'tkhd'),id=bytes.readUInt32BE(tkhd.data+(bytes[tkhd.data]===1?20:12));
    const stbl=child(bytes,child(bytes,mdia,'minf'),'stbl');
    return {trak,mdia,tkhd,mdhd,kind,scale,id,stbl};
  });
};
const payloads=bytes=>boxes(bytes).filter(b=>b.type==='mdat').map(b=>hash(bytes.subarray(b.data,b.end)));
const encodedHashes=path=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_packets','-show_data_hash','sha256',
  '-show_entries','packet=stream_index,data_hash','-of','json',path],{encoding:'utf8'})).packets;
const decodedFrames=path=>execFileSync('ffmpeg',['-v','error','-i',path,'-map','0:v:0','-vsync','0','-f','framemd5','-'],{encoding:'utf8'})
  .split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>line.split(',').slice(-2).join(',').trim());
const decodedAudio=path=>hash(execFileSync('ffmpeg',['-v','error','-i',path,'-map','0:a:0','-f','s16le','-acodec','pcm_s16le','-']));
const boxBytes=(bytes,type)=>moovTracks(bytes).map(t=>child(bytes,t.stbl,type)).filter(Boolean).map(b=>hash(bytes.subarray(b.start,b.end)));
const edits=bytes=>moovTracks(bytes).map(t=>child(bytes,t.trak,'edts')).filter(Boolean).map(b=>hash(bytes.subarray(b.start,b.end)));

// Split the VIDEO timing table, never scan arbitrary byte strings or alter
// the audio stts. Updating ancestor sizes is safe because moov is at EOF.
function finalTail(source,delta){
  const video=moovTracks(source).find(t=>t.kind==='vide'),stts=child(source,video.stbl,'stts');
  const oldRows=source.readUInt32BE(stts.data+4),last=stts.data+8+(oldRows-1)*8;
  const count=source.readUInt32BE(last),normal=source.readUInt32BE(last+4);assert.ok(count>1);
  const result=Buffer.concat([source.subarray(0,last),Buffer.alloc(16),source.subarray(last+8)]);
  result.writeUInt32BE(count-1,last);result.writeUInt32BE(normal,last+4);
  result.writeUInt32BE(1,last+8);result.writeUInt32BE(delta,last+12);
  result.writeUInt32BE(oldRows+1,stts.data+4);
  const root=boxes(source).find(b=>b.type==='moov'),minf=child(source,video.mdia,'minf');
  for(const b of [root,video.trak,video.mdia,minf,video.stbl,stts])result.writeUInt32BE(b.end-b.start+8,b.start);
  return new Blob([result],{type:'video/mp4'});
}
function damageHeaders(source){
  const bytes=Buffer.from(source),root=boxes(bytes).find(b=>b.type==='moov'),mvhd=child(bytes,root,'mvhd');
  for(const b of [mvhd,...moovTracks(bytes).flatMap(t=>[t.tkhd,t.mdhd])]){
    assert.equal(bytes[b.data],0);
    bytes.writeUInt32BE(0x7fffffff,b.data+(b.type==='tkhd'?20:16));
  }
  return new Blob([bytes],{type:'video/mp4'});
}
function shiftFragments(source,seconds,audioOffset=0){
  const bytes=Buffer.from(source),tracks=new Map(moovTracks(bytes).map(t=>[t.id,t]));
  for(const moof of boxes(bytes).filter(b=>b.type==='moof')){
    for(const traf of boxes(bytes,moof.data,moof.end).filter(b=>b.type==='traf')){
      const tfhd=child(bytes,traf,'tfhd'),tfdt=child(bytes,traf,'tfdt'),track=tracks.get(bytes.readUInt32BE(tfhd.data+4));
      const add=BigInt(Math.round((seconds+(track.kind==='soun'?audioOffset:0))*track.scale));
      if(bytes[tfdt.data]===1)bytes.writeBigUInt64BE(bytes.readBigUInt64BE(tfdt.data+4)+add,tfdt.data+4);
      else bytes.writeUInt32BE(bytes.readUInt32BE(tfdt.data+4)+Number(add),tfdt.data+4);
    }
  }
  return new Blob([bytes],{type:'video/mp4'});
}
for(const [name,{blob,path}] of Object.entries(fixtures)){
  test(name+': encoded video duration agrees with independent ffprobe',async()=>{
    const result=await verifyVideo(blob,3,undefined,{audioSeconds:3}),video=probe(path).streams.find(s=>s.codec_type==='video');
    assert.ok(Math.abs(result.tracks.find(t=>t.kind==='vide').duration-Number(video.duration))<.03);
    assert.equal(result.width,160);assert.equal(result.height,288);
    assert.equal(result.tracks.find(t=>t.kind==='vide').samples,90);
    assert.equal(result.tracks.find(t=>t.kind==='soun').codec,'mp4a');
  });
}
test('normal flat movie is byte-identical, including AAC priming and B-frame offsets',async()=>{
  const b=fixtures.flat.blob,fixed=await normalizeMp4Timeline(b,undefined,{expectedDuration:3});
  assert.equal(fixed,b);
});
test('both lower and upper duration bounds are enforced',()=>{
  assert.equal(checkDuration(18.9,18.8),18.9);
  assert.equal(checkDurationRange(25.4,6.45,25.4),25.4);
  for(const actual of [5.8,26.3])assert.throws(()=>checkDurationRange(actual,6.45,25.4),{code:'INCOMPLETE_VIDEO'});
  assert.throws(()=>checkDuration(7158294.75,15.9),{code:'INCOMPLETE_VIDEO'});
});
test('repairs a single absurd trailing frame, preserving every encoded packet and decoded frame/audio',async()=>{
  const source=fixtures.flat,broken=await finalTail(source.bytes,600*60);
  assert.ok((await inspectMp4(broken)).duration>60);
  await assert.rejects(verifyVideo(broken,3,undefined,{audioSeconds:3}),{code:'INCOMPLETE_VIDEO'});
  const brokenPath=await save('broken-tail',broken);
  const packets=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v','-show_packets',
    '-show_entries','packet=duration_time','-of','json',brokenPath],{encoding:'utf8'})).packets;
  assert.ok(Number(packets.at(-1).duration_time)>59);
  const fixed=await normalizeMp4Timeline(broken,undefined,{expectedDuration:3});
  const result=await verifyVideo(fixed,3,undefined,{audioSeconds:3});
  assert.ok(Math.abs(result.duration-3)<.05);
  const fixedPath=await save('fixed-tail',fixed),bytes=readFileSync(fixedPath);
  assert.ok(Math.abs(Number(probe(fixedPath).format.duration)-3)<.05);
  assert.equal(fixed.size,broken.size);
  assert.deepEqual(payloads(bytes),payloads(source.bytes));
  assert.deepEqual(boxBytes(bytes,'ctts'),boxBytes(source.bytes,'ctts'));
  assert.deepEqual(boxBytes(bytes,'stco'),boxBytes(source.bytes,'stco'));
  assert.deepEqual(edits(bytes),edits(source.bytes));
  assert.deepEqual(encodedHashes(fixedPath),encodedHashes(source.path));
  assert.deepEqual(decodedFrames(fixedPath),decodedFrames(source.path));
  assert.equal(decodedAudio(fixedPath),decodedAudio(source.path));
  const again=await normalizeMp4Timeline(fixed,undefined,{expectedDuration:3});
  assert.deepEqual(new Uint8Array(await again.arrayBuffer()),new Uint8Array(await fixed.arrayBuffer()));
});
test('repairs a wrapped unsigned final duration without altering samples',async()=>{
  const broken=finalTail(fixtures.flat.bytes,0x80000010);
  assert.ok((await inspectMp4(broken)).duration>1e6);
  const fixed=await normalizeMp4Timeline(broken,undefined,{expectedDuration:3});
  assert.ok(Math.abs((await verifyVideo(fixed,3)).duration-3)<.05);
  assert.deepEqual(payloads(Buffer.from(await fixed.arrayBuffer())),payloads(fixtures.flat.bytes));
});
test('repairs oversized movie/track headers even when sample timing is valid',async()=>{
  const broken=damageHeaders(fixtures.flat.bytes);
  const path=await save('bad-headers',broken);assert.ok(Number(probe(path).format.duration)>1e6);
  const fixed=await normalizeMp4Timeline(broken,undefined,{expectedDuration:3}),fixedPath=await save('fixed-headers',fixed);
  assert.ok(Math.abs(Number(probe(fixedPath).format.duration)-3)<.05);
  assert.deepEqual(encodedHashes(fixedPath),encodedHashes(fixtures.flat.path));
});
test('a legitimate long final hold is preserved and a short recording is never stretched',async()=>{
  const held=finalTail(fixtures.flat.bytes,600*2);
  const actual=await inspectMp4(held);
  assert.ok(actual.duration>4.8&&actual.duration<5);
  // Match headers and edit duration independently, as a normal recorder would.
  const bytes=Buffer.from(await held.arrayBuffer()),root=boxes(bytes).find(b=>b.type==='moov'),mvhd=child(bytes,root,'mvhd');
  const scale=bytes.readUInt32BE(mvhd.data+12),movieTicks=Math.round(actual.duration*scale);
  bytes.writeUInt32BE(movieTicks,mvhd.data+16);
  const video=moovTracks(bytes).find(t=>t.kind==='vide');
  bytes.writeUInt32BE(movieTicks,video.tkhd.data+20);
  bytes.writeUInt32BE(Math.round(actual.duration*video.scale),video.mdhd.data+16);
  const edts=child(bytes,video.trak,'edts'),elst=child(bytes,edts,'elst');
  bytes.writeUInt32BE(movieTicks,elst.data+8);
  const valid=new Blob([bytes],{type:'video/mp4'});
  assert.equal(await normalizeMp4Timeline(valid,undefined,{expectedDuration:actual.duration}),valid);
  const short=await normalizeMp4Timeline(fixtures.flat.blob,undefined,{expectedDuration:25});
  assert.equal(short,fixtures.flat.blob);
  await assert.rejects(verifyVideo(short,25),{code:'INCOMPLETE_VIDEO'});
});
test('common device-clock rebase preserves relative A/V origin and compressed bytes',async()=>{
  const broken=shiftFragments(fixtures.fragmented.bytes,10000,.125),before=await inspectMp4(broken);
  assert.ok(before.startTime>9999);
  const fixed=await normalizeMp4Timeline(broken,undefined,{expectedDuration:3}),after=await inspectMp4(fixed);
  assert.ok(after.startTime<.1);
  const difference=result=>result.tracks.find(t=>t.kind==='soun').startTime-result.tracks.find(t=>t.kind==='vide').startTime;
  assert.ok(Math.abs(difference(before)-.125)<.002);
  assert.ok(Math.abs(difference(after)-.125)<.002);
  assert.deepEqual(payloads(Buffer.from(await fixed.arrayBuffer())),payloads(fixtures.fragmented.bytes));
  const fixedPath=await save('fixed-origin',fixed);
  assert.ok(Number(probe(fixedPath).format.duration)<3.3);
  assert.deepEqual(encodedHashes(fixedPath),encodedHashes(fixtures.fragmented.path));
  await verifyVideo(fixed,3,undefined,{audioSeconds:3});
});
test('indexed anomalous origins fail explicitly rather than corrupt seek indexes',async()=>{
  await assert.rejects(normalizeMp4Timeline(shiftFragments(fixtures.indexed.bytes,10000),undefined,{expectedDuration:3}),{code:'INVALID_MP4'});
});
test('longer audio determines the displayed whole movie duration',async()=>{
  const path=join(dir,'long-audio.mp4');
  execFileSync('ffmpeg',['-v','error','-i',fixtures.flat.path,'-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=5',
    '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac',path]);
  const blob=new Blob([readFileSync(path)],{type:'video/mp4'});
  assert.equal(await normalizeMp4Timeline(blob,undefined,{expectedDuration:5,videoSeconds:3}),blob);
  const result=await verifyVideo(blob,5,undefined,{audioSeconds:5,videoSeconds:3});
  assert.ok(Math.abs(result.duration-5)<.05);
});
test('valid delayed audio edit lists and movie headers remain intact',async()=>{
  const path=join(dir,'delayed-audio.mp4');
  execFileSync('ffmpeg',['-v','error','-i',fixtures.flat.path,'-itsoffset','1.5','-i',fixtures.flat.path,
    '-map','0:v:0','-map','1:a:0','-c','copy',path]);
  const blob=new Blob([readFileSync(path)],{type:'video/mp4'}),duration=Number(probe(path).format.duration);
  assert.ok(duration>4.4&&duration<4.6);
  assert.equal(await normalizeMp4Timeline(blob,undefined,{expectedDuration:duration,videoSeconds:3}),blob);
  const result=await verifyVideo(blob,duration,undefined,{audioSeconds:3,videoSeconds:3});
  assert.ok(Math.abs(result.duration-duration)<.03);
});
test('rejects truncated media and missing complete final fragments',async()=>{
  const source=fixtures.fragmented.blob;
  await assert.rejects(verifyVideo(source.slice(0,source.size-100,'video/mp4'),3),{code:'INVALID_MP4'});
  const bytes=fixtures.fragmented.bytes,second=boxes(bytes).filter(b=>b.type==='moof')[1];
  assert.ok(second);
  await assert.rejects(verifyVideo(new Blob([bytes.subarray(0,second.start)],{type:'video/mp4'}),3),{code:'INCOMPLETE_VIDEO'});
});
test('reads metadata without copying the entire compressed recording',async()=>{
  const source=fixtures.flat.blob;let read=0;
  const bounded={type:source.type,size:source.size,slice(start=0,end=source.size){read+=Math.min(source.size,end)-start;return source.slice(start,end);},
    arrayBuffer(){throw Error('Whole-file copy');}};
  const fixed=await normalizeMp4Timeline(bounded,undefined,{expectedDuration:3});
  assert.equal(fixed,bounded);assert.ok(read<source.size/3);
});
test('cancellation stops validation and normalization',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(inspectMp4(fixtures.flat.blob,controller.signal),{name:'AbortError'});
  await assert.rejects(normalizeMp4Timeline(fixtures.flat.blob,controller.signal,{expectedDuration:3}),{name:'AbortError'});
});
test('native sharing keeps the verified file and click activation',async()=>{
  const file=new File(['verified movie'],'gift.mp4',{type:'video/mp4'});let active=true,calls=0;
  const result=shareVideoFile(file,{canShare:data=>data.files[0]===file,share(data){
    assert.equal(active,true);assert.deepEqual(Object.keys(data),['files']);assert.equal(data.files[0],file);
    calls++;return Promise.resolve();
  }});
  active=false;assert.equal(calls,1);assert.deepEqual(await result,{status:'handed-off'});
  assert.match(saveMessage({name:'AbortError'}),/Скачать видео/);
});

test('audio may include the final recording silence after its original soundtrack',async()=>{
  const result=await verifyVideo(fixtures.flat.blob,3,undefined,{audioSeconds:1,videoSeconds:3});
  assert.ok(result.duration>=3);
});
test('does not guess timing when many video samples are malformed',async()=>{
  const bytes=Buffer.from(fixtures.flat.bytes),video=moovTracks(bytes).find(t=>t.kind==='vide');
  const stts=child(bytes,video.stbl,'stts');assert.equal(bytes.readUInt32BE(stts.data+4),1);
  bytes.writeUInt32BE(36000,stts.data+12);
  const broken=new Blob([bytes],{type:'video/mp4'});
  const fixed=await normalizeMp4Timeline(broken,undefined,{expectedDuration:3});
  await assert.rejects(verifyVideo(fixed,3),{code:'INCOMPLETE_VIDEO'});
  assert.deepEqual(payloads(Buffer.from(await fixed.arrayBuffer())),payloads(bytes));
});

test('repairs oversized edit duration using PTS, preserving B-frames and AAC priming',async()=>{
  const bytes=Buffer.from(fixtures.flat.bytes),originalMediaTimes=[];
  for(const t of moovTracks(bytes)){
    const edts=child(bytes,t.trak,'edts'),elst=edts&&child(bytes,edts,'elst');assert.ok(elst);
    assert.equal(bytes[elst.data],0);assert.equal(bytes.readUInt32BE(elst.data+4),1);
    originalMediaTimes.push(bytes.readInt32BE(elst.data+12));
    bytes.writeUInt32BE(0x7fffffff,elst.data+8);
  }
  const broken=new Blob([bytes],{type:'video/mp4'});
  const fixed=await normalizeMp4Timeline(broken,undefined,{expectedDuration:3});
  const fixedPath=await save('fixed-edit-duration',fixed),output=readFileSync(fixedPath);
  assert.ok(Math.abs(Number(probe(fixedPath).format.duration)-3)<.02);
  const mediaTimes=moovTracks(output).map(t=>{
    const elst=child(output,child(output,t.trak,'edts'),'elst');
    return output.readInt32BE(elst.data+12);
  });
  assert.deepEqual(mediaTimes,originalMediaTimes);
  assert.deepEqual(boxBytes(output,'ctts'),boxBytes(fixtures.flat.bytes,'ctts'));
  assert.deepEqual(decodedFrames(fixedPath),decodedFrames(fixtures.flat.path));
  assert.equal(decodedAudio(fixedPath),decodedAudio(fixtures.flat.path));
});
