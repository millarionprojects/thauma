import * as base from './scene-engine-DthTCrw0.js?base=20260922-white1';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(v,a,b)=>{const x=clamp((v-a)/(b-a));return x*x*x*(x*(x*6-15)+10);};

export const a=base.a;
export const d=base.d;
export const D={...base.D,classic:5.8,envelope:5.6,'envelope-gold':5.6,'envelope-copper':5.6,scroll:5.5,jewelry:5.8,balloon:5.5,him:6.0,case:6.1};

function polishMaterials(root,design){
  const seen=new Set();
  root?.traverse?.(node=>{
    if(!node.material)return;
    for(const mat of Array.isArray(node.material)?node.material:[node.material]){
      if(seen.has(mat))continue;
      seen.add(mat);
      if(typeof mat.roughness==='number'){
        if((mat.metalness||0)>.5) mat.roughness=clamp(mat.roughness*.88,.16,.52);
        else if((mat.clearcoat||0)>.25) mat.roughness=clamp(mat.roughness*.94,.2,.8);
      }
      if(typeof mat.envMapIntensity==='number'&&(mat.metalness||0)>.45) mat.envMapIntensity=Math.max(mat.envMapIntensity,1.12);
      if(typeof mat.clearcoat==='number'&&mat.clearcoat>0) mat.clearcoat=clamp(mat.clearcoat+.06,0,1);
      if(design==='case'&&mat.emissive&&typeof mat.emissiveIntensity==='number'&&mat.emissiveIntensity>0) mat.emissiveIntensity*=1.08;
      if(design==='jewelry'&&(mat.metalness||0)>.45&&typeof mat.clearcoat==='number') mat.clearcoat=Math.max(mat.clearcoat,.16);
    }
  });
  if(design==='balloon'||design==='scroll') root?.scale?.setScalar?.(1.07);
  if(design==='jewelry') root?.scale?.setScalar?.(1.045);
}

function applyFinalFocus(card,p,baseScale={x:1,y:1,z:1}){
  if(!card)return;
  // Presentation is now a separate measured camera-space flight. Keep the
  // physical card at its true size; growing/lowering it here hit the box rim.
  card.scale.set(baseScale.x,baseScale.y,baseScale.z);
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
  const ribbonBase=ribbon?{sx:ribbon.scale.x,sy:ribbon.scale.y,sz:ribbon.scale.z,rz:ribbon.rotation.z}:null;
  const bowBase=bow?{sx:bow.scale.x,sy:bow.scale.y,sz:bow.scale.z,rz:bow.rotation.z}:null;
  const cardBase=card?{x:card.position.x,y:card.position.y,z:card.position.z,sx:card.scale.x,sy:card.scale.y,sz:card.scale.z}:null;
  rig.update=(p,time)=>{
    original(p,time);
    const release=smooth(p,.06,design==='him'?.32:.27);
    if(ribbon&&ribbonBase){
      ribbon.position.y-=.09*release;
      ribbon.scale.x*=1+.09*release;
      ribbon.scale.z=ribbonBase.sz*(1+.035*release);
      ribbon.rotation.z=ribbonBase.rz+.024*Math.sin(release*Math.PI);
    }
    if(bow&&bowBase){
      bow.scale.set(bowBase.sx*(1+.09*release),bowBase.sy*(1-.12*release),bowBase.sz*(1+.02*release));
      bow.rotation.z=bowBase.rz+.13*Math.sin(release*Math.PI);
    }
    if(lid&&lidStart){
      const open=smooth(p,design==='him'?.32:.28,design==='him'?.69:.63);
      lid.position.set(mix(lidStart.x,lid.position.x,open),mix(lidStart.y,lid.position.y,open),mix(lidStart.z,lid.position.z,open));
      lid.rotation.set(mix(lidStart.rx,lid.rotation.x,open),mix(lidStart.ry,lid.rotation.y,open),mix(lidStart.rz,lid.rotation.z,open));
    }
    if(card&&cardBase){
      const liftStart=design==='him'?.57:.51,liftEnd=design==='him'?.78:.72;
      const presentEnd=design==='him'?.97:.95;
      const lift=smooth(p,liftStart,liftEnd),present=smooth(p,liftEnd,presentEnd);
      const safeY=design==='him'?1.46:1.58;
      const finalY=design==='him'?2.16:2.22;
      const finalZ=design==='him'?.82:.78;
      card.position.set(mix(cardBase.x,.1,present),mix(cardBase.y,safeY,lift),mix(cardBase.z,.015,lift));
      if(p>=liftEnd){
        card.position.y=mix(safeY,finalY,present);
        card.position.z=mix(.015,finalZ,present);
      }
      card.rotation.set(mix(-Math.PI/2,-.13,present),mix(0,-.055,present),.018*Math.sin(present*Math.PI));
      card.visible=p>liftStart-.08;
      applyFinalFocus(card,p,{x:cardBase.sx,y:cardBase.sy,z:cardBase.sz},.17);
    }
  };
}

