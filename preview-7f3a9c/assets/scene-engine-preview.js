import * as base from './scene-engine-DthTCrw0.js?base=1';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(v,a,b)=>{const x=clamp((v-a)/(b-a));return x*x*x*(x*(x*6-15)+10);};

export const a=base.a;
export const d=base.d;
export const D={...base.D,classic:5.8,envelope:5.6,'envelope-gold':5.6,'envelope-copper':5.6,scroll:5.5,jewelry:5.8,balloon:5.5,him:6.0,case:6.1};

function polishMaterials(root,design){
  root?.traverse?.(node=>{
    if(!node.material)return;
    for(const mat of Array.isArray(node.material)?node.material:[node.material]){
      if(typeof mat.roughness==='number'){
        if((mat.metalness||0)>.5) mat.roughness=clamp(mat.roughness*.9,.17,.55);
        else if((mat.clearcoat||0)>.25) mat.roughness=clamp(mat.roughness*.96,.2,.82);
      }
      if(typeof mat.envMapIntensity==='number'&&(mat.metalness||0)>.45) mat.envMapIntensity=Math.max(mat.envMapIntensity,1.08);
      if(typeof mat.clearcoat==='number'&&mat.clearcoat>0) mat.clearcoat=clamp(mat.clearcoat+.05,0,1);
    }
  });
  if(design==='balloon'||design==='scroll') root?.scale?.setScalar?.(1.06);
  if(design==='jewelry') root?.scale?.setScalar?.(1.035);
}

function findBoxParts(rig){
  const card=rig.card;
  const groups=(rig.g?.children||[]).filter(node=>node!==card&&!node.isMesh&&node.children?.length);
  const lid=groups.find(group=>group.children.some(child=>!child.isMesh&&child.children?.length>=4));
  const ribbon=groups.find(group=>group!==lid&&group.children.length>=2&&group.children.length<=4&&group.children.every(child=>child.isMesh));
  const bow=lid?.children?.find(child=>!child.isMesh&&child.children?.length>=4);
  return {lid,ribbon,bow};
}

function patchBoxRig(rig,design){
  const original=rig.update.bind(rig),card=rig.card,{lid,ribbon,bow}=findBoxParts(rig);
  const lidStart=lid?{x:lid.position.x,y:lid.position.y,z:lid.position.z,rx:lid.rotation.x,ry:lid.rotation.y,rz:lid.rotation.z}:null;
  const bowScale=bow?{x:bow.scale.x,y:bow.scale.y,z:bow.scale.z}:null;
  rig.update=(p,time)=>{
    original(p,time);
    const release=smooth(p,.07,design==='him'?.31:.26);
    if(ribbon){
      ribbon.position.y-=.065*release;
      ribbon.scale.x*=1+.07*release;
      ribbon.rotation.z=.018*Math.sin(release*Math.PI);
    }
    if(bow&&bowScale){
      bow.scale.set(bowScale.x*(1+.065*release),bowScale.y*(1-.08*release),bowScale.z);
      bow.rotation.z+=.105*Math.sin(release*Math.PI);
    }
    if(lid&&lidStart){
      const open=smooth(p,design==='him'?.31:.27,design==='him'?.67:.61);
      lid.position.set(mix(lidStart.x,lid.position.x,open),mix(lidStart.y,lid.position.y,open),mix(lidStart.z,lid.position.z,open));
      lid.rotation.set(mix(lidStart.rx,lid.rotation.x,open),mix(lidStart.ry,lid.rotation.y,open),mix(lidStart.rz,lid.rotation.z,open));
    }
    if(card){
      const clear=smooth(p,design==='him'?.49:.44,design==='him'?.72:.69);
      const settle=smooth(p,.84,1);
      const forward=smooth(p,design==='him'?.72:.69,.94);
      card.position.y+=.68*clear*(1-.68*settle);
      card.position.z*=forward;
      card.rotation.x=mix(-Math.PI/2,-.13,smooth(p,.72,.96));
      card.rotation.y=mix(0,-.055,smooth(p,.75,.96));
      card.rotation.z*=forward;
    }
  };
}

function patchJewelryRig(rig){
  const original=rig.update.bind(rig),card=rig.card;
  rig.update=(p,time)=>{
    original(p,time);
    if(!card)return;
    const clear=smooth(p,.5,.76),settle=smooth(p,.88,1),forward=smooth(p,.77,.96);
    card.position.y+=.26*clear*(1-.55*settle);
    card.position.z*=forward;
    card.rotation.x=mix(-Math.PI/2,-.15,smooth(p,.77,.96));
    card.rotation.y*=forward;
    card.rotation.z*=forward;
  };
}

