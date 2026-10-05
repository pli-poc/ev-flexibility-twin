import {runAnnualBacktest} from '@/lib/twin/backtest';
import {evaluateModel,FEATURE_NAMES,fitNetwork,type Network,type Sample} from '@/lib/twin/ml';
import type {AnnualSettings} from '@/lib/twin/annual';

type Start=
 |{type:'backtest';settings:AnnualSettings;days?:number}
 |{type:'fit';settings:AnnualSettings;samples:Sample[];datasetFingerprint:string;days:number;epochs:number;seed:number};
const scope=self as unknown as {postMessage:(message:unknown)=>void;onmessage:((event:MessageEvent<Start>)=>void)|null};
scope.onmessage=(event:MessageEvent<Start>)=>{
 try{
  const data=event.data;
  if(data?.type==='backtest'){
   const generated=runAnnualBacktest(data.settings,p=>scope.postMessage({type:'progress',phase:'backtest',...p}),data.days);
   scope.postMessage({type:'backtest-complete',report:generated.report,samples:generated.samples});
   return;
  }
  if(data?.type==='fit'){
   const {settings,samples,epochs,seed,datasetFingerprint,days}=data;
   const train=samples.filter(s=>s.split==='train'),validation=samples.filter(s=>s.split==='validation'),test=samples.filter(s=>s.split==='test');
   const fit=fitNetwork(train,validation,{epochs,seed,onProgress:p=>scope.postMessage({type:'epoch',...p})});
   const base:Network={schemaVersion:1,algorithm:'compact-mlp-v1',createdAt:new Date().toISOString(),teacherPolicy:settings.teacherPolicy,market:settings.optimizer.market,days,rowCount:samples.length,trainRows:train.length,validationRows:validation.length,testRows:test.length,features:FEATURE_NAMES,hiddenUnits:fit.hiddenUnits,weightsInputHidden:fit.weightsInputHidden,biasHidden:fit.biasHidden,weightsHiddenOutput:fit.weightsHiddenOutput,biasOutput:fit.biasOutput,epochs:fit.epochs,seed:fit.seed,metrics:{trainMae:0,validationMae:0,testMae:0,testRmse:0,testActionAgreement:0},datasetFingerprint};
   const trainMetrics=evaluateModel(base,train),validationMetrics=evaluateModel(base,validation),testMetrics=evaluateModel(base,test);
   base.metrics={trainMae:trainMetrics.mae,validationMae:validationMetrics.mae,testMae:testMetrics.mae,testRmse:testMetrics.rmse,testActionAgreement:testMetrics.actionAgreement};
   scope.postMessage({type:'fit-complete',model:base});
  }
 }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};