function patchJewelryRig(rig){
  const original=rig.update.bind(rig),card=rig.card;
  const cardBase=card?{x:card.position.x,y:card.position.y,z:card.position.z,sx:card.scale.x,sy:card.scale.y,sz:card.scale.z}:null;
  rig.update=(p,time)=>{
    original(p,time);
    if(!card||!cardBase)return;
    const lift=smooth(p,.56,.76),present=smooth(p,.76,.96),safeY=1.02;
    card.position.set(cardBase.x,mix(cardBase.y,safeY,lift),mix(cardBase.z,.025,lift));
    if(p>=.76){card.position.y=mix(safeY,1.5,present);card.position.z=mix(.025,.82,present);}
    card.rotation.set(mix(-Math.PI/2,-.15,present),mix(0,-.04,present),.012*Math.sin(present*Math.PI));
    card.visible=p>.5;
    applyFinalFocus(card,p,{x:cardBase.sx,y:cardBase.sy,z:cardBase.sz},.15);
  };
}

function patchCaseRig(rig){
  const original=rig.update.bind(rig),card=rig.card;
  const cardBase=card?{x:card.position.x,y:card.position.y,z:card.position.z,sx:card.scale.x,sy:card.scale.y,sz:card.scale.z}:null;
  const glow=[];
  rig.g?.traverse?.(node=>{
    if(!node.material)return;
    for(const mat of Array.isArray(node.material)?node.material:[node.material]){
      if(mat.emissive&&typeof mat.emissiveIntensity==='number'&&mat.emissiveIntensity>0&&!glow.includes(mat))glow.push(mat);
    }
  });
  const glowBase=glow.map(mat=>mat.emissiveIntensity);
  rig.update=(p,time)=>{
    original(p,time);
    const unlock=smooth(p,.08,.34),open=smooth(p,.3,.68);
    glow.forEach((mat,index)=>{mat.emissiveIntensity=glowBase[index]*(1+.28*unlock+.16*Math.sin(open*Math.PI));});
    if(!card||!cardBase)return;
    const lift=smooth(p,.61,.82),present=smooth(p,.82,.985),safeY=1.18;
    card.position.set(cardBase.x,mix(cardBase.y,safeY,lift),mix(cardBase.z,.02,lift));
    if(p>=.82){card.position.y=mix(safeY,1.58,present);card.position.z=mix(.02,.94,present);}
    card.rotation.set(mix(-Math.PI/2,-.1,present),mix(0,-.025,present),.01*Math.sin(present*Math.PI));
    card.visible=p>.56;
    applyFinalFocus(card,p,{x:cardBase.sx,y:cardBase.sy,z:cardBase.sz},.16);
  };
}

