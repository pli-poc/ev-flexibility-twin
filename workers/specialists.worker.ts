import {trainSpecialists,isSpecialistBundle} from '../lib/twin/specialists';
import {validateSpecialistController,specialistBenchmark} from '../lib/twin/specialist-controller';
self.onmessage=e=>{try{
 const {days=140,seed=42,mode='train',model:imported}=e.data,progress=(phase:string,done:number,total:number)=>self.postMessage({type:'progress',phase,done,total});
 const model=mode==='benchmark'?imported:validateSpecialistController(trainSpecialists(days,seed,progress),progress);
 if(!isSpecialistBundle(model))throw Error('Invalid specialist bundle.');
 self.postMessage({type:'frozen',model});
 const seeds=[174763,198491,225023].map(offset=>(model.seed+offset)%100001);for(let i=0;i<seeds.length;i++)while([model.trainingSeed,model.validationSeed,...seeds.slice(0,i)].includes(seeds[i]))seeds[i]=(seeds[i]+101)%100001;
 const benchmark=specialistBenchmark(model,days<=35?5:10,seeds,progress);self.postMessage({type:'complete',model,benchmark});
 }catch(error){self.postMessage({type:'error',message:String(error)});}};
