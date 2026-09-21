// Run with: node --test preview-7f3a9c/tests/video-export.test.mjs
// ffmpeg generates independent MP4 fixtures; ffprobe is the duration oracle.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectMp4} from '../assets/mp4-integrity.js';
import {verifyVideo} from '../assets/export-integrity.js';
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
