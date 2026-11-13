// Shared implementation, kept outside the functions entrypoint directory.
const DAY=86400000;
const iso=number=>new Date(number*DAY).toISOString().slice(0,10);
export function consultationCondition(condition,body){
  if(!/^[A-Z]\d{1,2}_\d{8,10}$/.test(body.accountNum??'')||!Number.isInteger(body.priceWon)||body.priceWon<0||body.priceWon>1e9)return null;
  return [...condition,body.accountNum,body.priceWon];
}
export async function consultationSummary(store,today,filter){
  const {days,prefix='',from,channel}=filter,end=Date.parse(today)/DAY;
  const keys=days?Array.from({length:days},(_,i)=>`consult-date-${iso(end-i)}`):(await store.list({prefix:`consult-date-${prefix}`})).blobs.map(b=>b.key);
  const accounts=new Map(),required=new Map(),preferred=new Map(),conditions=new Map(),records=[];
  const inc=(map,key,n)=>map.set(key,(map.get(key)||0)+n);
  let total=0,firstRecorded=null,lastRecorded=null;
  for(let offset=0;offset<keys.length;offset+=32){
    const batch=keys.slice(offset,offset+32),entries=await Promise.all(batch.map(key=>store.get(key,{type:'json'})));
    entries.forEach((entry,i)=>{
      if(!entry||!Number.isInteger(entry.day))return;
      const date=iso(entry.day);if(batch[i]!==`consult-date-${date}`||(from&&date<from)||date>today||!date.startsWith(prefix))return;
      for(const [key,count] of Object.entries(entry.counts||{})){
        const [source,must,wish,min,max,minFes,accountNum,priceWon]=JSON.parse(key);
        if(channel!=='all'&&source!==channel)continue;
        total+=count;firstRecorded=!firstRecorded||date<firstRecorded?date:firstRecorded;lastRecorded=!lastRecorded||date>lastRecorded?date:lastRecorded;
        inc(accounts,accountNum,count);must.forEach(id=>inc(required,id,count));wish.forEach(id=>inc(preferred,id,count));inc(conditions,JSON.stringify([must,wish,min,max,minFes]),count);
        if(filter.detail==='full')records.push({date,channel:source,accountNum,priceWon,required:must,preferred:wish,minBand:min,maxBand:max,minFes,count});
      }
    });
  }
  const rank=map=>[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,filter.detail==='full'?Infinity:15);
  return {total,firstRecorded,lastRecorded,accounts:rank(accounts),required:rank(required),preferred:rank(preferred),
    conditions:rank(conditions).map(([key,count])=>[...JSON.parse(key),count]),
    ...(filter.detail==='full'?{records}:{}),meaning:'상담 버튼 클릭 건수이며 실제 상담·구매 완료 건수가 아닙니다.'};
}
