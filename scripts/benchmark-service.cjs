// Compile lib/twin/service-hybrid.ts. Validate, freeze, then evaluate fresh cases.
// node scripts/benchmark-service.cjs --validate
// node scripts/benchmark-service.cjs [--balanced] [--verify]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {loadFrozenModel,modelHash}=require('./benchmark-uncertainty.cjs');
const {serviceRun,noEvCost}=require('../.test-build/service-hybrid');
const {specialistRun}=require('../.test-build/specialist-controller');
const {specialistScenario}=require('../.test-build/specialist-scenario');
const {randomFor,quantile}=require('../.test-build/neural');
const balanced=workerData?.balanced??process.argv.includes('--balanced');
const protocol=require(balanced?'../experiments/service-balanced.json':'../experiments/service-hybrid.json'),previous=require('../experiments/uncertainty-only.json'),firstStage=require('../experiments/service-hybrid.json');
const root=path.resolve(__dirname,'..'),prefix=balanced?'service-balanced':'service-hybrid',validationPath=path.join(root,`public/models/${prefix}-validation.json`),evidencePath=path.join(root,`public/models/${prefix}-evidence.json`);
const arms=[...protocol.fixedPolicies,'hybrid-ai','hybrid-no-ai','hybrid-ablated'];
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const protocolHash=hash(protocol);
function checkProtocol(model){
 if(modelHash(model)!==protocol.modelSha256)throw Error('Service protocol model hash mismatch.');
 const old=JSON.parse(fs.readFileSync(path.join(root,previous.modelPath),'utf8')).benchmark.seeds;
 const forbidden=[model.trainingSeed,model.validationSeed,...protocol.validationSeeds,...old,...previous.seeds,...(balanced?firstStage.testSeeds:[])];
 if(protocol.testSeeds.some(seed=>forbidden.includes(seed))||new Set(protocol.testSeeds).size!==protocol.testSeeds.length)throw Error('Test seeds overlap development or previous evaluation.');
 if(protocol.testDays.some(day=>protocol.validationDays.includes(day)))throw Error('Controller validation and test dates overlap.');
 if(new Set(protocol.testDays.map(day=>day%7)).size!==7)throw Error('Test protocol must cover every weekday.');
}
function metric(result,c,policy){
 const f=result.final;return {policy,ready:f.ready,unmet:f.shortfall,cost:f.cost,chargingCost:f.cost-noEvCost(c),delivered:f.delivered,visits:f.departed,violations:f.violations};
}
const keys=['ready','unmet','cost','chargingCost','delivered','visits','violations'];
function sum(runs){const total=Object.fromEntries(keys.map(key=>[key,runs.reduce((s,r)=>s+r[key],0)]));return {...total,readyRate:total.ready/total.visits,unitCost:total.chargingCost/Math.max(1e-9,total.delivered)};}
function totals(rows){return arms.map(policy=>({policy,...sum(rows.map(row=>row.runs.find(run=>run.policy===policy)))}));}
function rank(a,b){return a.violations-b.violations||b.ready-a.ready||a.unmet-b.unmet||a.chargingCost-b.chargingCost;}
function candidates(learned){const rows=[];
 for(const risk of learned?protocol.candidates.quantiles:protocol.candidates.margins)for(const weight of protocol.candidates.headroomWeights)for(const mode of protocol.candidates.modes)for(const fairShare of protocol.candidates.fairShares??[0]){
  const settings={quantile:learned?risk:.5,baselineMargin:learned?0:risk,headroomWeight:weight,mode};
  if(balanced)settings.fairShare=fairShare;
  rows.push({policy:learned?'hybrid-ai':'hybrid-no-ai',settings});
 }return rows;
}
function validationRows(model,entry){const rows=[];
 for(const seed of protocol.validationSeeds)for(const day of protocol.validationDays)for(const condition of protocol.conditions){
  const c=specialistScenario(day,seed,condition);const r=entry.settings?serviceRun(c,model,entry.settings,entry.policy==='hybrid-ai'):specialistRun(c,model,entry.policy);
  rows.push(metric(r,c,entry.policy));
 }return rows;
}
function testRows(model,selection,seeds){const rows=[];
 for(const seed of seeds)for(const day of protocol.testDays)for(const condition of protocol.conditions){
  const c=specialistScenario(day,seed,condition),runs=arms.map(policy=>{
   const r=protocol.fixedPolicies.includes(policy)?specialistRun(c,model,policy):serviceRun(c,model,policy==='hybrid-no-ai'?selection.unlearned.settings:selection.learned.settings,policy==='hybrid-ai');
   return metric(r,c,policy);
  });rows.push({seed,day,condition,runs});parentPort?.postMessage({progress:1});
 }return rows;
}
async function workers(jobs,kind){const count=Math.min(4,os.availableParallelism(),jobs.length),output=Array(jobs.length);let next=0,done=0;
 const slots=Array.from({length:count},async()=>{while(next<jobs.length){const index=next++;output[index]=await new Promise((resolve,reject)=>{
   const worker=new Worker(__filename,{workerData:{serviceWorker:true,kind,job:jobs[index],balanced}});let value;
   worker.on('message',message=>{if(message.progress){done++;if(done%140===0)console.log(`Fresh service test: ${done}/${protocol.testSeeds.length*protocol.testDays.length*protocol.conditions.length} cases`);}if(message.value)value=message.value;});
   worker.on('error',reject);worker.on('exit',code=>code===0&&value?resolve(value):reject(Error(`Service worker exited ${code}.`)));
  });if(kind==='validation')console.log(`Controller validation: ${index+1}/${jobs.length} candidates`);
 }});await Promise.all(slots);return output;
}
function loadSelection(){const selected=JSON.parse(fs.readFileSync(validationPath,'utf8'));
 if(selected.protocolHash!==protocolHash||selected.modelSha256!==protocol.modelSha256)throw Error('Frozen service validation does not match this protocol.');
 return selected;
}
async function validate(){const model=loadFrozenModel();checkProtocol(model);
 const entries=[...protocol.fixedPolicies.map(policy=>({policy})),...candidates(true),...candidates(false)];
 const evaluated=await workers(entries,'validation');
 const admissibleFixed=evaluated.filter(r=>protocol.fixedPolicies.includes(r.policy)&&r.policy!=='immediate').sort(rank);
 const fixed=admissibleFixed[0],learnedCandidates=evaluated.filter(r=>r.policy==='hybrid-ai').sort(rank),qualifying=learnedCandidates.filter(r=>r.violations===0&&r.readyRate-fixed.readyRate>=protocol.acceptance.minimumReadyRateGain&&r.unmet<fixed.unmet&&r.unitCost<=fixed.unitCost*(1+protocol.acceptance.maximumIncrementalUnitCostIncrease));
 const learned=qualifying[0]??learnedCandidates[0],unlearned=evaluated.filter(r=>r.policy==='hybrid-no-ai').sort(rank)[0];
 const selection={schema:'ev-service-validation/1',modelSha256:modelHash(model),protocolHash,protocol,validationQualified:qualifying.length>0,learned,unlearned,fixed,evaluated};
 fs.writeFileSync(validationPath,JSON.stringify(selection));console.table([fixed,learned,unlearned]);return selection;
}
function paired(rows,reference,target='hybrid-ai',metricName='ready'){
 const larger=metricName==='ready',seeds=[...new Set(rows.map(row=>row.seed))],deltas=rows.map(row=>{
  const a=row.runs.find(r=>r.policy===target)[metricName],b=row.runs.find(r=>r.policy===reference)[metricName];return (a-b)*(larger?1:-1);
 });const groups=seeds.map(seed=>{const items=rows.flatMap((row,i)=>row.seed===seed?[deltas[i]]:[]);return {sum:items.reduce((s,x)=>s+x,0),count:items.length};});
 const rng=randomFor(protocol.bootstrap.seed),samples=Array.from({length:protocol.bootstrap.resamples},()=>{let value=0,count=0;for(let i=0;i<groups.length;i++){const g=groups[Math.floor(rng()*groups.length)];value+=g.sum;count+=g.count;}return value/count;});
 return {metric:metricName,reference,target,meanAdvantage:deltas.reduce((s,x)=>s+x,0)/deltas.length,low:quantile(samples,.025),high:quantile(samples,.975),clusters:seeds.length,wins:deltas.filter(x=>x>1e-7).length,losses:deltas.filter(x=>x< -1e-7).length,ties:deltas.filter(x=>Math.abs(x)<=1e-7).length};
}
function acceptance(total,slices,comparison,reference){const ai=total.find(r=>r.policy==='hybrid-ai'),base=total.find(r=>r.policy===reference),rule=protocol.acceptance;
 const checks={safe:ai.violations===0,moreReady:ai.readyRate-base.readyRate>=rule.minimumReadyRateGain,lowerUnmet:ai.unmet<base.unmet-1e-7,
  affordable:ai.unitCost<=base.unitCost*(1+rule.maximumIncrementalUnitCostIncrease),conditionService:slices.every(s=>{const a=s.totals.find(r=>r.policy==='hybrid-ai'),b=s.totals.find(r=>r.policy===reference);return a.ready>=b.ready&&a.unmet<=b.unmet+1e-7;}),positiveReadyInterval:comparison.ready.low>0,positiveUnmetInterval:comparison.unmet.low>0};
 return {reference,accepted:Object.values(checks).every(Boolean),checks,readyRateGain:ai.readyRate-base.readyRate,unmetReduction:base.unmet-ai.unmet,unitCostChange:ai.unitCost/base.unitCost-1};
}
function assemble(rows,selection){const total=totals(rows),slices=protocol.conditions.map(condition=>({condition,totals:totals(rows.filter(row=>row.condition===condition))}));
 const compare=reference=>({ready:paired(rows,reference),unmet:paired(rows,reference,'hybrid-ai','unmet'),cost:paired(rows,reference,'hybrid-ai','cost')});
 const comparisons=Object.fromEntries(arms.filter(policy=>policy!=='hybrid-ai').map(policy=>[policy,compare(policy)]));
 const gates=[selection.fixed.policy,'hybrid-no-ai','hybrid-ablated'].map(reference=>acceptance(total,slices,comparisons[reference],reference));
 return {schema:'ev-service-evidence/1',modelSha256:protocol.modelSha256,selectionSha256:hash(selection),protocol,scenarios:rows.length,visits:total[0].visits,selection,rows,totals:total,slices,comparisons,acceptance:{accepted:selection.validationQualified&&gates.every(g=>g.accepted),gates},limits:'Synthetic recurring-driver fixture. Bootstrap resamples eight whole seeds. Unit cost normalises measured incremental EV cost by energy delivered; matched driver outcomes and operational data are still needed for a commercial savings claim.'};
}
function summariseEvidence(evidence,filename=`${prefix}-evidence.json`){
 const {modelSha256,protocol,scenarios,visits,totals,slices,comparisons,acceptance,limits}=evidence;
 const {validationQualified,learned,unlearned,fixed}=evidence.selection;
 return {schema:'ev-service-summary/1',filename,evidenceSha256:hash(evidence),modelSha256,protocol,scenarios,visits,selection:{validationQualified,learned,unlearned,fixed},totals,slices,comparisons,acceptance,limits};
}
async function benchmark(verify=false){const model=loadFrozenModel();checkProtocol(model);const selection=loadSelection();
 const rows=(await workers(protocol.testSeeds.map(seed=>[seed]),'test')).flat();const evidence=assemble(rows,selection),serialized=JSON.stringify(evidence);
 if(verify){if(fs.readFileSync(evidencePath,'utf8')!==serialized)throw Error('Service evidence failed exact reproduction.');console.log('Service evidence reproduced exactly.');}else fs.writeFileSync(evidencePath,serialized);
 if(balanced){const summaryPath=path.join(root,'public/models/service-proof.json'),summary=JSON.stringify(summariseEvidence(evidence));
  if(verify){if(fs.readFileSync(summaryPath,'utf8')!==summary)throw Error('Service demo summary differs from reproduced evidence.');console.log('Service demo summary reproduced exactly.');}else fs.writeFileSync(summaryPath,summary);
 }
 console.table(evidence.totals);console.log(JSON.stringify(evidence.acceptance,null,2));return evidence;
}
module.exports={protocol,arms,checkProtocol,rank,paired,acceptance,assemble,loadSelection,summariseEvidence};
if(!isMainThread&&workerData?.serviceWorker){const model=loadFrozenModel();checkProtocol(model);
 const value=workerData.kind==='validation'?{...workerData.job,...sum(validationRows(model,workerData.job))}:testRows(model,loadSelection(),workerData.job);
 parentPort.postMessage({value});
}else if(require.main===module)(async()=>{if(process.argv.includes('--validate'))await validate();else await benchmark(process.argv.includes('--verify'));})().catch(error=>{console.error(error);process.exitCode=1;});
