// Run with: node --test preview-7f3a9c/tests/video-export.test.mjs
// ffmpeg generates independent MP4 fixtures; ffprobe is the duration oracle.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectMp4,normalizeMp4Timeline} from '../assets/mp4-integrity.js';
import {remuxSafariMp4} from '../assets/mp4-remux.js';
import {verifyVideo,checkDuration,checkDurationRange} from '../assets/export-integrity.js';
import {shareVideoFile,saveMessage} from '../assets/export-save.js';

const dir=mkdtempSync(join(tmpdir(),'thauma-export-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
const fixtures={};
for(const [name,movflags] of Object.entries({flat:'+faststart',fragmented:'+frag_keyframe+empty_moov+default_base_moof'})){
  const path=join(dir,name+'.mp4');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x288:rate=30',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-preset','ultrafast',
    '-bf','2','-g','30','-c:a','aac','-movflags',movflags,path]);
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',path],{encoding:'utf8'}));
  fixtures[name]={blob:new Blob([readFileSync(path)],{type:'video/mp4'}),info};
}

for(const [name,{blob,info}] of Object.entries(fixtures))test(`${name}: encoded sample duration agrees with ffprobe, no DOM decoder required`,async()=>{
  const result=await verifyVideo(blob,3,undefined,{audioSeconds:3});
  const video=info.streams.find(s=>s.codec_type==='video');
  assert.ok(Math.abs(result.duration-Number(video.duration))<.02);
  assert.equal(result.width,video.width);assert.equal(result.height,video.height);
  assert.equal(result.tracks.find(t=>t.kind==='vide').samples,90);
  assert.equal(result.tracks.find(t=>t.kind==='soun').codec,'mp4a');
});

test('rebases fragmented MP4 decode timestamps to zero without changing duration',async()=>{
  const source=fixtures.fragmented.blob,bytes=new Uint8Array(await source.arrayBuffer()),v=new DataView(bytes.buffer);
  const add=3_600_000_000;
  for(let i=4;i+16<bytes.length;i++){
    if(bytes[i]!==0x74||bytes[i+1]!==0x66||bytes[i+2]!==0x64||bytes[i+3]!==0x74)continue;
    const data=i+4,version=bytes[data];
    if(version===1){
      const hi=v.getUint32(data+4),lo=v.getUint32(data+8),value=hi*4294967296+lo+add;
      v.setUint32(data+4,Math.floor(value/4294967296));v.setUint32(data+8,value>>>0);
    }else v.setUint32(data+4,(v.getUint32(data+4)+add)>>>0);
  }
  const shifted=new Blob([bytes],{type:'video/mp4'}),before=await inspectMp4(shifted);
  assert.ok(before.startTime>1000);
  const fixed=await normalizeMp4Timeline(shifted),afterFix=await inspectMp4(fixed);
  assert.ok(afterFix.startTime<.001);
  assert.ok(Math.abs(afterFix.duration-before.duration)<.001);
  // A second pass must be stable; normalizing headers must not change samples.
  const fixedAgain=await normalizeMp4Timeline(fixed),afterAgain=await inspectMp4(fixedAgain);
  assert.ok(afterAgain.startTime<.001);
  assert.ok(Math.abs(afterAgain.duration-afterFix.duration)<.001);
});

test('accepts a video that contains the full required content even if optional tail is short',()=>{
  assert.equal(checkDuration(18.9,18.8),18.9);
});

test('accepts a video track longer than the visual minimum when audio drives movie length',()=>{
  assert.equal(checkDurationRange(25.4,6.45,25.4),25.4);
  assert.throws(()=>checkDurationRange(5.8,6.45,25.4),{code:'INCOMPLETE_VIDEO'});
  assert.throws(()=>checkDurationRange(26.1,6.45,25.4),{code:'INCOMPLETE_VIDEO'});
});

test('rejects an absurdly long clip instead of accepting only a lower duration bound',async()=>{
  assert.throws(()=>checkDuration(7158294.75,15.9),{code:'INCOMPLETE_VIDEO'});
});

