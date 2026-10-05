// Compile first: npx tsc lib/twin/specialist-controller.ts --target es2022 --module commonjs --strict --skipLibCheck --outDir .test-build
// Run: node scripts/benchmark-specialists.cjs 140 42
const fs=require('node:fs');
const {trainSpecialists}=require('../.test-build/specialists');
const {validateSpecialistController,specialistBenchmark}=require('../.test-build/specialist-controller');
const days=Number(process.argv[2]??140),seed=Number(process.argv[3]??42);let phase='';
const progress=(next,done,total)=>{if(next!==phase){phase=next;console.log(`${next} (${done}/${total})`);}};
const model=validateSpecialistController(trainSpecialists(days,seed,progress),progress);
const seeds=[174763,198491,225023].map(offset=>(seed+offset)%100001);for(let i=0;i<seeds.length;i++)while([model.trainingSeed,model.validationSeed,...seeds.slice(0,i)].includes(seeds[i]))seeds[i]=(seeds[i]+101)%100001;
const benchmark=specialistBenchmark(model,days<=35?5:10,seeds,progress);
fs.mkdirSync('public/models',{recursive:true});fs.writeFileSync('public/models/specialist-reference.json',JSON.stringify({model,benchmark}));
console.table(benchmark.totals);console.log(JSON.stringify(benchmark.comparisons,null,2));
