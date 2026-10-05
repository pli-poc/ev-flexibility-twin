"use client";
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {SVGRenderer} from 'three/examples/jsm/renderers/SVGRenderer.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import type {Frame,Vehicle} from '@/lib/twin/engine';
type Props={frame:Frame;vehicles:Vehicle[];time:number;roof:boolean;flows:boolean;reset:number;battery:boolean;chargers:number;onSelect:(id:string)=>void};
export default function SiteScene(props:Props){
 const host=useRef<HTMLDivElement>(null),current=useRef(props);current.current=props;const [software,setSoftware]=useState(false);
 useEffect(()=>{if(!host.current)return;const el=host.current;let renderer:THREE.WebGLRenderer|SVGRenderer;let softwareMode=false;
 try{const gl=new THREE.WebGLRenderer({antialias:true,alpha:true});gl.setPixelRatio(Math.min(window.devicePixelRatio,2));gl.shadowMap.enabled=true;gl.shadowMap.type=THREE.PCFSoftShadowMap;gl.setClearColor(0x000000,0);renderer=gl;}catch{renderer=new SVGRenderer();renderer.setQuality('low');renderer.setPrecision(2);softwareMode=true;setSoftware(true);}
 el.appendChild(renderer.domElement);
 const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(39,1,.1,400);camera.position.set(47,46,54);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.minDistance=30;controls.maxDistance=110;controls.maxPolarAngle=Math.PI/2.2;controls.minPolarAngle=.15;
 scene.add(new THREE.AmbientLight(0xbad2df,softwareMode?.65:.3));scene.add(new THREE.HemisphereLight(0xbfdcf4,0x263a36,2.3));const sun=new THREE.DirectionalLight(0xffe5c0,3);sun.position.set(-20,45,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=45;sun.shadow.camera.bottom=-45;sun.shadow.normalBias=.03;scene.add(sun);
 const pickables:THREE.Object3D[]=[];const labels:{el:HTMLDivElement;pos:THREE.Vector3;id:string}[]=[];
 const material=(color:string,metal=.1)=>new THREE.MeshStandardMaterial({color,roughness:.6,metalness:metal});
 const box=(w:number,h:number,d:number,x:number,y:number,z:number,color:string,parent:THREE.Object3D=scene,id?:string)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d,softwareMode?Math.ceil(w/2):1,softwareMode?Math.ceil(h/2):1,softwareMode?Math.ceil(d/2):1),material(color));mesh.position.set(x,y,z);if(softwareMode&&y<.15&&h<.7)mesh.renderOrder=-100+Math.round((y+1)*50);if(softwareMode&&id==='building'&&h>1&&Math.min(w,d)<.2)mesh.renderOrder=1;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);if(id){mesh.userData.id=id;pickables.push(mesh);}return mesh;};
 const line=(points:number[][],color:string,width=.025,parent:THREE.Object3D=scene)=>{const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number])),false,'catmullrom',.01);const m=new THREE.Mesh(new THREE.TubeGeometry(path,32,width,5,false),new THREE.MeshBasicMaterial({color}));parent.add(m);return m;};
 const label=(id:string,text:string,pos:number[])=>{const node=document.createElement('div');node.className='scene-label';node.textContent=text;el.appendChild(node);labels.push({el:node,pos:new THREE.Vector3(...pos as [number,number,number]),id});};
 box(58,.6,43,0,-.6,0,'#263940');box(56,.12,41,0,-.22,0,'#30484a');
 // Campus circulation and marked parking: functional site geometry.
 box(53,.08,4.8,0,-.08,8.5,'#23323d');box(4.5,.08,34,-24,-.07,1,'#23323d');box(4.5,.08,34,24,-.07,1,'#23323d');
 for(let x=-24;x<25;x+=5)box(2,.012,.1,x,-.01,8.5,'#61757e');
 box(38,.18,15,0,0,-10,'#547076');
 const building=new THREE.Group();scene.add(building);
 box(33,.6,11,0,.35,-11,'#667e85',building,'building');
 box(33,7,10.5,0,4,-11,'#274453',building,'building');
 for(let floor=0;floor<2;floor++){box(33,.23,11,0,1+floor*3.1,-11,'#81979d',building,'building');for(let i=0;i<13;i++){box(2.1,2.3,.09,-14.8+i*2.45,2.45+floor*3.1,-5.71,'#5394a5',building,'building');box(2.1,2.3,.09,-14.8+i*2.45,2.45+floor*3.1,-16.3,'#386877',building,'building');}for(let z=-15;z<-6;z+=2.6){box(.1,2.3,2,-16.55,2.45+floor*3.1,z,'#447f91',building,'building');box(.1,2.3,2,16.55,2.45+floor*3.1,z,'#447f91',building,'building');}}
 const roof=new THREE.Group();scene.add(roof);box(34,.35,12,0,7.7,-11,'#739096',roof,'solar');
 for(let row=0;row<4;row++)for(let col=0;col<12;col++){const panel=box(2.28,.12,2.2,-14.5+col*2.62,8,-14.9+row*2.55,'#183b55',roof,'solar');panel.rotation.x=-.12;for(let a=0;a<3;a++)box(.025,.02,2.05,-15.2+col*2.62+a*.67,8.12,-14.9+row*2.55,'#507a92',roof);}
 const inside=new THREE.Group();scene.add(inside);inside.visible=false;box(32,.16,10,0,4.2,-11,'#759396',inside,'building');for(let i=0;i<8;i++)for(let j=0;j<2;j++){box(2,.15,1,-13+i*3.6,5,-8-j*5,'#bbc6bd',inside,'building');box(.8,.6,.1,-13+i*3.6,5.4,-8-j*5,'#183c4c',inside);box(.65,.65,.65,-13+i*3.6,4.65,-6.7-j*5,'#345669',inside);}
 // Entrance canopy, footpath and roof equipment.
 box(5,.25,3,0,3.3,-4.5,'#91a6a8',building);box(.2,3,.2,-2.2,1.5,-3.4,'#759296',building);box(.2,3,.2,2.2,1.5,-3.4,'#759296',building);box(4,.06,5,0,.03,-1,'#6a8283');
 box(3.8,2.6,2.3,21,1.3,-11,'#728a91',scene,'building');for(let i=0;i<5;i++)box(3.4,.08,.08,21,.5+i*.35,-9.8,'#354d59');
 const batteryGroup=new THREE.Group();scene.add(batteryGroup);for(let i=0;i<3;i++){box(1.5,3.5,2,20+i*1.7,1.75,-3.3,'#d2d9d0',batteryGroup,'battery');box(.9,.4,.05,20+i*1.7,2.6,-2.27,'#376b66',batteryGroup,'battery');}
 box(2.6,3.8,2.3,-22,1.9,-6,'#8197a1',scene,'grid');box(1.6,.8,.05,-22,2.5,-4.82,'#223d4d',scene,'grid');
 const chargerMeshes:THREE.Mesh[]=[];
 for(let b=0;b<20;b++){const x=-16.2+(b%10)*3.6,z=b<10?3.5:14;box(3.3,.03,5.2,x,.01,z,'#2b444c');line([[x-1.65,.05,z-2.6],[x-1.65,.05,z+2.6],[x+1.65,.05,z+2.6]],'#6d858b');const cz=b<10?.4:17.1;box(.55,1.8,.4,x,1,cz,'#b4c7c5',scene,`charger:${b}`);const light=box(.35,.45,.07,x,1.4,cz+(b<10?.24:-.24),'#58bda1',scene,`charger:${b}`);chargerMeshes.push(light);line([[x+.24,1.35,cz],[x+.55,.5,cz],[x+.42,.3,cz],[x+.29,.8,cz]],'#101e24',.035);}
 // Trees provide scale without external assets.
 for(const [x,z] of [[-20,-15],[-20,16],[20,19],[-13,19],[0,19],[13,19],[-9,-19],[8,-19]]){box(.3,2.8,.3,x,1,z,'#625e4b');const tree=new THREE.Mesh(new THREE.IcosahedronGeometry(1.7,1),material('#356758'));tree.position.set(x,3,z);tree.castShadow=true;scene.add(tree);}
 const carGroups:THREE.Group[]=[];
 const makeCar=(v:Vehicle)=>{const g=new THREE.Group();scene.add(g);const van=v.kind==='Fleet';box(1.65,.65,van?3.8:3.5,0,.65,0,v.color,g,`car:${v.id}`);box(1.45,van?1.05:.62,van?2.6:1.95,0,van?1.42:1.22,-.12,van?v.color:'#477181',g,`car:${v.id}`);if(!van)box(1.38,.05,1.1,0,1.57,-.25,v.color,g,`car:${v.id}`);for(const x of [-.85,.85])for(const z of [-1.12,1.12]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.33,.33,.18,12),material('#152027'));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.37,z);g.add(wheel);}for(const x of [-.52,.52]){box(.35,.17,.05,x,.72,1.78,'#e7edcf',g);box(.32,.15,.05,x,.72,-1.78,'#c5584d',g);}g.visible=false;return g;};
 for(const v of current.current.vehicles)carGroups[v.id]=makeCar(v);
 const flows=new THREE.Group();scene.add(flows);const flowpaths=[{pts:[[-22,.3,-6],[-22,.3,-1],[0,.3,-1],[0,.3,8.5]],color:'#90aaf4',id:'grid'},{pts:[[0,8.3,-11],[18,8.3,-11],[18,.3,-11],[18,.3,-1],[0,.3,-1]],color:'#f6c66b',id:'solar'},{pts:[[0,.3,-1],[0,.3,8.5],[16,.3,8.5]],color:'#70e3bb',id:'ev'},{pts:[[21,.3,-3],[21,.3,-1],[0,.3,-1]],color:'#66c1e8',id:'battery'}];
 const particles:{mesh:THREE.Mesh;curve:THREE.CatmullRomCurve3;offset:number;id:string}[]=[];
 for(const f of flowpaths){line(f.pts,f.color,.045,flows);const curve=new THREE.CatmullRomCurve3(f.pts.map(p=>new THREE.Vector3(...p as [number,number,number])),false,'catmullrom',.01);for(let i=0;i<6;i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.115,8,8),new THREE.MeshBasicMaterial({color:f.color}));flows.add(mesh);particles.push({mesh,curve,offset:i/6,id:f.id});}}
 label('building','Building',[0,9.8,-11]);label('solar','Solar',[-12,9.5,-11]);label('grid','Grid',[-22,6,-6]);label('battery','Storage',[22,5.4,-3]);
 let down={x:0,y:0};const onDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};const onClick=(e:PointerEvent)=>{if(Math.abs(e.clientX-down.x)+Math.abs(e.clientY-down.y)>6)return;const rect=renderer.domElement.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hits=ray.intersectObjects(pickables).filter(h=>{let o:THREE.Object3D|null=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});if(hits[0])current.current.onSelect(hits[0].object.userData.id);};renderer.domElement.addEventListener('pointerdown',onDown as EventListener);renderer.domElement.addEventListener('pointerup',onClick as EventListener);
 const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(el);resize();let raf=0,lastReset=-1;
 function positionAlong(points:THREE.Vector3[],progress:number){const lengths=points.slice(1).map((p,i)=>p.distanceTo(points[i]));const total=lengths.reduce((a,b)=>a+b,0);let distance=Math.max(0,Math.min(1,progress))*total;for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1){const pos=points[i].clone().lerp(points[i+1],distance/lengths[i]);const delta=points[i+1].clone().sub(points[i]);return{pos,angle:Math.atan2(delta.x,delta.z)};}distance-=lengths[i];}return{pos:points[0],angle:0};}
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 let lastDraw=0;const animate=()=>{if(softwareMode&&performance.now()-lastDraw<90){raf=requestAnimationFrame(animate);return;}lastDraw=performance.now();const p=current.current,f=p.frame;controls.update();if(p.reset!==lastReset){camera.position.set(47,46,54);controls.target.set(0,0,0);lastReset=p.reset;}
 roof.visible=p.roof;inside.visible=!p.roof;building.children.forEach((obj,i)=>{if(i===1)obj.visible=p.roof;});batteryGroup.visible=p.battery;flows.visible=p.flows;
 sun.intensity=softwareMode?.85:(f.time<420||f.time>1170?1.1:3);
 for(let i=0;i<20;i++){const s=f.cars.find(s=>s.bay===i&&s.status!=='Departed'&&s.status!=='Expected');(chargerMeshes[i].material as THREE.MeshStandardMaterial).color.set(i>=p.chargers?'#465361':s?.status==='Fault'?'#f27c70':s?.power?'#70e3bb':s?.status==='Ready'?'#74b4e4':'#496573');}
 for(const v of p.vehicles){let g=carGroups[v.id];if(!g){g=makeCar(v);carGroups[v.id]=g;}const s=f.cars[v.id];if(!s){g.visible=false;continue;}const t=p.time;g.visible=t>=v.arrival&&t<v.departure+2;if(!g.visible)continue;
 const x=-16.2+(Math.max(0,s.bay)%10)*3.6,z=s.bay<10?3.5:14;let points:THREE.Vector3[],progress:number;
 if(s.status==='Queued'){const q=f.cars.filter(a=>a.status==='Queued').findIndex(a=>a.id===v.id);g.position.set(-24,.08,15+q*4.5);g.rotation.y=Math.PI;continue;}
 if(t>=v.departure){if(s.bay<0){g.position.set(-24,.08,18);continue;}points=[new THREE.Vector3(x,.08,z),new THREE.Vector3(x,.08,8.5),new THREE.Vector3(28,.08,8.5)];progress=(t-v.departure)/2;}
 else{points=[new THREE.Vector3(-28,.08,8.5),new THREE.Vector3(x,.08,8.5),new THREE.Vector3(x,.08,z)];progress=(t-s.parkedAt)/2;}
 const pose=positionAlong(points,progress);g.position.copy(pose.pos);g.rotation.y=pose.angle;
 }
 for(let i=p.vehicles.length;i<carGroups.length;i++)if(carGroups[i])carGroups[i].visible=false;
 for(const dot of particles){const power=dot.id==='grid'?f.grid:dot.id==='solar'?f.solar:dot.id==='ev'?f.ev:f.batteryPower;dot.mesh.visible=Math.abs(power)>.1&&(dot.id!=='battery'||p.battery);const phase=((reduced?0:p.time*.25)*(power<0?-1:1)+dot.offset+10000)%1;dot.mesh.position.copy(dot.curve.getPointAt(phase));}
 for(const l of labels){const pos=l.pos.clone().project(camera);l.el.style.left=`${(pos.x*.5+.5)*el.clientWidth}px`;l.el.style.top=`${(-pos.y*.5+.5)*el.clientHeight}px`;l.el.style.display=pos.z>1||(l.id==='battery'&&!p.battery)?'none':'block';l.el.textContent=l.id==='grid'?`Grid · ${Math.abs(f.grid).toFixed(0)} kW ${f.grid<0?'out':'in'}`:l.id==='solar'?`Solar · ${f.solar.toFixed(0)} kW`:l.id==='battery'?`Battery · ${f.batteryKwh.toFixed(0)}%`:`Building · ${f.building.toFixed(0)} kW`;}
 renderer.render(scene,camera);raf=requestAnimationFrame(animate);};animate();
 return()=>{cancelAnimationFrame(raf);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',onDown as EventListener);renderer.domElement.removeEventListener('pointerup',onClick as EventListener);scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});if(renderer instanceof THREE.WebGLRenderer)renderer.dispose();renderer.domElement.remove();labels.forEach(l=>l.el.remove());};
 },[]);
 return <div ref={host} className="scene" role="img" aria-label="Interactive 3D smart building, solar roof, battery and parking area. Drag to orbit, scroll to zoom. Select assets using the accompanying dashboard.">{software&&<span className="software-note">Compatibility rendering</span>}</div>;
}