function patchCaseRig(rig){
  const original=rig.update.bind(rig),card=rig.card;
  rig.update=(p,time)=>{
    original(p,time);
    if(!card)return;
    const lift=smooth(p,.54,.8),settle=smooth(p,.9,1),forward=smooth(p,.81,.98);
    card.position.y+=.42*lift*(1-.5*settle);
    card.position.z*=forward;
    card.rotation.x=mix(-Math.PI/2,-.1,smooth(p,.82,.98));
    card.rotation.y*=forward;
    card.rotation.z*=forward;
  };
}

function patchBalloonRig(rig){
  const original=rig.update.bind(rig),card=rig.card;
  let sphere=null;
  rig.g?.traverse?.(node=>{if(!sphere&&node.isMesh&&node.geometry?.type==='SphereGeometry')sphere=node;});
  rig.update=(p,time)=>{
    original(p,time);
    const reveal=smooth(p,.42,.86);
    if(card){
      const s=mix(.86,.98,reveal);
      card.scale.setScalar(s);
      card.position.y=mix(2.07,2.28,reveal);
      card.position.z=mix(.12,.62,reveal);
      card.rotation.x=mix(-.03,-.015,reveal);
      card.rotation.y=mix(-.04,0,reveal);
      card.rotation.z=mix(-.025,0,reveal);
    }
    if(sphere){
      const burst=smooth(p,.14,.48);
      sphere.scale.setScalar(1+.045*Math.sin(Math.min(1,burst)*Math.PI/2));
    }
  };
}

function patchScrollRig(rig){
  const original=rig.update.bind(rig);
  let sheet=null;
  rig.g?.traverse?.(node=>{
    const pos=node.geometry?.attributes?.position;
    if(!sheet&&node.isMesh&&pos&&pos.count>300)sheet=node;
  });
  const attr=sheet?.geometry?.attributes?.position;
  const basePos=attr?attr.array.slice():null;
  const rollGroups=(rig.g?.children||[]).filter(node=>!node.isMesh&&node.children?.length>=3&&node!==sheet);
  rig.update=(p,time)=>{
    original(p,time);
    if(attr&&basePos){
      const unroll=smooth(p,.06,.9),half=.13+unroll*1.52,radius=.145;
      for(let idx=0;idx<attr.count;idx++){
        const x=basePos[idx*3],y=basePos[idx*3+1];
        let yy=y,zz=.018*Math.sin(y*2.4)*(1-unroll);
        if(Math.abs(y)>half){
          const sign=Math.sign(y)||1,over=Math.abs(y)-half,theta=Math.min(over/radius,Math.PI*2.35);
          yy=sign*(half+Math.sin(theta)*radius*.52);
          zz=.018+radius*(1-Math.cos(theta));
        }
        attr.setXYZ(idx,x,yy,zz);
      }
      attr.needsUpdate=true;
      sheet.geometry.computeVertexNormals?.();
      for(const group of rollGroups){
        const sign=Math.sign(group.position.y)||1;
        group.position.z=.08;
        group.rotation.x=-sign*(unroll*1.52/radius);
      }
    }
    rig.g.rotation.y=-.035*(1-smooth(p,.08,.86));
  };
}

function patchRig(rig,design){
  if(!rig?.update)return;
  polishMaterials(rig.g,design);
  if(design==='classic'||design==='him')patchBoxRig(rig,design);
  else if(design==='jewelry')patchJewelryRig(rig);
  else if(design==='case')patchCaseRig(rig);
  else if(design==='balloon')patchBalloonRig(rig);
  else if(design==='scroll')patchScrollRig(rig);
}

export class G extends base.G{
  constructor(...args){
    super(...args);
    this.renderer.toneMappingExposure=1.14;
  }
  setDesign(design,gift={}){
    super.setDesign(design,gift);
    patchRig(this.rig,this.design);
    if(this.contact){
      const compact=this.design==='scroll'||this.design==='balloon';
      this.contact.scale.set(compact?.86:1,compact?.86:1,1);
    }
  }
  play({onComplete,onProgress,reducedMotion=false}={}){
    if(this.playing)return false;
    this.onComplete=onComplete;this.onProgress=onProgress;this.reducedMotion=reducedMotion;
    this.duration=reducedMotion?.8:D[this.design];this.playElapsed=0;this.playing=true;this.start();return true;
  }
}

export function s(){return {...base.s,GiftScene:G,DURATIONS:D};}
