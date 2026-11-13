import {esc, countFesStudents, accountPriceComparison} from './core.mjs?v=14';

export const RESOURCE_ITEMS=[
  {key:'pyroxene',label:'청휘석',icon:'pyroxene',unit:''},
  {key:'eligma',label:'엘리그마',icon:'eligma',unit:''},
  {key:'singleTickets',label:'1뽑 티켓',icon:'single',unit:'장'},
  {key:'tenTickets',label:'10뽑 티켓',icon:'ten',unit:'장'},
  {key:'fesSelectorTickets',label:'페스 선택권',icon:'fes-selector-cutout',unit:'장',defaultAmount:1},
];
export const validAccountNumber=value=>typeof value==='string'&&/^[A-Z]\d{1,2}_\d{8,10}$/.test(value);
export function accountShareUrl(base,number){
  if(!validAccountNumber(number))throw new Error('계정번호를 확인해 주세요.');
  const url=new URL(base);url.search='';url.hash='results';url.searchParams.set('account',number);return url.href;
}
export function sharedAccountId(url){
  const value=new URL(url).searchParams.get('account');
  return value===null?null:validAccountNumber(value)?value:'';
}
export function sharedAccountSelection(accounts,number){return accounts.filter(a=>a.num===number&&a.status!=='sold');}
export function resourceValues(resources){
  return RESOURCE_ITEMS.map(item=>{
    const amount=resources?.[item.key]??item.defaultAmount??0;
    return {...item,display:/[KM]$/.test(String(amount))?String(amount):Number(amount).toLocaleString('ko-KR')+item.unit};
  });
}
export function inventoryResourceMarkup(account){
  if(!account.resources)return '<div class="inventory-resources-empty">재화 미등록 · 스샷 판독 후 확인할 수 있습니다.</div>';
  return `<dl class="inventory-resources" aria-label="${esc(account.num)} 저장된 재화">${resourceValues(account.resources).map(item=>
    `<div><dt><img src="assets/resources/${item.icon}.png" width="20" height="20" alt="">${item.label}</dt><dd>${item.key==='tenTickets'&&account.tenTicketSource!=='blue-icon'?'재판독 필요':esc(item.display)}</dd></div>`).join('')}</dl>`;
}
export function accountToolButtons(number){return `<span class="account-share-actions"><button type="button" data-share-account="${esc(number)}" aria-label="${esc(number)} 링크 복사"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/></svg>링크 복사</button><button type="button" data-image-account="${esc(number)}" aria-label="${esc(number)} 전체 학생 이미지 저장"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/></svg>이미지 저장</button></span>`;}

