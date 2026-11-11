export const normalize = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s★☆]/g, '');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = n => `${Number(n).toLocaleString('ko-KR', {maximumFractionDigits:1})}만원`;
export const round1 = n => Math.sign(n) * Math.round((Math.abs(n) + 1e-9) * 10) / 10;
export function accountPriceComparison(price) {
  const saleWon = Math.round(Number(price) * 10000);
  if (!Number.isFinite(saleWon) || saleWon <= 0) return null;
  const referenceWon = Math.round(saleWon / 0.8);
  return {
    referencePrice: referenceWon / 10000,
    discountPercent: Math.round((referenceWon - saleWon) / referenceWon * 1000) / 10,
  };
}
export function aliasIndex(students) {
  const index = new Map();
  for (const s of students) for (const a of [s.name, s.fullName, ...s.aliases]) {
    const key = normalize(a), prev = index.get(key);
    if (prev && prev !== s.id) throw new Error(`다른 학생과 겹치는 약칭: ${a}`);
    index.set(key, s.id);
  }
  return index;
}
const colNum = s => [...s].reduce((a,c) => a * 26 + c.charCodeAt(0) - 64, 0);
export function calculatePrice(studentIds, data, edited = false) {
  const owned = new Set(studentIds), lookup = new Map(data.students.map(s => [s.id,s]));
  const unique = edited && data.settings.deduplicate;
  const columns = data.rules.columns;
  const count = (from, to) => {
    if(edited) {
      const groups={'F:U':[1],'V:AB':[2],'AC:AQ':[3],'AR:BH':[4],'F:AB':[1,2],'F:BH':[1,2,3,4]};
      const wanted=groups[`${from}:${to}`];
      if(wanted){const matching=data.students.filter(s=>wanted.includes(s.pricingGroup)&&owned.has(s.id));return matching.length;}
    }
    let found = columns.filter(c => colNum(c.column) >= colNum(from) && colNum(c.column) <= colNum(to) && owned.has(c.studentId));
    return unique ? new Set(found.map(c => c.studentId)).size : found.length;
  };
  const weighted = terms => terms.reduce((sum,[from,to,w]) => sum + count(from,to)*w, 0);
  const seen = new Set();
  let base = 0;
  for (const c of columns) {
    if (unique && seen.has(c.studentId)) continue;
    seen.add(c.studentId);
    const weights = edited ? lookup.get(c.studentId) : data.rules.weights[c.column];
    base += owned.has(c.studentId) ? weights.present : weights.absent;
  }
  if (edited) for (const s of data.students) {
    if (!seen.has(s.id)) base += owned.has(s.id) ? s.present : s.absent;
  }
  base = round1(base);
  const blocks = data.rules.blocks.map(b => {
    const n = count(...b.range), rule = b.rules.find(r => n > r.above);
    return round1(rule ? weighted(rule.terms) : 0);
  });
  const fesCount = edited ? data.students.filter(s=>s.grade==='FES'&&s.pricingGroup>0&&owned.has(s.id)).length : count('F','Q') + count('U','U');
  const maxFes=Math.max(...data.rules.fes.map(r=>r.count));
  const fesRule = data.rules.fes.find(r => r.count === (edited?Math.min(fesCount,maxFes):fesCount));
  const fes = round1(fesRule ? weighted(fesRule.terms) : 0);
  const totalCount = count('F','BH');
  let totalRules = data.rules.total;
  if (edited && data.settings.fixCountThresholds) {
    totalRules = [...totalRules.filter(r => r.op === '>'), ...totalRules.filter(r => r.op === '<').sort((a,b)=>a.count-b.count)];
  }
  const total = totalRules.find(r => r.op === '>' ? totalCount > r.count : totalCount < r.count)?.value ?? 0;
  const scale = edited ? data.settings.scale : data.rules.scale;
  const raw = round1((base + blocks.reduce((a,b)=>a+b,0) + fes + total)*scale);
  return {price: Math.max(0,raw), raw, base, blocks, fes, fesCount, total, totalCount, scale, clamped: raw < 0};
}
export function quality(account, students) {
  const byId = new Map(students.map(s=>[s.id,s]));
  return round1(account.studentIds.reduce((n,id)=> {
    const s=byId.get(id); return n+Math.max(0,(s?.present??0)-(s?.absent??0));
  },0));
}
const fesStudentIds = students => new Set(students.filter(student=>student.grade==='FES').map(student=>student.id));
const countOwnedFes = (studentIds, fesIds) => [...new Set(studentIds)].reduce((count,id)=>count+Number(fesIds.has(id)),0);
export function countFesStudents(studentIds, students) {
  return countOwnedFes(studentIds, fesStudentIds(students));
}
export function filterAccounts(accounts, {required=[], preferred=[], min=0,max=Infinity, minFes=0, sort='recommended', relaxed=false}, students) {
  const fesIds = minFes>0 ? fesStudentIds(students) : null;
  return accounts.filter(a=>a.status!=='sold' && a.price>=min && a.price<=max && (!fesIds || countOwnedFes(a.studentIds,fesIds)>=minFes) && (relaxed || required.every(id=>a.studentIds.includes(id))))
    .map(a=>({...a, missing:required.filter(id=>!a.studentIds.includes(id)), preferredMatches:preferred.filter(id=>a.studentIds.includes(id)).length, quality:quality(a,students)}))
    .sort((a,b)=> a.missing.length-b.missing.length || (sort==='priceAsc' ? a.price-b.price : sort==='priceDesc' ? b.price-a.price : b.preferredMatches-a.preferredMatches || b.quality-a.quality || a.price-b.price) || a.num.localeCompare(b.num));
}
export const SOURCE_PCS=['A','B','C','S','J'];
export const SOURCE_SLOTS=Array.from({length:10},(_,i)=>String(i+1));
const SOURCE_GROUP=/^([ABCSJ])(10|[1-9])$/i;