test('repairs a flattened MP4 whose final video sample is much longer than the audio',async()=>{
  const source=fixtures.flat.blob,bytes=new Uint8Array(await source.arrayBuffer()),v=new DataView(bytes.buffer);
  // Find the video stts box and inflate only its final duration entry.
  const typeAt=i=>String.fromCharCode(bytes[i],bytes[i+1],bytes[i+2],bytes[i+3]);
  let stts=-1;
  for(let i=4;i+16<bytes.length;i++){
    if(typeAt(i)!=='stts')continue;
    const start=i+4,entries=v.getUint32(start+4);
    if(entries<1)continue;
    const last=start+8+(entries-1)*8;
    if(last+8>bytes.length)continue;
    const duration=v.getUint32(last+4);
    if(duration>0&&duration<100000){stts=last+4;}
  }
  assert.ok(stts>0);
  v.setUint32(stts,15000);
  const broken=new Blob([bytes],{type:'video/mp4'});
  const before=await inspectMp4(broken);
  assert.ok(before.duration>10);
  const fixed=await normalizeMp4Timeline(broken,undefined,{expectedDuration:3});
  const afterFix=await inspectMp4(fixed);
  assert.ok(Math.abs(afterFix.duration-3)<0.15);
});

test('codec-copy remux rebuilds a clean flat MP4 without edit lists',async()=>{
  const source=fixtures.flat.blob;
  const before=await inspectMp4(source);
  const rebuilt=await remuxSafariMp4(source);
  const after=await inspectMp4(rebuilt);
  assert.ok(Math.abs(after.duration-before.duration)<.05);
  assert.equal(after.tracks.find(t=>t.kind==='vide').samples,before.tracks.find(t=>t.kind==='vide').samples);
  assert.equal(after.tracks.find(t=>t.kind==='soun').samples,before.tracks.find(t=>t.kind==='soun').samples);
  const bytes=new Uint8Array(await rebuilt.arrayBuffer());
  assert.equal(new TextDecoder('latin1').decode(bytes).includes('edts'),false);
});

test('rejects a complete short clip instead of calling it a full recording',async()=>{
  await assert.rejects(verifyVideo(fixtures.fragmented.blob,25),{code:'INCOMPLETE_VIDEO'});
});
test('rejects a truncated last media payload',async()=>{
  const b=fixtures.fragmented.blob;
  await assert.rejects(verifyVideo(b.slice(0,b.size-100,'video/mp4'),3),{code:'INVALID_MP4'});
});
test('rejects missing final fragments even when remaining box boundaries are valid',async()=>{
  const bytes=new Uint8Array(await fixtures.fragmented.blob.arrayBuffer()),v=new DataView(bytes.buffer);
  let p=0,fragmentCount=0;
  while(p<bytes.length){
    const type=String.fromCharCode(...bytes.slice(p+4,p+8));
    if(type==='moof'&&++fragmentCount===2)break;
    p+=v.getUint32(p);
  }
  const short=new Blob([bytes.slice(0,p)],{type:'video/mp4'});
  await assert.rejects(verifyVideo(short,3),{code:'INCOMPLETE_VIDEO'});
});
test('reads metadata, never copies the entire compressed recording',async()=>{
  const source=fixtures.fragmented.blob;let read=0;
  const bounded={size:source.size,slice(start,end){read+=Math.min(source.size,end)-start;return source.slice(start,end);},arrayBuffer(){throw Error('Whole-file copy');}};
  await inspectMp4(bounded);assert.ok(read<source.size/4);
});
test('cancellation stops validation',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(inspectMp4(fixtures.flat.blob,controller.signal),{name:'AbortError'});
});
test('shares exactly one file synchronously within the original click',async()=>{
  const file=new File(['video'],'gift.mp4',{type:'video/mp4'});let active=true,called=false;
  const result=shareVideoFile(file,{canShare:data=>data.files[0]===file,share(data){
    assert.equal(active,true);assert.deepEqual(Object.keys(data),['files']);assert.equal(data.files[0],file);
    called=true;return Promise.resolve();
  }});
  active=false;assert.equal(called,true);assert.deepEqual(await result,{status:'handed-off'});
});
test('unavailable sharing and cancellation explain the separate download route',async()=>{
  const result=await shareVideoFile({},{});assert.equal(result.status,'unavailable');
  assert.match(saveMessage(result),/Скачать видео/);
  assert.match(saveMessage({name:'AbortError'}),/Скачать видео/);
  assert.match(saveMessage({name:'DataError'}),/Видео готово/);
});
test('share failure remains observable, with no automatic second action',async()=>{
  let calls=0;
  await assert.rejects(shareVideoFile({}, {canShare:()=>true,share(){calls++;return Promise.reject(new DOMException('No target','AbortError'));}}),{name:'AbortError'});
  assert.equal(calls,1);
});