function patchBalloonRig(rig){
  const original=rig.update.bind(rig),card=rig.card;
  let sphere=null,particles=null;
  rig.g?.traverse?.(node=>{
    if(!sphere&&node.isMesh&&node.geometry?.type==='SphereGeometry')sphere=node;
    if(!particles&&node.isInstancedMesh&&node.count>=60)particles=node;
  });
  if(particles)particles.scale.setScalar(.88);
  rig.update=(p,time)=>{
    original(p,time);
    const reveal=smooth(p,.43,.86);
    if(card){
      const focus=smooth(p,.93,1),scale=mix(.84,.98,reveal)*(1+.13*focus);
      card.scale.setScalar(scale);
      card.position.y=mix(2.07,2.24,reveal)-.06*focus;
      card.position.z=mix(.12,.62,reveal)+.24*focus;
      card.rotation.x=mix(-.03,-.012,reveal);
      card.rotation.y=mix(-.04,0,reveal);
      card.rotation.z=mix(-.025,0,reveal);
    }
    if(sphere){
      const burst=smooth(p,.14,.48);
      sphere.scale.setScalar(1+.025*Math.sin(burst*Math.PI)-.012*burst);
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
      const unroll=smooth(p,.055,.9),half=.13+unroll*1.52,radius=.145;
      for(let idx=0;idx<attr.count;idx++){
        const x=basePos[idx*3],y=basePos[idx*3+1];
        let yy=y,zz=.014*Math.sin(y*2.4)*(1-unroll);
        if(Math.abs(y)>half){
          const sign=Math.sign(y)||1,over=Math.abs(y)-half,theta=Math.min(over/radius,Math.PI*2.35);
          yy=sign*(half+Math.sin(theta)*radius*.52);
          zz=.014+radius*(1-Math.cos(theta));
        }
        attr.setXYZ(idx,x,yy,zz);
      }
      attr.needsUpdate=true;
      sheet.geometry.computeVertexNormals?.();
      for(const group of rollGroups){
        const sign=Math.sign(group.position.y)||1;
        group.position.z=.075;
        group.rotation.x=-sign*(unroll*1.52/radius);
      }
    }
    rig.g.rotation.y=-.035*(1-smooth(p,.08,.86));
  };
}

function patchRig(rig,design){
  if(!rig?.update)return;
  polishMaterials(rig.g,design);
  // The document itself is color-accurate; studio lights shade its physical edge,
  // not the user's printed image. This also keeps the canvas/DOM handoff neutral.
  const face=rig.card?.children?.find(n=>n.geometry?.type==='PlaneGeometry'&&n.material?.map);
  if(face){
    const m=face.material;m.emissiveMap=m.map;m.emissive.set('#ffffff');m.emissiveIntensity=1;
    m.color.set('#000000');m.metalness=0;m.roughness=1;m.clearcoat=0;m.toneMapped=false;m.needsUpdate=true;
  }
  if(design==='classic'||design==='him')patchBoxRig(rig,design);
  else if(design==='jewelry')patchJewelryRig(rig);
  else if(design==='case')patchCaseRig(rig);
  else if(design==='balloon')patchBalloonRig(rig);
  else if(design==='scroll')patchScrollRig(rig);
}

export class G extends base.G{
  constructor(...args){
    super(...args);
    this.renderer.toneMappingExposure=1.02;
  }
  setTheme(theme){
    super.setTheme(theme);
    // White studio backdrop; retain the soft contact shadow without a green floor.
    this.scene.background?.set('#ffffff');
    this.scene.fog?.color.set('#ffffff');
    this.floor.visible=false;
    this.contact.material.color.set('#111111');
    this.renderer.setClearColor('#ffffff',this.transparent?0:1);
  }
  setDesign(design,gift={}){
    super.setDesign(design,gift);
    patchRig(this.rig,this.design);
    this.certificateHidden=false;
    const update=this.rig.update.bind(this.rig);
    this.rig.update=(...args)=>{update(...args);if(this.certificateHidden&&this.rig.card)this.rig.card.visible=false;};
    if(this.contact){
      const compact=this.design==='scroll'||this.design==='balloon';
      const scale=compact?.8:this.design==='jewelry'?.92:1;
      this.contact.scale.set(scale,scale,1);
      if(compact)this.contact.material.opacity*=.78;
    }
  }
  setCertificateVisible(visible){this.certificateHidden=!visible;}
  reset(){this.certificateHidden=false;this.presentationSnapshot=null;super.reset();}
  play({onComplete,onProgress,reducedMotion=false}={}){
    if(this.playing)return false;
    this.onComplete=onComplete;this.onProgress=onProgress;this.reducedMotion=reducedMotion;
    this.duration=reducedMotion?.8:D[this.design];this.playElapsed=0;this.playing=true;this.start();return true;
  }
}

export function createObjectRig(design,gift={}){
  const result=base.s.createObjectRig(design,gift);
  patchRig(result.rig,design);
  return result;
}
export const s=Object.freeze({...base.s,GiftScene:G,DURATIONS:D,createObjectRig});