export function accountLocation(num) {
  const match=/^([ABCSJ])(10|[1-9])_(\d{8}(?:\d{2})?)$/i.exec(num);
  return match?{pc:match[1].toUpperCase(),slot:match[2],suffix:match[3]}:null;
}

export function folderLocation(path) {
  const folders=path.split('/').slice(0,-1);
  const matches=new Set();
  for (let i=0;i<folders.length;i++) {
    const folder=folders[i].toUpperCase();
    if (SOURCE_GROUP.test(folder)) matches.add(folder);
    if (SOURCE_PCS.includes(folder)&&SOURCE_SLOTS.includes(folders[i+1])) matches.add(folder+folders[i+1]);
  }
  if (matches.size!==1) return null;
  const [,pc,slot]=SOURCE_GROUP.exec([...matches][0]);
  return {pc,slot};
}

export function parseImport(text, format, group, students, {requireLocation=false,skipAccounts}={}) {
  const index=aliasIndex(students), rows=[], unknown=new Map(), errors=[], seen=new Set();
  let skipped=0;
  const prefix=group.trim().toUpperCase();
  text.split(/\r\n?|\n/).forEach((line,i)=> {
    if(!line.trim())return;
    const parts=line.split(',').map(x=>x.trim());
    const offset=format==='priced'?2:1, rawNum=parts[format==='priced'?1:0];
    const price=format==='priced'?Number(parts[0]):null;
    const tokens=parts.slice(offset).filter(Boolean);
    if(!tokens.length || !rawNum || (format==='priced' && (!parts[0]||!Number.isFinite(price)||price<0))) {
      errors.push(`${i+1}행: 형식 또는 가격을 확인해 주세요.`);return;
    }
    let num=group.trim()?`${group.trim()}_${rawNum}`:rawNum;
    if (requireLocation) {
      const location=accountLocation(rawNum);
      if (location) {
        const rowPrefix=location.pc+location.slot;
        if (prefix&&prefix!==rowPrefix) {
          errors.push(`${i+1}행: ${rawNum}의 출처 ${rowPrefix}와 선택한 ${prefix}가 다릅니다.`);return;
        }
        num=`${rowPrefix}_${location.suffix}`;
      } else if (!/^\d{8}(?:\d{2})?$/.test(rawNum)) {
        errors.push(`${i+1}행: 계정번호는 8자리 또는 10자리 숫자여야 합니다. 슬롯을 포함한 A7_10071752 형식도 사용할 수 있습니다.`);return;
      } else if (!SOURCE_GROUP.test(prefix)) {
        errors.push(`${i+1}행: ${rawNum}의 PC와 앱플레이어 번호를 선택해 주세요.`);return;
      } else {
        num=`${prefix}_${rawNum}`;
      }
    }
    if (skipAccounts?.has(num)) {skipped++;return;}
    if(seen.has(num)){errors.push(`${i+1}행: 계정번호가 중복됩니다 (${num}).`);return;}
    seen.add(num);
    const ids=[], unresolved=[];
    for(const token of tokens) {
      const id=index.get(normalize(token));
      if(id)ids.push(id);else {unknown.set(token,(unknown.get(token)||0)+1);unresolved.push(token);}
    }
    rows.push({num,price,studentIds:[...new Set(ids)],unresolved,line:i+1});
  });
  return {rows, unknown:[...unknown].map(([name,count])=>({name,count})), errors, skipped};
}

