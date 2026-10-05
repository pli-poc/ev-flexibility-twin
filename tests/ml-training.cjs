const test=require('node:test');
const assert=require('node:assert/strict');
const {defaults}=require('../.test-build/engine');
const {optimizerDefaults}=require('../.test-build/optimizer');
const {compareStrategies}=require('../.test-build/comparison');
const {generateAnnualDataset,splitForDay}=require('../.test-build/annual');
const {runAnnualBacktest,annualBacktestCsv}=require('../.test-build/backtest');
const {FEATURE_NAMES,fitNetwork,predictPower,evaluateModel,isNetwork}=require('../.test-build/ml');

test('annual dataset comes from 365 seeded simulator days with whole-week splits',()=>{
 const generated=generateAnnualDataset({config:{...defaults,battery:true,flexible:true},optimizer:optimizerDefaults,teacherPolicy:'ems',seed:71});
 assert.equal(generated.days,365);assert.ok(generated.samples.length>1000);assert.equal(new Set(generated.samples.map(s=>s.day)).size,365);
 for(let week=0;week<53;week++){const expected=splitForDay(Math.min(364,week*7));for(const row of generated.samples.filter(s=>s.week===week))assert.equal(row.split,expected);}
 assert.ok(generated.samples.some(s=>s.scenario==='cold'));assert.ok(generated.samples.some(s=>s.scenario==='cloud'));assert.ok(generated.samples.some(s=>s.scenario==='fault'));
 assert.ok(generated.samples.every(s=>s.x.length===FEATURE_NAMES.length&&s.y>=0&&s.y<=1));
 const jan=generated.samples.filter(s=>s.day<31),jul=generated.samples.filter(s=>s.day>=181&&s.day<212);
 const mean=rows=>rows.reduce((sum,s)=>sum+s.x[4],0)/rows.length;
 assert.ok(mean(jul)>mean(jan),'July synthetic days should be warmer than January days');
});

test('compact neural policy trains reproducibly and serializes as a validated local package',()=>{
 const generated=generateAnnualDataset({config:defaults,optimizer:optimizerDefaults,teacherPolicy:'ems',seed:12});
 const train=generated.samples.filter(s=>s.split==='train').slice(0,300),validation=generated.samples.filter(s=>s.split==='validation').slice(0,100),testRows=generated.samples.filter(s=>s.split==='test').slice(0,100);
 const fit=fitNetwork(train,validation,{epochs:4,seed:44,hiddenUnits:6});
 const model={schemaVersion:1,algorithm:'compact-mlp-v1',createdAt:'2026-01-01T00:00:00Z',teacherPolicy:'ems',market:'nl',days:365,rowCount:generated.samples.length,trainRows:train.length,validationRows:validation.length,testRows:testRows.length,features:FEATURE_NAMES,...fit,metrics:{trainMae:0,validationMae:0,testMae:0,testRmse:0,testActionAgreement:0},datasetFingerprint:generated.fingerprint};
 const metrics=evaluateModel(model,testRows);model.metrics={trainMae:metrics.mae,validationMae:evaluateModel(model,validation).mae,testMae:metrics.mae,testRmse:metrics.rmse,testActionAgreement:metrics.actionAgreement};
 assert.ok(isNetwork(JSON.parse(JSON.stringify(model))));for(const row of testRows.slice(0,20)){const y=predictPower(model,row.x);assert.ok(Number.isFinite(y)&&y>=0&&y<=1);}
});

test('learned policy is a seventh replayable run behind the existing safety controller',()=>{
 const model={schemaVersion:1,algorithm:'compact-mlp-v1',createdAt:'2026-01-01T00:00:00Z',teacherPolicy:'ems',market:'nl',days:365,rowCount:1000,trainRows:600,validationRows:200,testRows:200,features:FEATURE_NAMES,hiddenUnits:4,weightsInputHidden:new Array(FEATURE_NAMES.length*4).fill(0),biasHidden:new Array(4).fill(1),weightsHiddenOutput:new Array(4).fill(0),biasOutput:12,epochs:1,seed:1,metrics:{trainMae:0,validationMae:0,testMae:0,testRmse:0,testActionAgreement:1},datasetFingerprint:'fixture'};
 const comparison=compareStrategies({...defaults,preset:'article',battery:true},optimizerDefaults,model);
 assert.deepEqual(comparison.runs.map(r=>r.id),['immediate','balanced','ems','cheap','peak','total','ml']);
 const learned=comparison.runs.at(-1);assert.ok(learned.result.vehicles.length>0);assert.equal(learned.result.config.battery,true);
 for(const f of learned.result.frames){for(const s of f.cars)assert.ok(s.power<=learned.result.vehicles[s.id].maxKw+1e-8);assert.ok(f.grid<=Math.max(f.limit,f.building-f.solar-f.batteryPower)+1e-6);}
});

test('annual backtest reports all six strategies and creates the selected teacher dataset in browser memory',()=>{
 const settings={config:defaults,optimizer:optimizerDefaults,teacherPolicy:'ems',seed:18};
 const {report,samples}=runAnnualBacktest(settings,undefined,1);
 assert.equal(report.days,1);assert.equal(report.teacherPolicy,'ems');
 assert.deepEqual(report.results.map(r=>r.id),['immediate','balanced','ems','cheap','peak','total']);
 assert.ok(report.rows>0);assert.equal(report.rows,samples.length);
 assert.ok(samples.every(s=>s.day===0&&s.split===splitForDay(0)));
 for(const row of report.results){assert.ok(Number.isFinite(row.energyCost));assert.ok(row.requestedKwh>=row.deliveredKwh-1e-8);assert.ok(row.peakKw>=0);}
 assert.ok(annualBacktestCsv(report).includes('net_energy_cost_eur'));
});
