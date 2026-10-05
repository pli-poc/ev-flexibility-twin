import {trainForecast,benchmarkForecast} from '../lib/twin/forecast';
self.onmessage=e=>{try{const {days,seed}=e.data;const model=trainForecast(days,seed);self.postMessage({type:'frozen',model});const benchmark=benchmarkForecast(model,days,seed+104729);self.postMessage({type:'complete',model,benchmark});}catch(error){self.postMessage({type:'error',message:String(error)});}};
