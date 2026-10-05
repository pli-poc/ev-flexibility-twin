import {defaults,type Config} from './engine';
import {annualPreset,splitForDay} from './annual';
import {optimizerDefaults,type OptimizerConfig,markets} from './optimizer';
import {flexDefaults,runFlexibility,type FlexOptions,type FlexStrategy} from './flexibility';
export const SELECTOR_KEY='ev-flexibility-strategy-selector-v1';
export const strategyIds:FlexStrategy[]=['immediate','balanced','ems','cheap','peak','total'];
export const selectorFeatures=['year_sin','year_cos','grid_kw','solar_kwp','demand','chargers','battery','flexible_building','peak_target','market_code','request_kw_per_site','pool_sites','consent','control_latency','already_reserved_per_site','activation_minute','duration','explicit_product'];
export type Objective={departureEurPerKwh:number;unsafeEurPerMinute:number;excessEurPerKwh:number};
export const objectiveDefaults:Objective={departureEurPerKwh:20,unsafeEurPerMinute:1000,excessEurPerKwh:1000};
export type SelectorSettings={seed:number;days:number;objective:Objective};
export type Scenario={config:Config;optimizer:OptimizerConfig;flex:FlexOptions};
export type Outcome={strategy:FlexStrategy;score:number;energyCost:number;netFlexValue:number;departureShortfall:number;deliveryShortfall:number;violationMinutes:number;accepted:boolean};
export type SelectorRow={day:number;week:number;split:'train'|'validation'|'test';x:number[];winner:FlexStrategy;outcomes:Outcome[]};
export type SelectorModel={schemaVersion:'ev-strategy-selector/1';algorithm:'standardized-knn';features:string[];k:number;mean:number[];scale:number[];examples:{x:number[];label:FlexStrategy}[];seed:number;objective:Objective;fingerprint:string;trainDays:number;validationDays:number;testDays:number;validationRegret:number};
export function selectorInput(s:Scenario):number[]{const {config:c,optimizer:o,flex:f}=s,day=c.dayOfYear??0;return [Math.sin(2*Math.PI*day/365),Math.cos(2*Math.PI*day/365),c.grid,c.solar,c.demand,c.chargers,Number(c.battery),Number(c.flexible),o.peak,markets.findIndex(m=>m.id===o.market),f.requestKw/f.poolSites,f.poolSites,f.consent,f.latencySeconds,f.reservedKw/f.poolSites,f.start,f.duration,Number(f.product!=='tariff')];}
function randomSource(seed:number){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
export function selectorScenario(day:number,seed:number):Scenario{
 const random=randomSource(seed+day*7919),pick=(n:number)=>Math.floor(random()*n);
 const config:Config={...defaults,preset:annualPreset(day),seed:(seed+day*7919)%100001,dayOfYear:day,grid:60+pick(39)*5,solar:pick(25)*5,demand:.6+random()*1.2,chargers:8+pick(13),battery:random()>.6,flexible:random()>.5};
 const optimizer:OptimizerConfig={...optimizerDefaults,market:markets[pick(4)].id,peak:50+pick(25)*5};
 const flex:FlexOptions={...flexDefaults,seed:config.seed,product:random()>.25?'congestion':'tariff',start:570+pick(22)*15,duration:15+pick(3)*15,requestKw:100+pick(3)*50,poolSites:5+pick(11),consent:.5+random()*.5,latencySeconds:pick(5)*60,failure:(['none','none','fault','offline','early'] as const)[pick(5)],reservedKw:pick(3)*10};
 return {config,optimizer,flex};
}
export function validateObjective(o:Objective){for(const v of Object.values(o))if(!Number.isFinite(v)||v<0||v>100000)throw Error('Objective weights must be finite and between 0 and 100000');if(Object.keys(o).length!==3||o.departureEurPerKwh===undefined||o.unsafeEurPerMinute===undefined||o.excessEurPerKwh===undefined)throw Error('Incomplete objective');}
export function evaluateStrategies(s:Scenario,objective:Objective):Outcome[]{validateObjective(objective);return strategyIds.map(strategy=>{const r=runFlexibility(s.flex,undefined,strategy,s.config,s.optimizer);const m=r.metrics;
 // netFlexValue already subtracts incremental charging cost, so use baseline energy cost to avoid counting it twice.
 const baselineEnergy=m.energyCost-r.settlement.incrementalChargingCost;
 const score=baselineEnergy-r.settlement.netValue+m.departureShortfallKwh*objective.departureEurPerKwh+m.violationMinutes*objective.unsafeEurPerMinute+m.excessKwh*objective.excessEurPerKwh;
 return {strategy,score,energyCost:m.energyCost,netFlexValue:r.settlement.netValue,departureShortfall:m.departureShortfallKwh,deliveryShortfall:m.shortfallKwh,violationMinutes:m.violationMinutes,accepted:r.accepted};});}
export function winningStrategy(outcomes:Outcome[]):FlexStrategy{return [...outcomes].sort((a,b)=>a.score-b.score||strategyIds.indexOf(a.strategy)-strategyIds.indexOf(b.strategy))[0].strategy;}
const fingerprint=(text:string)=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h.toString(16);};
export function generateSelectorRows(settings:SelectorSettings,progress?:(p:{day:number;total:number;last:SelectorRow;counts:Record<string,number>})=>void):SelectorRow[]{
 if(!Number.isInteger(settings.days)||settings.days<28||settings.days>365||!Number.isInteger(settings.seed)||settings.seed<0||settings.seed>100000)throw Error('Use 28–365 scenarios and a seed from 0 to 100000');validateObjective(settings.objective);
 const rows:SelectorRow[]=[],counts:Record<string,number>=Object.fromEntries(strategyIds.map(id=>[id,0]));
 for(let i=0;i<settings.days;i++){const day=Math.floor(i*365/settings.days),s=selectorScenario(day,settings.seed),outcomes=evaluateStrategies(s,settings.objective);const row:SelectorRow={day,week:Math.floor(day/7),split:splitForDay(day),x:selectorInput(s),winner:winningStrategy(outcomes),outcomes};rows.push(row);counts[row.winner]++;progress?.({day:i+1,total:settings.days,last:row,counts:{...counts}});}
 return rows;
}
export function predictStrategy(model:SelectorModel,x:number[]):{strategy:FlexStrategy;voteShare:number;nearestDistance:number}{
 if(x.length!==selectorFeatures.length||!x.every(Number.isFinite))throw Error('Invalid selector features');
 const neighbours=model.examples.map(e=>({label:e.label,distance:e.x.reduce((sum,v,i)=>sum+Math.pow((v-x[i])/model.scale[i],2),0)})).sort((a,b)=>a.distance-b.distance).slice(0,model.k);
 const votes=new Map<FlexStrategy,number>();for(const n of neighbours)votes.set(n.label,(votes.get(n.label)??0)+1/(Math.sqrt(n.distance)+.01));
 const sorted=[...votes.entries()].sort((a,b)=>b[1]-a[1]||strategyIds.indexOf(a[0])-strategyIds.indexOf(b[0]));return {strategy:sorted[0][0],voteShare:sorted[0][1]/[...votes.values()].reduce((s,v)=>s+v,0),nearestDistance:Math.sqrt(neighbours[0].distance)};
}
const regret=(model:SelectorModel,rows:SelectorRow[])=>rows.reduce((sum,r)=>sum+r.outcomes.find(o=>o.strategy===predictStrategy(model,r.x).strategy)!.score-Math.min(...r.outcomes.map(o=>o.score)),0)/rows.length;
export function fitSelector(rows:SelectorRow[],settings:SelectorSettings,onCandidate?:(p:{k:number;validationRegret:number})=>void):SelectorModel{
 validateObjective(settings.objective);const train=rows.filter(r=>r.split==='train'),validation=rows.filter(r=>r.split==='validation'),test=rows.filter(r=>r.split==='test');if(train.length<5||validation.length<2||test.length<2)throw Error('Not enough whole-week groups in each split');
 const mean=selectorFeatures.map((_,i)=>train.reduce((s,r)=>s+r.x[i],0)/train.length),scale=mean.map((m,i)=>Math.max(.001,Math.sqrt(train.reduce((s,r)=>s+Math.pow(r.x[i]-m,2),0)/train.length)));
 const model:SelectorModel={schemaVersion:'ev-strategy-selector/1',algorithm:'standardized-knn',features:[...selectorFeatures],k:1,mean,scale,examples:train.map(r=>({x:[...r.x],label:r.winner})),seed:settings.seed,objective:{...settings.objective},fingerprint:fingerprint(JSON.stringify({settings,rows})),trainDays:train.length,validationDays:validation.length,testDays:test.length,validationRegret:0};
 let best=Infinity,bestK=1;for(const k of [1,3,5,7,9].filter(k=>k<=train.length)){model.k=k;const value=regret(model,validation);onCandidate?.({k,validationRegret:value});if(value<best){best=value;bestK=k;}}model.k=bestK;model.validationRegret=best;return model;
}
export function selectorEvaluation(model:SelectorModel,rows:SelectorRow[]){const test=rows.filter(r=>r.split==='test');if(!test.length)throw Error('No held-out scenarios');
 const confusion=strategyIds.map(actual=>({actual,...Object.fromEntries(strategyIds.map(predicted=>[predicted,0]))})) as {actual:FlexStrategy;[key:string]:number|string}[];
 const totals:Record<string,{score:number;energyCost:number;netFlexValue:number;departureShortfall:number;deliveryShortfall:number;violationMinutes:number}>=Object.fromEntries([...strategyIds,'learned','oracle'].map(id=>[id,{score:0,energyCost:0,netFlexValue:0,departureShortfall:0,deliveryShortfall:0,violationMinutes:0}]));let correct=0;
 const predictions=test.map(r=>{const p=predictStrategy(model,r.x),selected=r.outcomes.find(o=>o.strategy===p.strategy)!,oracle=r.outcomes.find(o=>o.strategy===r.winner)!;if(p.strategy===r.winner)correct++;confusion.find(c=>c.actual===r.winner)![p.strategy]=Number(confusion.find(c=>c.actual===r.winner)![p.strategy])+1;
 for(const o of [...r.outcomes,{...selected,strategy:'learned'},{...oracle,strategy:'oracle'}])for(const key of Object.keys(totals[o.strategy]))totals[o.strategy][key as keyof typeof totals[string]]+=Number(o[key as keyof Outcome]);
 return {day:r.day,predicted:p.strategy,winner:r.winner,voteShare:p.voteShare,regret:selected.score-oracle.score};});
 return {testDays:test.length,agreement:correct/test.length,meanRegret:regret(model,test),totals,confusion,predictions};
}
export function isSelector(value:unknown):value is SelectorModel{try{const m=value as SelectorModel;if(!m||m.schemaVersion!=='ev-strategy-selector/1'||m.algorithm!=='standardized-knn'||!Array.isArray(m.features)||m.features.join('|')!==selectorFeatures.join('|')||!Number.isInteger(m.k)||m.k<1||!Array.isArray(m.examples)||m.examples.length<m.k||m.examples.length>365||m.trainDays!==m.examples.length||!Array.isArray(m.scale)||m.scale.length!==selectorFeatures.length||!m.scale.every(v=>Number.isFinite(v)&&v>0)||!Array.isArray(m.mean)||m.mean.length!==selectorFeatures.length||!m.mean.every(Number.isFinite)||!m.examples.every(e=>strategyIds.includes(e.label)&&Array.isArray(e.x)&&e.x.length===selectorFeatures.length&&e.x.every(Number.isFinite)))return false;validateObjective(m.objective);return Number.isInteger(m.seed)&&m.seed>=0&&m.seed<=100000&&typeof m.fingerprint==='string';}catch{return false;}}
