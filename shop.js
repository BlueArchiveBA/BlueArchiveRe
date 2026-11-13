import {RESOURCE_ITEMS,accountToolButtons,accountShareUrl,sharedAccountId,sharedAccountSelection,createAccountImage} from './account-tools.mjs?v=1';
import {esc, normalize, filterAccounts, countFesStudents, accountPriceComparison, contactHoursState} from './core.mjs?v=13';
import {createFavorites} from './favorites.mjs?v=2';

const $=id=>document.getElementById(id);
const siteConsult=$('site-consult');
let data,byId,selected={required:[],preferred:[]},mode='required',grade='추천 학생',page=1,relaxed=false,current=[],applied;
const pageSize=12;
const rosterPreviewSize=24;
const gradeClasses={FES:'grade-fes',한정:'grade-limited',통상:'grade-regular'};
const accountMoney=price=>`${Math.round(price*10000).toLocaleString('ko-KR')}원`;
const previousPrice=account=>data.priceComparison?.previousPrices?.[account.num];
const resourceItems=RESOURCE_ITEMS;
let sharedNumber=null;
let toastTimer;
let consultationPending=false;
const favorites=createFavorites({getCatalog:()=>data,toast,consultLink});
function toast(message,duration=2500){
  const notice=$('toast');
  notice.textContent=message;
  notice.classList.add('show');
  const feedback=document.querySelector('.favorites-dialog[open] [data-favorites-feedback]');
  if(feedback)feedback.textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{
    notice.classList.remove('show');
    const current=document.querySelector('.favorites-dialog[open] [data-favorites-feedback]');
    if(current)current.textContent='';
  },duration);
}
function portrait(s){return s.image?`<img src="${esc(s.image)}" alt="" loading="lazy" width="80" height="80">`:`<span class="avatar-fallback">${esc(s.name.slice(0,1))}</span>`;}
function displayGrade(student){return student.grade==='FES'||student.grade==='한정'?student.grade:'통상';}
function gradeLabel(student){const value=displayGrade(student);return `<span class="student-grade">${value==='FES'?'페스':value}</span>`;}
function studentWeight(student){return Math.max(0,student.present-student.absent);}
function portraitWithGrade(student,match){
  const marker=match?`<span class="selection-check ${match==='선호'?'preferred-check':''}" aria-hidden="true">${match==='선호'?'♥':'✓'}</span>`:'';
  return `<span class="portrait-wrap ${gradeClasses[displayGrade(student)]}">${portrait(student)}${marker}</span>`;
}
function studentCard(student){
  const match=selected.required.includes(student.id)?'필수':selected.preferred.includes(student.id)?'선호':'';
  const label=`${student.fullName} · ${displayGrade(student)==='FES'?'페스':displayGrade(student)}`;
  return `<button type="button" class="student-card" data-student="${esc(student.id)}" title="${esc(label)}" aria-label="${esc(label)}${match?` · ${match} 선택됨`:''}" aria-pressed="${Boolean(match)}">${portraitWithGrade(student,match)}<span class="student-name">${esc(student.name)}</span>${gradeLabel(student)}</button>`;
}
function renderStudents(){
  if(!data) return;
  const query=normalize($('student-search').value);
  const students=data.students.filter(student=>{
    if(query) return [student.name,student.fullName,...student.aliases].some(alias=>normalize(alias).includes(query));
    if(grade==='전체') return true;
    if(grade==='추천 학생') return student.grade==='FES'||studentWeight(student)>0;
    return displayGrade(student)===grade;
  });
  $('student-grid').innerHTML=students.map(studentCard).join('')||'<div class="empty-state"><p>해당 이름의 학생이 없어요. 다른 이름이나 약칭으로 검색해 보세요.</p></div>';
  $('student-visible-count').textContent=`${students.length}명`;
}
function renderSelected(){
  for(const type of ['required','preferred']){
    $(`${type}-chips`).innerHTML=selected[type].map(id=>{
      const student=byId.get(id);
      const grade=displayGrade(student);
      const label=esc(`${student.fullName} · ${grade==='FES'?'페스':grade}`);
      return `<button type="button" class="chip ${type==='preferred'?'optional':''}" data-remove="${esc(id)}" title="${label}" aria-label="${label} 선택 해제">
        ${portraitWithGrade(student)}<span class="chip-student-text"><span>${esc(student.name)}</span>${gradeLabel(student)}</span><span class="chip-remove" aria-hidden="true">×</span>
      </button>`;
    }).join('')||'<span class="empty-selection">선택한 학생 없음</span>';
  }
  $('selected-count').textContent=selected.required.length+selected.preferred.length;
  updateSearchDock();
}
function markFiltersChanged(){ $('filter-status').textContent='계정 찾기를 누르면 변경한 조건으로 검색합니다.'; updateSearchDock(); }
function updateSearchDock(){
  const dock=$('mobile-search-dock');
  if(!dock)return;
  const selectedCount=selected.required.length+selected.preferred.length;
  $('dock-selection').textContent=selectedCount?`학생 ${selectedCount}명 선택`:'학생 조건 없음';
  const minimum=Number($('min-fes').value)||0;
  const max=$('max-price').value,min=Number($('min-price').value)||0;
  const budget=max!==''?`${min?`${min}~`:''}${Number(max)}만원${min?'':' 이하'}`:min?`${min}만원 이상`:'예산 제한 없음';
  $('dock-options').textContent=(minimum?`페스 ${minimum}명 이상 · `:'')+budget;
  const finder=$('finder').getBoundingClientRect(),button=$('find-button').getBoundingClientRect();
  const header=document.querySelector('.site-header').getBoundingClientRect().bottom;
  const buttonVisible=button.top>=header&&button.bottom<=window.innerHeight;
  const finderVisible=finder.top<window.innerHeight-100&&finder.bottom>header+100;
  const hidden=!(window.innerWidth<=700&&finderVisible&&!buttonVisible&&$('price-notice').hidden&&!document.querySelector('dialog[open]'));
  if(dock.hidden!==hidden)dock.hidden=hidden;
}
function selectStudent(id){const other=mode==='required'?'preferred':'required';selected[other]=selected[other].filter(x=>x!==id);if(selected[mode].includes(id))selected[mode]=selected[mode].filter(x=>x!==id);else selected[mode].push(id);renderSelected();renderStudents();markFiltersChanged();}
function renderFesOptions(){
  const maximum=data.accounts.reduce((max,account)=>Math.max(max,countFesStudents(account.studentIds,data.students)),0);
  const start=Math.min(8,maximum);
  $('min-fes').innerHTML='<option value="0">상관없음 · 전체</option>'+
    (maximum?Array.from({length:maximum-start+1},(_,index)=>start+index)
      .map(count=>`<option value="${count}">${count}명 이상</option>`).join(''):'');
  $('min-fes').value='0';
}
function getFilters(){const min=Number($('min-price').value),max=$('max-price').value===''?Infinity:Number($('max-price').value),minFes=Number($('min-fes').value);if(!Number.isFinite(min)||min<0||max<0||min>max)throw new Error('최소·최대 가격 범위를 확인해 주세요.');return {required:[...selected.required],preferred:[...selected.preferred],min,max,minFes,sort:$('sort-order').value};}
function search({scroll=false,relax=false,record=false,keepShared=false}={}){
  if(!data)return;
  try{
    const filters=getFilters();
    if(!keepShared)clearSharedAccount();
    applied=filters;
    relaxed=relax;
    current=sharedNumber!==null?filterAccounts(sharedAccountSelection(data.accounts,sharedNumber),{...filters,required:[],preferred:[],min:0,max:Infinity,minFes:0,relaxed:false},data.students):filterAccounts(data.accounts,{...filters,relaxed},data.students);
    page=1;
    renderAccounts();
    $('filter-status').textContent='';
    if(record && location.protocol==='https:'){
      const band=value=>Math.floor(Math.min(value,999)/5)*5;
      void fetch('/.netlify/functions/search-stats',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          channel:document.body.classList.contains('idfarm-body')?'idfarm':'website',
          required:filters.required,
          preferred:filters.preferred,
          minBand:band(filters.min),
          maxBand:Number.isFinite(filters.max)?band(filters.max):null,
          minFes:filters.minFes,
        }),
        keepalive:true,
        referrerPolicy:'no-referrer',
      }).catch(()=>{});
    }
    if(scroll)$('results').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){toast(error.message);}
}
function mini(student){
  const match=applied.required.includes(student.id)?'필수':applied.preferred.includes(student.id)?'선호':'';
  const label=`${student.fullName} · ${displayGrade(student)==='FES'?'페스':displayGrade(student)}${match?` · ${match} 조건`:''}`;
  return `<div class="mini-student" title="${esc(label)}">${portraitWithGrade(student,match)}<span class="student-name" aria-label="${esc(label)}">${esc(student.name)}</span>${gradeLabel(student)}</div>`;
}
function orderedStudents(account){
  const priority=student=>applied.required.includes(student.id)?0:applied.preferred.includes(student.id)?1:student.grade==='FES'?2:3;
  return account.studentIds.map(id=>byId.get(id)).filter(Boolean)
    .sort((a,b)=>priority(a)-priority(b)||studentWeight(b)-studentWeight(a)||a.order-b.order);
}
function consultLink(account){
  if(!siteConsult) return document.body.classList.contains('idfarm-body')?`<a class="primary" href="#consultation" data-consult="${esc(account.num)}">1:1 상담 →</a>`:'';
  const label=esc(siteConsult.dataset.accountLabel);
  return `<a class="kakao-button" href="${esc(siteConsult.href)}" data-consult="${esc(account.num)}" aria-label="${esc(account.num)} 번호와 가격 복사 후 ${label}">${label} <span aria-hidden="true">↗</span></a>`;
}

