/** Small deterministic multi-output MLP. No teacher dispatch or test data is used. */
export type NeuralSample={x:number[];y:number[]};
export type NeuralNet={inputs:number;outputs:number;hidden:number;w1:number[];b1:number[];w2:number[];b2:number[];curve:{epoch:number;train:number;validation:number}[];epoch:number};
export function randomFor(seed:number){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
export function neuralPredict(n:NeuralNet,x:number[]){const h=n.b1.map((b,j)=>Math.tanh(b+x.reduce((s,v,i)=>s+v*n.w1[j*n.inputs+i],0)));return n.b2.map((b,k)=>b+h.reduce((s,v,j)=>s+v*n.w2[k*n.hidden+j],0));}
export function validNeural(raw:unknown,inputs:number,outputs:number):raw is NeuralNet{const n=raw as NeuralNet;return !!n&&n.inputs===inputs&&n.outputs===outputs&&Number.isInteger(n.hidden)&&n.hidden>=2&&n.hidden<=64&&[n.w1,n.b1,n.w2,n.b2].every(Array.isArray)&&n.w1.length===inputs*n.hidden&&n.b1.length===n.hidden&&n.w2.length===outputs*n.hidden&&n.b2.length===outputs&&[...n.w1,...n.b1,...n.w2,...n.b2].every(v=>Number.isFinite(v)&&Math.abs(v)<1e4)&&Array.isArray(n.curve)&&n.curve.length>0&&n.curve.length<=500&&n.curve.every(p=>!!p&&Number.isInteger(p.epoch)&&p.epoch>0&&Number.isFinite(p.train)&&p.train>=0&&Number.isFinite(p.validation)&&p.validation>=0)&&Number.isInteger(n.epoch)&&n.epoch>0&&n.epoch<=n.curve.length;}
export function fitNeural(train:NeuralSample[],validation:NeuralSample[],seed:number,epochs=45,progress?:(epoch:number,total:number)=>void):NeuralNet{
 if(!train.length||!validation.length)throw Error('Training and validation samples are required.');
 const inputs=train[0].x.length,outputs=train[0].y.length,hidden=16,rng=randomFor(seed);
 const n:NeuralNet={inputs,outputs,hidden,w1:Array.from({length:inputs*hidden},()=>((rng()-.5)*2)/Math.sqrt(inputs)),b1:Array(hidden).fill(0),w2:Array.from({length:outputs*hidden},()=>((rng()-.5)*2)/Math.sqrt(hidden)),b2:Array(outputs).fill(0),curve:[],epoch:0};
 const arrays=[n.w1,n.b1,n.w2,n.b2],m=arrays.map(a=>a.map(()=>0)),v=arrays.map(a=>a.map(()=>0));let step=0,bestLoss=Infinity,best=arrays.map(a=>[...a]),bestEpoch=0;
 const loss=(rows:NeuralSample[])=>rows.reduce((s,r)=>s+neuralPredict(n,r.x).reduce((a,p,k)=>a+(p-r.y[k])**2,0)/outputs,0)/rows.length;
 const order=train.map((_,i)=>i);
 for(let epoch=1;epoch<=epochs;epoch++){
  for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  for(let start=0;start<order.length;start+=128){const g=arrays.map(a=>a.map(()=>0)),count=Math.min(128,order.length-start);
   for(let q=start;q<start+count;q++){const row=train[order[q]],h=n.b1.map((b,j)=>Math.tanh(b+row.x.reduce((s,z,i)=>s+z*n.w1[j*inputs+i],0)));const output=n.b2.map((b,k)=>b+h.reduce((s,z,j)=>s+z*n.w2[k*hidden+j],0)),dh=Array(hidden).fill(0);
    for(let k=0;k<outputs;k++){const delta=2*(output[k]-row.y[k])/outputs;g[3][k]+=delta;for(let j=0;j<hidden;j++){g[2][k*hidden+j]+=delta*h[j];dh[j]+=delta*n.w2[k*hidden+j];}}
    for(let j=0;j<hidden;j++){const delta=dh[j]*(1-h[j]*h[j]);g[1][j]+=delta;for(let i=0;i<inputs;i++)g[0][j*inputs+i]+=delta*row.x[i];}
   }
   step++;for(let a=0;a<arrays.length;a++)for(let i=0;i<arrays[a].length;i++){const grad=Math.max(-5,Math.min(5,g[a][i]/count))+.00005*arrays[a][i];m[a][i]=.9*m[a][i]+.1*grad;v[a][i]=.999*v[a][i]+.001*grad*grad;arrays[a][i]-=.006*(m[a][i]/(1-.9**step))/(Math.sqrt(v[a][i]/(1-.999**step))+1e-8);}
  }
  const trainLoss=loss(train),validationLoss=loss(validation);n.curve.push({epoch,train:trainLoss,validation:validationLoss});
  if(validationLoss<bestLoss){bestLoss=validationLoss;best=arrays.map(a=>[...a]);bestEpoch=epoch;}progress?.(epoch,epochs);
 }
 [n.w1,n.b1,n.w2,n.b2]=best;n.epoch=bestEpoch;return n;
}
export const clip=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export function quantile(values:number[],q:number){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(q*sorted.length)-1))];}