function loadImage(path){
  return new Promise(resolve=>{
    if(!path){resolve(null);return;}
    const url=new URL(path,location.href);if(url.origin!==location.origin){resolve(null);return;}
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=url.href;
  });
}
function rounded(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
function fitText(ctx,text,width){let result=String(text);while(result.length&&ctx.measureText(result).width>width)result=result.slice(0,-1);return result===String(text)?result:result.slice(0,-1)+'…';}
export async function createAccountImage(account,students,{idfarm=false}={}){
  const owned=[...new Set(account.studentIds)].map(id=>students.find(s=>s.id===id)).filter(Boolean);
  if(owned.length!==new Set(account.studentIds).size)throw new Error('일부 학생 정보가 없습니다. 페이지를 새로고침한 뒤 이미지를 저장해 주세요.');
  const grade=s=>s.grade==='FES'?'페스':s.grade==='한정'?'한정':'통상';
  owned.sort((a,b)=>(a.grade==='FES'?0:a.grade==='한정'?1:2)-(b.grade==='FES'?0:b.grade==='한정'?1:2)||Math.max(0,b.present-b.absent)-Math.max(0,a.present-a.absent));
  const images=await Promise.all(owned.map(s=>loadImage(s.image)));
  const resources=resourceValues(account.resources),icons=await Promise.all(resources.map(r=>loadImage(`assets/resources/${r.icon}.png`)));
  await document.fonts.ready;
  const width=1120,cols=8,cell=129,rowHeight=145,top=280;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=top+Math.ceil(owned.length/cols)*rowHeight+80;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이미지를 만들 수 없습니다.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,canvas.height);
  const header=ctx.createLinearGradient(0,0,width,150);header.addColorStop(0,'#213f6b');header.addColorStop(1,'#1b639d');
  ctx.fillStyle=header;ctx.fillRect(0,0,width,155);
  ctx.fillStyle='#d9e8f8';ctx.font='18px "Malgun Gothic",sans-serif';ctx.fillText('계정번호',44,40);
  ctx.fillStyle='#fff';ctx.font='bold 34px "Malgun Gothic",sans-serif';ctx.fillText(account.num,44,88);
  const won=Math.round(account.price*10000).toLocaleString('ko-KR')+'원';ctx.textAlign='right';ctx.font='bold 41px "Malgun Gothic",sans-serif';ctx.fillText(won,width-44,96);
  const comparison=accountPriceComparison(account.price);
  if(comparison){const before=Math.round(comparison.referencePrice*10000).toLocaleString('ko-KR')+'원';ctx.font='20px "Malgun Gothic",sans-serif';ctx.fillStyle='#d9e8f8';ctx.fillText(before+' →',width-44,44);const tw=ctx.measureText(before+' →').width;ctx.beginPath();ctx.moveTo(width-44-tw,36);ctx.lineTo(width-86,36);ctx.strokeStyle='#d9e8f8';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#ffe5a0';ctx.font='bold 18px "Malgun Gothic",sans-serif';ctx.fillText('20%↓',width-44,131);}
  ctx.textAlign='left';ctx.fillStyle='#254b6d';ctx.font='bold 22px "Malgun Gothic",sans-serif';ctx.fillText(`보유 학생 ${owned.length}명   ·   페스 ${countFesStudents(account.studentIds,students)}명`,44,200);
  resources.forEach((r,i)=>{const x=44+i*211;if(icons[i])ctx.drawImage(icons[i],x,218,29,29);ctx.fillStyle='#617a90';ctx.font='15px "Malgun Gothic",sans-serif';ctx.fillText(r.label,x+35,230);ctx.fillStyle='#214867';ctx.font='bold 18px "Malgun Gothic",sans-serif';ctx.fillText(r.display,x+35,253);});
  let missing=0;
  owned.forEach((s,i)=>{
    const x=44+(i%cols)*cell+cell/2,y=top+Math.floor(i/cols)*rowHeight+45,r=40;
    const color=s.grade==='FES'?'#e626dc':s.grade==='한정'?'#ee5b71':'#df981f';
    const ring=ctx.createLinearGradient(x-r,y-r,x+r,y+r);ring.addColorStop(0,color);ring.addColorStop(.27,'#fff');ring.addColorStop(.47,color);ring.addColorStop(.82,color);ring.addColorStop(1,'#f7efff');
    ctx.beginPath();ctx.arc(x,y,r+4,0,Math.PI*2);ctx.fillStyle=ring;ctx.fill();ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
    if(images[i]){const img=images[i],side=Math.min(img.naturalWidth,img.naturalHeight);ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,x-r,y-r,r*2,r*2);}
    else{missing++;ctx.fillStyle='#edf4fa';ctx.fillRect(x-r,y-r,2*r,2*r);ctx.fillStyle='#31536f';ctx.font='bold 28px "Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.fillText(s.name[0],x,y+10);}
    ctx.restore();ctx.textAlign='center';ctx.fillStyle='#244b6e';ctx.font='bold 19px "Malgun Gothic",sans-serif';ctx.fillText(fitText(ctx,s.name,cell-8),x,y+68);ctx.fillStyle='#61798e';ctx.font='15px "Malgun Gothic",sans-serif';ctx.fillText(grade(s),x,y+93);
  });
  ctx.textAlign='left';ctx.fillStyle='#61798e';ctx.font='17px "Malgun Gothic",sans-serif';ctx.fillText('리세팩토리'+(idfarm?'':'  ·  bluearchivereset.netlify.app'),44,canvas.height-30);
  if(missing){ctx.textAlign='right';ctx.fillText(`초상화 미표시 ${missing}명 · 학생명은 모두 포함`,width-44,canvas.height-30);}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('이미지 저장에 실패했습니다.');return blob;
}