function accountResources(resources) {
  const items = resourceItems.map(({key, label, icon, unit, defaultAmount}) => {
    const saved = resources?.[key];
    const amount = saved ?? defaultAmount ?? 0;
    const display = /[KM]$/.test(String(amount))
      ? amount : Number(amount).toLocaleString('ko-KR') + unit;
    return `<div class="resource-item${key === 'fesSelectorTickets' ? ' resource-fes-selector' : ''}" title="${label} ${esc(display)}">
      <dt><img src="assets/resources/${icon}.png" alt="" width="22" height="22"><span>${label}</span></dt>
      <dd>${esc(display)}</dd>
    </div>`;
  });
  return `<dl class="account-resources" aria-label="보유 재화">${items.join('')}</dl>`;
}

function accountCard(account,index){
  const students=orderedStudents(account),fes=countFesStudents(account.studentIds,data.students);
  const badge=account.missing.length?'필수 학생 일부 미포함':applied.required.length?'필수 조건 충족':'';
  const shown=students.slice(0,rosterPreviewSize), remaining=students.slice(rosterPreviewSize);
  const comparison=accountPriceComparison(account.price);
  return `<article class="account-card">
    <header class="account-header"><div><span class="account-number-label">계정번호</span><h3>${esc(account.num)}</h3></div>
      <p class="account-price"><span class="account-price-flow">${comparison?`<span class="account-price-before" title="현재 판매가를 0.8로 나눈 뒤 천 원 단위로 반올림한 금액"><del>${accountMoney(comparison.referencePrice)}</del></span><span class="account-price-arrow" aria-hidden="true">→</span>`:''}<span><span class="sr-only">현재 판매가 </span>${accountMoney(account.price)}</span></span>${comparison?`<span class="account-price-discount" aria-label="20% 할인 기준">20%↓</span>`:''}</p>
    </header>
    <div class="account-body">
      <div class="account-meta"><strong>보유 학생 ${account.studentIds.length}명</strong><span>페스 ${fes}명</span>${applied.preferred.length?`<span>선호 ${account.preferredMatches}/${applied.preferred.length}명</span>`:''}${badge?`<span class="match-badge">${badge}</span>`:''}<span class="account-secondary-actions">${favorites.cardButton(account)}${accountToolButtons(account.num)}</span></div>
      ${accountResources(account.resources)}
      <div class="account-students">${shown.map(mini).join('')}</div>
      ${remaining.length?`<button type="button" class="roster-toggle" data-open-roster aria-expanded="false" aria-controls="roster-${index}">전체 학생 보기</button>
        <div class="roster-more" id="roster-${index}" tabindex="-1" hidden><div class="account-students">${remaining.map(mini).join('')}</div><button type="button" class="roster-toggle" data-close-roster>학생 접기</button></div>`:''}
      ${account.missing.length?`<p class="missing-note">빠진 필수 학생 ${account.missing.map(id=>esc(byId.get(id).name)).join(', ')}</p>`:''}
      <div class="account-actions">
        <button type="button" class="account-copy-button" data-copy="${esc(account.num)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="2"/>
            <path d="M16 5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2"/>
          </svg>
          번호·가격 복사
        </button>${consultLink(account)}
      </div>
    </div>
  </article>`;
}

