import {generateSelectorRows,fitSelector,selectorEvaluation,type SelectorSettings} from '@/lib/twin/selector';
const scope=self as unknown as {postMessage:(message:unknown)=>void;onmessage:((event:MessageEvent<SelectorSettings>)=>void)|null};
scope.onmessage=event=>{try{const settings=event.data;const rows=generateSelectorRows(settings,p=>scope.postMessage({type:'progress',phase:'training',...p}));const model=fitSelector(rows,settings,p=>scope.postMessage({type:'candidate',...p}));
 // Freeze before generating new-seed benchmark outcomes. These rows never enter fitting or validation.
 scope.postMessage({type:'frozen',model});const benchmarkSeed=(settings.seed+104729)%100001;
 const benchmarkRows=generateSelectorRows({...settings,seed:benchmarkSeed},p=>scope.postMessage({type:'progress',phase:'benchmark',...p})).map(r=>({...r,split:'test' as const}));
 scope.postMessage({type:'complete',model,rows,benchmarkRows,benchmarkSeed,evaluation:selectorEvaluation(model,benchmarkRows)});
 }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:'Selector training failed'});}};
