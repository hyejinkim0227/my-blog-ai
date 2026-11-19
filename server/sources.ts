import { emptyPlace, type Place } from '../shared';
import { HttpError } from './errors';

type GooglePlace={
  id:string;displayName?:{text:string};formattedAddress?:string;googleMapsUri?:string;websiteUri?:string;
  internationalPhoneNumber?:string;regularOpeningHours?:{weekdayDescriptions?:string[]};location?:{latitude:number;longitude:number};
};
export async function lookup(query:string):Promise<Place[]>{
  const key=process.env.GOOGLE_PLACES_API_KEY;
  if(!key) throw new HttpError(503,'장소 검색 API 키가 없습니다. 장소 정보를 직접 입력할 수 있습니다.');
  const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
    method:'POST',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.websiteUri,places.internationalPhoneNumber,places.regularOpeningHours,places.location'},
    body:JSON.stringify({textQuery:query,languageCode:'ko',maxResultCount:12}),
  });
  if(!response.ok) throw new HttpError(502,'장소 검색에 실패했습니다. API 설정 또는 검색어를 확인하세요.');
  const result: {places?:GooglePlace[]}=await response.json();
  return (result.places||[]).map(item=>({...emptyPlace,id:item.id,name:item.displayName?.text||'',address:item.formattedAddress||'',
    map:item.googleMapsUri||'',website:item.websiteUri||'',phone:item.internationalPhoneNumber||'',
    hours:item.regularOpeningHours?.weekdayDescriptions?.join('\n')||'',source:'Google Maps',
    checked:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),
    closed:item.regularOpeningHours?.weekdayDescriptions?.filter(line=>/휴무|closed/i.test(line)).join(', ')||'',
    latitude:item.location?.latitude??null,longitude:item.location?.longitude??null,
  }));
}
export function blogId(value:string){
  let url:URL;
  try{url=new URL(value);}catch{throw new HttpError(400,'네이버 블로그 URL을 입력하세요.');}
  const id=url.hostname==='rss.blog.naver.com'?url.pathname.split('/')[1]?.replace(/\.xml$/i,''):
    url.searchParams.get('blogId')||url.pathname.split('/')[1];
  if(!['blog.naver.com','m.blog.naver.com','rss.blog.naver.com'].includes(url.hostname)||!/^https?:$/.test(url.protocol)||!id||!/^[a-z0-9_-]{2,30}$/i.test(id))
    throw new HttpError(400,'공개 네이버 블로그 주소를 입력하세요.');
  return id;
}
function plain(text:string){
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&(?:lt|gt|amp|quot|apos|nbsp|#39);/g,entity=>({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '}[entity]||entity))
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<img\b[^>]*>/gi,'\n[사진]\n')
    .replace(/<\/(?:p|div|li)>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').trim();
}
export async function publicSamples(value:string){
  const id=blogId(value);
  const response=await fetch('https://rss.blog.naver.com/'+id+'.xml',{redirect:'error',signal:AbortSignal.timeout(12000)})
    .catch(()=>{throw new HttpError(502,'공개 RSS에 접근할 수 없습니다. 글을 붙여넣거나 파일을 올려 주세요.');});
  if(!response.ok) throw new HttpError(422,'공개 RSS를 읽을 수 없습니다. 글을 붙여넣거나 파일을 올려 주세요.');
  const reader=response.body?.getReader();
  const decoder=new TextDecoder();
  let size=0;
  let xml='';
  if(reader) try {
    for(;;){
      const {value,done}=await reader.read();
      if(done) break;
      size+=value.length;
      if(size>2000000) throw new HttpError(422,'RSS 크기 제한을 초과했습니다. 글을 직접 추가해 주세요.');
      xml+=decoder.decode(value,{stream:true});
    }
    xml+=decoder.decode();
  } finally {await reader.cancel();}
  const samples=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,20).map(([,item])=>{
    const match=(tag:string)=>plain(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i').exec(item)?.[1]||'');
    const body=match('content:encoded')||match('description');
    return {title:match('title').slice(0,300),body:body.slice(0,12000)};
  }).filter(item=>item.body.length>=180);
  if(!samples.length) throw new HttpError(422,'공개 RSS에 분석할 본문이 없습니다. 글을 붙여넣거나 파일을 올려 주세요.');
  return {samples,notice:'공개 RSS에 제공된 텍스트를 가져왔습니다. 원문이 잘린 경우 직접 추가해 주세요.'};
}