function renderAccounts(){const count=current.length;
  $('shared-account-notice').hidden=sharedNumber===null;
  $('shared-account-number').textContent=sharedNumber||'계정번호 확인 필요';
  $('sort-order').disabled=sharedNumber!==null;
  if(sharedNumber!==null&&!count){$('result-count').textContent='0개';$('result-description').textContent='공유받은 계정을 확인했습니다.';$('account-grid').innerHTML='<div class="empty-state"><h3>현재 조회할 수 없는 계정입니다.</h3><p>판매완료 또는 게시 상태가 변경되었을 수 있습니다. 전체 계정 보기에서 다른 계정을 찾아보세요.</p></div>';$('pagination').innerHTML='';$('pagination-top').hidden=true;return;}
$('result-count').textContent=`${count.toLocaleString()}개`;$('result-description').textContent=relaxed
    ?`필수 학생 조건을 완화한 목록입니다. 각 계정에서 빠진 학생을 확인하세요.${applied.minFes?` 페스 ${applied.minFes}명 이상 조건은 유지합니다.`:''}`
    :sharedNumber!==null?'공유받은 계정 한 개를 표시합니다.':`필수 ${applied.required.length}명 · 선호 ${applied.preferred.length}명 · ${applied.minFes?`페스 ${applied.minFes}명 이상 · `:''}${accountMoney(applied.min)} ~ ${Number.isFinite(applied.max)?accountMoney(applied.max):'상한 없음'}`;
  if(!count){$('account-grid').innerHTML=`<div class="empty-state"><h3>현재 조건에 맞는 계정이 없어요.</h3><p>예산을 넓히거나 ${applied.minFes?'페스 보유 수·필수 학생 조건을 낮춰보세요.':'꼭 포함할 학생을 줄여보세요.'}</p>${applied.required.length?`<button id="relax-button">같은 예산${applied.minFes?'·페스 조건':''}에서 가까운 조합 보기 →</button>`:''}</div>`;$('pagination').innerHTML='';$('pagination-top').innerHTML='';$('pagination-top').hidden=true;$('relax-button')?.addEventListener('click',()=>search({relax:true}));favorites.refreshButtons();return;}
  $('account-grid').innerHTML=current.slice((page-1)*pageSize,page*pageSize).map(accountCard).join('');
  const pages=Math.ceil(count/pageSize);let buttons=[];for(let n=1;n<=pages;n++){if(n===1||n===pages||Math.abs(n-page)<=2)buttons.push(`<button data-page="${n}" class="${n===page?'active':''}" ${n===page?'aria-current="page"':''}>${n}</button>`);else if(n===page-3||n===page+3)buttons.push('<span>…</span>');}$('pagination').innerHTML=pages>1?`<button data-page="${page-1}" ${page===1?'disabled':''} aria-label="이전 페이지">‹</button>${buttons.join('')}<button data-page="${page+1}" ${page===pages?'disabled':''} aria-label="다음 페이지">›</button>`:'';
  $('pagination-top').hidden=pages<=1;
  $('pagination-top').innerHTML=pages>1?`<span><strong>${page}</strong> / ${pages} 페이지</span><div><button type="button" data-page="${page-1}" ${page===1?'disabled':''}>‹ 이전</button><button type="button" data-page="${page+1}" ${page===pages?'disabled':''}>다음 ›</button></div>`:'';
  favorites.refreshButtons();
}
async function copyAccount(num,consultUrl){
  const account=data.accounts.find(item=>item.num===num);
  const text=`${account.num} (${accountMoney(account.price)})`;
  try {
    await navigator.clipboard.writeText(text);
    toast('계정번호와 가격이 복사되었습니다.',consultUrl?900:1500);
    return true;
  } catch {
    const next=consultUrl?`<p><a class="kakao-button" href="${esc(consultUrl)}">상담 열기</a></p>`:'';
    showInfo('계정번호 복사',`<p>아래 내용을 선택해 복사해 주세요.</p><input style="width:100%" aria-label="계정번호와 가격" readonly value="${esc(text)}">${next}`);
    return false;
  }
}