export function parseRosterBatch(sources, format, students, {skipAccounts}={}) {
  const rows=[],errors=[],unknown=new Map(),seen=new Map();
  let skipped=0;
  for (const source of sources) {
    const {label,text,pc='',slot=''}=source;
    if (!text.trim()) continue;
    if ((pc||slot)&&(!SOURCE_PCS.includes(pc)||!SOURCE_SLOTS.includes(slot))) {
      errors.push(`${label}: PC와 앱플레이어를 모두 선택해 주세요.`);continue;
    }
    const parsed=parseImport(text,format,pc+slot,students,{requireLocation:true,skipAccounts});
    skipped+=parsed.skipped;
    errors.push(...parsed.errors.map(error=>`${label} · ${error}`));
    for (const entry of parsed.unknown) unknown.set(entry.name,(unknown.get(entry.name)||0)+entry.count);
    for (const row of parsed.rows) {
      const previous=seen.get(row.num);
      if (previous) {
        errors.push(`${label} ${row.line}행: ${row.num}이(가) ${previous.source} ${previous.line}행에도 있습니다.`);
        continue;
      }
      const located={...row,source:label,...accountLocation(row.num)};
      seen.set(row.num,located);
      rows.push(located);
    }
  }
  return {rows,errors,unknown:[...unknown].map(([name,count])=>({name,count})),skipped};
}
export const STATS_KEY='resetfactory.searchStats.v1';
export const CONSENT_KEY='resetfactory.searchStats.enabled';
export function readStats(storage=localStorage) {
  try {return JSON.parse(storage.getItem(STATS_KEY)||'[]');}catch{return [];}
}
export function recordSearch({required, preferred, min,max}, storage=localStorage, now=new Date()) {
  if(storage.getItem(CONSENT_KEY)!=='yes')return false;
  // Daily, deduplicated condition counts only. No timestamps, account IDs, IP or identity.
  const date = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now);
  const band=n=>Math.floor(Math.max(0,n)/5)*5;
  const item={date,required:[...required].sort(),preferred:[...preferred].sort(),minBand:band(min),maxBand:Number.isFinite(max)?band(max):null};
  let rows=readStats(storage).filter(r=>r.date>=new Date(now.getTime()-27*86400000).toISOString().slice(0,10));
  const key=JSON.stringify(item);
  if(rows.some(r=>JSON.stringify(r)===key))return false;
  rows.push(item);storage.setItem(STATS_KEY,JSON.stringify(rows.slice(-1000)));return true;
}
export function download(name, text, type='application/json') {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