let lastConsultClick={key:null,time:0};
function recordConsultation(link){
  if(location.protocol!=='https:')return;
  const account=data.accounts.find(a=>a.num===link.dataset.consult);if(!account||!applied)return;
  const band=value=>Math.floor(Math.min(value,999)/5)*5;const condition={event:'consult',channel:document.body.classList.contains('idfarm-body')?'idfarm':'website',required:applied.required,preferred:applied.preferred,minBand:band(applied.min),maxBand:Number.isFinite(applied.max)?band(applied.max):null,minFes:applied.minFes,accountNum:account.num,priceWon:Math.round(account.price*10000)};
  const key=JSON.stringify(condition);if(lastConsultClick.key===key&&Date.now()-lastConsultClick.time<5000)return;lastConsultClick={key,time:Date.now()};
  void fetch('/.netlify/functions/search-stats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(condition),keepalive:true,referrerPolicy:'no-referrer'}).catch(()=>{});
}
async function openConsultation(link){
  if(consultationPending) return;
  consultationPending=true;
  if(!await copyAccount(link.dataset.consult,link.href)){
    consultationPending=false;
    return;
  }
  setTimeout(()=>{
    consultationPending=false;
    location.assign(link.href);
  },1200);
}
function setRosterExpanded(trigger,expanded){
  const roster=$(trigger.getAttribute('aria-controls'));
  trigger.setAttribute('aria-expanded',String(expanded));
  trigger.hidden=expanded;
  roster.hidden=!expanded;
  if(expanded)roster.focus({preventScroll:true});
  else trigger.focus();
}
function showInfo(title,html){$('info-title').textContent=title;$('info-content').innerHTML=html;$('info-dialog').showModal();}
document.addEventListener('click',event=>{
  const consult=event.target.closest('a[data-consult]');
  if(consult){
    recordConsultation(consult);
    if(event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){
      event.preventDefault();
      if(document.body.classList.contains('idfarm-body')){void copyAccount(consult.dataset.consult);$('consultation')?.scrollIntoView({behavior:'smooth'});}else openConsultation(consult);
    }
    return;
  }
  const button=event.target.closest('button');
  if(!button)return;
  if(button.hasAttribute('data-open-roster'))setRosterExpanded(button,true);
  if(button.hasAttribute('data-close-roster'))setRosterExpanded(button.closest('.account-card').querySelector('[data-open-roster]'),false);
  const {student,remove,copy,close,page:targetPage,budget,budgetMin,shareAccount,imageAccount}=button.dataset;
  if(shareAccount){void copyShareLink(shareAccount);return;}
  if(imageAccount){void saveAccountImage(imageAccount,button);return;}
  if(student)selectStudent(student);
  if(remove){
    selected.required=selected.required.filter(id=>id!==remove);
    selected.preferred=selected.preferred.filter(id=>id!==remove);
    renderSelected();
    renderStudents();
    markFiltersChanged();
  }
  if(copy)copyAccount(copy);
  if(close)$(close).close();
  if(targetPage){
    page=Number(targetPage);
    renderAccounts();
    $('results').scrollIntoView({behavior:'smooth'});
  }
  if(budget){
    $('min-price').value=budgetMin??0;
    $('max-price').value=budget;
    markFiltersChanged();
  }
});
for (const id of ['min-price','max-price']) $(id).addEventListener('input',markFiltersChanged);
$('min-fes').addEventListener('change',markFiltersChanged);
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('student-search').addEventListener('input',renderStudents);
$('grade-tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;grade=b.dataset.grade;document.querySelectorAll('#grade-tabs button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b));});renderStudents();});
for(const type of ['required','preferred'])$(`mode-${type}`).addEventListener('click',()=>{mode=type;for(const t of ['required','preferred']){$(`mode-${t}`).classList.toggle('active',t===type);$(`mode-${t}`).setAttribute('aria-pressed',String(t===type));}});
$('find-button').addEventListener('click',()=>search({scroll:true,record:true}));
$('dock-find-button').addEventListener('click',()=>$('find-button').click());
$('sort-order').addEventListener('change',()=>{if(!applied||sharedNumber!==null)return;applied.sort=$('sort-order').value;current=filterAccounts(data.accounts,{...applied,relaxed},data.students);page=1;renderAccounts();});
$('reset-filters').addEventListener('click',()=>{selected={required:[],preferred:[]};$('min-price').value=0;$('max-price').value='';$('min-fes').value='0';renderSelected();renderStudents();search();});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('student-search').focus();}});
function clearSharedAccount(){sharedNumber=null;const url=new URL(location.href);if(url.searchParams.has('account')){url.searchParams.delete('account');history.replaceState(null,'',url.href);}}
$('show-all-accounts').addEventListener('click',()=>{$('reset-filters').click();$('results').scrollIntoView({behavior:'instant',block:'start'});});
async function copyShareLink(number){const url=accountShareUrl(location.href,number);try{await navigator.clipboard.writeText(url);toast('계정 링크가 복사되었습니다.');}catch{showInfo('계정 링크 복사',`<p>아래 주소를 복사해 주세요.</p><input style="width:100%" readonly aria-label="계정 링크" value="${esc(url)}">`);}}
async function saveAccountImage(number,button){const account=data.accounts.find(a=>a.num===number);if(!account)return;button.disabled=true;toast('전체 학생을 이미지로 만들고 있습니다.',10000);try{const blob=await createAccountImage(account,data.students,{idfarm:document.body.classList.contains('idfarm-body')});const url=URL.createObjectURL(blob);showInfo('계정 이미지 저장',`<p>전체 학생을 포함했습니다. 휴대폰에서는 이미지를 길게 눌러 저장할 수도 있습니다.</p><a class="primary" id="save-account-png" href="${url}" download="${esc(number)}.png">PNG 저장</a><img class="account-image-preview" src="${url}" alt="${esc(number)} 전체 학생">`);$('save-account-png').click();$('info-dialog').addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});toast('전체 학생 이미지가 준비되었습니다.');}catch(error){toast(error.message);}finally{button.disabled=false;}}
function showPriceNotice(){
  const comparison=data.priceComparison;
  const hours=contactHoursState();
  const today=hours.date;
  const key=`resetfactory.priceNotice.${comparison?.sourceDate??''}`;
  const hoursKey='resetfactory.contactHoursNotice';
  let showPrice=Boolean(comparison&&Object.keys(comparison.previousPrices??{}).length);
  let showHours=hours.delayed;
  try{
    showPrice&&=localStorage.getItem(key)!==today;
    showHours&&=localStorage.getItem(hoursKey)!==today;
  }catch{}
  if(!showPrice&&!showHours)return;
  const notice=$('price-notice');
  $('price-notice-title').textContent=showPrice?'계정 가격 인하!':'상담 답변 안내';
  $('price-notice-summary').hidden=!showPrice;
  $('price-notice-basis').hidden=!showPrice;
  $('contact-hours-popup').hidden=!showHours;
  if(showPrice){
    const hasTwentyPercentReduction=data.accounts.some(account=>Math.round(account.price*10000)*5<=Math.round(previousPrice(account)*10000)*4);
    $('price-notice-summary').textContent=hasTwentyPercentReduction
      ?'20% 이상 가격 인하 적용'
      :'계정 카드에서 갱신된 판매가를 확인하세요.';
  }
  const dismiss=()=>{notice.hidden=true;};
  $('price-notice-close').addEventListener('click',dismiss);
  $('price-notice-link').addEventListener('click',dismiss);
  $('price-notice-today').addEventListener('click',()=>{
    try{
      if(showPrice)localStorage.setItem(key,today);
      if(showHours)localStorage.setItem(hoursKey,today);
    }catch{}
    dismiss();
  });
  notice.hidden=false;
}
async function init(){try{const r=await fetch('./catalog.json');if(!r.ok)throw new Error('재고를 불러오지 못했습니다.');data=await r.json();byId=new Map(data.students.map((student,order)=>[student.id,{...student,order}]));$('inventory-count').textContent=`${data.accounts.length.toLocaleString()}개`;$('source-date').textContent=`목록 업데이트 ${data.sourceDate}`;
  const url=new URL(location.href);
  for(const key of ['must','wish','min','max','sort','minFes'])if(url.searchParams.has(key))url.searchParams.delete(key);
  if(url.href!==location.href)history.replaceState(null,'',url.href);
  $('student-search').value='';
  $('min-price').value='0';
  $('max-price').value='';
  $('sort-order').value='recommended';
  sharedNumber=sharedAccountId(location.href);
  favorites.init();renderFesOptions();renderStudents();renderSelected();search({keepShared:true});if(sharedNumber===null)showPriceNotice();else requestAnimationFrame(()=>$('results').scrollIntoView({behavior:'instant',block:'start'}));
  const observer=new IntersectionObserver(updateSearchDock);
  observer.observe($('finder'));observer.observe($('find-button'));
  new MutationObserver(updateSearchDock).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','open']});
  window.addEventListener('scroll',updateSearchDock,{passive:true});
  window.addEventListener('resize',updateSearchDock);
  updateSearchDock();
}catch(e){$('account-grid').innerHTML=`<div class="empty-state"><h3>목록을 불러오지 못했어요.</h3><p>${esc(e.message)}</p><button onclick="location.reload()">다시 시도</button></div>`;}}
init();
