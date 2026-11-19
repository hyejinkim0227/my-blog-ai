import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, ImagePlus, ListChecks, MapPin, NotebookPen, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { categoryLabels, categories, emptyPlace, photoUrl, reorderBody, visitFields, type Photo, type Place, type PostData } from '../shared';
import { api, type Config } from './api';
import { Badge, Button, Card, CardTitle, Drop, Field, Fields, ListRow, Note, Row, Spread, Stack, Toggle } from './ui';

type Props={post:PostData;change:(fn:(post:PostData)=>PostData)=>void;run:(task:()=>Promise<void>)=>void;notify:(text:string)=>void;ensure:()=>Promise<string>;busy:boolean;config:Config;generate:()=>void;pending:(value:boolean)=>void};
const manualFields={name:'지도에 표시되는 장소 이름',address:'주소',phone:'전화번호',website:'공식 홈페이지',map:'지도 링크',hours:'영업시간',closed:'정기휴무',source:'정보 출처',checked:'확인 날짜'} as const;
export function safeLink(value:string){
  try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'?url.href:undefined;}catch{return undefined;}
}
function PhotoItem({photo,index,total,busy,ai,edit,move,remove,analyze}:{photo:Photo;index:number;total:number;busy:boolean;ai:boolean;edit:(value:Partial<Photo>)=>void;move:(direction:number)=>void;remove:()=>void;analyze:()=>void}){
  const sortable=useSortable({id:photo.id,disabled:busy});
  return <ListRow ref={sortable.setNodeRef} style={{transform:CSS.Transform.toString(sortable.transform),transition:sortable.transition,position:'relative',zIndex:sortable.isDragging?1:undefined}}>
    <Spread><Row>
      <Button aria-label={photo.name+' 순서 드래그'} style={{touchAction:'none'}} ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} disabled={busy}><GripVertical size={16}/></Button>
      <img src={photoUrl(photo.id)} alt={photo.name} style={{width:53,height:48,objectFit:'cover',borderRadius:6}}/>
      <div><strong>사진 {String(index+1).padStart(2,'0')}</strong><Note>{photo.name}</Note></div>
    </Row><Row>
      <Button aria-label="사진 위로 이동" disabled={busy||index===0} onClick={()=>move(-1)}><ChevronUp size={16}/></Button>
      <Button aria-label="사진 아래로 이동" disabled={busy||index===total-1} onClick={()=>move(1)}><ChevronDown size={16}/></Button>
      <Button aria-label="사진 제거" title="사진 제거" disabled={busy} onClick={remove}><Trash2 size={16}/></Button>
    </Row></Spread>
    <Fields>
      <Field>카테고리<select disabled={busy} value={photo.category} onChange={event=>edit({category:event.target.value as Photo['category']})}>{categories.map(value=><option key={value} value={value}>{categoryLabels[value]}</option>)}</select></Field>
      <Field>사진 메모<input disabled={busy} value={photo.note} onChange={event=>edit({note:event.target.value})} placeholder="사진에 덧붙일 내용"/></Field>
    </Fields>
    <Row><Button onClick={analyze} disabled={busy||!ai}><Sparkles size={15}/> 사진 AI 분석</Button>{photo.visible&&<Badge>분석 완료</Badge>}</Row>
    {photo.visible&&<Field>AI 관찰 내용<textarea rows={2} disabled={busy} value={photo.visible} onChange={event=>edit({visible:event.target.value})}/></Field>}
    {(photo.menu.length>0||photo.category==='메뉴판')&&<details open={photo.menu.length>0||undefined}>
      <summary>메뉴판에서 추출한 전체 메뉴 ({photo.menu.length})</summary>
      <Stack style={{marginTop:8}}>
        {photo.menu.map((item,menuIndex)=>{
          const update=(patch:Partial<typeof item>)=>edit({menu:photo.menu.map((entry,entryIndex)=>entryIndex===menuIndex?{...entry,...patch}:entry)});
          return <ListRow key={menuIndex}>
            <Spread>{item.review?<Badge $warn>확인 필요</Badge>:<Note>전체 메뉴</Note>}<Button aria-label="메뉴 제거" title="메뉴 제거" onClick={()=>edit({menu:photo.menu.filter((_,entryIndex)=>entryIndex!==menuIndex)})} disabled={busy}><Trash2 size={15}/></Button></Spread>
            <Fields>{([['name','메뉴명'],['price','가격'],['description','메뉴 설명'],['set','세트 구성']] as const).map(([key,label])=><Field key={key}>{label}<input disabled={busy} value={item[key]} onChange={event=>update({[key]:event.target.value})}/></Field>)}</Fields>
            <label><input disabled={busy} type="checkbox" checked={item.review} onChange={event=>update({review:event.target.checked})}/> 확인 필요</label>
          </ListRow>;
        })}
        <Button disabled={busy||photo.menu.length>=100} onClick={()=>edit({menu:[...photo.menu,{name:'',price:'',description:'',set:'',review:true} ]})}><Plus size={15}/> 메뉴 추가</Button>
      </Stack>
    </details>}
  </ListRow>;
}

export default function Compose({post,change,run,notify,ensure,busy,config,generate,pending}:Props){
  const {visit,photos,place,options}=post;
  const input=useRef<HTMLInputElement>(null);
  const manual=useRef<HTMLDetailsElement>(null);
  const [candidates,setCandidates]=useState<Place[]>([]);
  const [drag,setDrag]=useState(false);
  const [customLength,setCustomLength]=useState(![800,1200,1500,2000].includes(options.length));
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
  function editVisit(key:keyof PostData['visit'],event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>){
    const value=event.target.value;
    change(item=>({...item,visit:{...item.visit,[key]:value}}));
    if(['name','region','branch'].includes(key)){
      setCandidates([]);pending(false);
      if(place?.id) change(item=>({...item,place:null}));
    }
  }
  const query=[visit.name,visit.branch,visit.region].map(value=>value.trim()).filter(Boolean).join(' ');
  const mapsSearchUrl=query?'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query}):'https://www.google.com/maps';
  function search(){
    if(!visit.name.trim()){notify('장소 이름을 입력하세요.');return;}
    run(async()=>{
      const found=await api<Place[]>('/places?q='+encodeURIComponent(query));
      setCandidates(found);
      pending(found.length>1);
      if(found.length) change(item=>({...item,place:found.length===1?found[0]:null}));
      else notify('검색 결과가 없습니다. 장소 정보를 직접 입력할 수 있습니다.');
    });
  }
  function choose(place:Place){
    change(item=>({...item,place}));pending(false);setCandidates([]);
  }
  function upload(files:FileList|null){
    if(!files?.length||busy) return;
    const batch=Array.from(files).slice(0,30-photos.length);
    const ignored=files.length-batch.length;
    run(async()=>{
      if(!batch.length) throw new Error('포스팅당 사진을 30장까지 올릴 수 있습니다.');
      const id=await ensure();
      const failures:string[]=[];
      for(const file of batch){
        try{
          const data=new FormData();data.append('photo',file);
          const photo=await api<Photo>('/posts/'+id+'/photos','POST',data);
          change(item=>({...item,photos:[...item.photos,photo]}));
        }catch(error){failures.push(file.name+' · '+(error as Error).message);}
      }
      await ensure();
      if(failures.length) throw new Error(failures.join(' / '));
      if(ignored) notify('최대 30장까지 저장했습니다.');
    });
  }
  function editPhoto(id:string,patch:Partial<Photo>){
    change(item=>({...item,photos:item.photos.map(photo=>photo.id===id?{...photo,...patch}:photo)}));
  }
  function arrangement(next:Photo[]){
    change(item=>({...item,photos:next,draft:{...item.draft,body:reorderBody(item.draft.body,next)}}));
  }
  function analyze(photo:Photo){
    if((photo.visible||photo.menu.length)&&!window.confirm('현재 AI 관찰 내용과 메뉴 목록을 새 분석 결과로 바꿀까요?')) return;
    run(async()=>{
      const id=await ensure();
      const result=await api<Pick<Photo,'category'|'visible'|'menu'>>('/posts/'+id+'/photos/'+photo.id+'/analyze','POST',{category:photo.category==='기타'?undefined:photo.category});
      editPhoto(photo.id,{...result,category:photo.category==='기타'?result.category:photo.category});await ensure();
    });
  }
  function setOption<K extends keyof PostData['options']>(key:K,value:PostData['options'][K]){
    change(item=>({...item,options:{...item.options,[key]:value}}));
  }
  return <Stack>
    <Card>
      <Spread><CardTitle style={{margin:0}}><span><MapPin size={18}/></span><h2>장소 정보</h2></CardTitle>
        <Toggle><button disabled={busy} aria-pressed={post.mode==='simple'} onClick={()=>change(item=>({...item,mode:'simple'}))}>간편 작성</button><button disabled={busy} aria-pressed={post.mode==='detail'} onClick={()=>change(item=>({...item,mode:'detail'}))}>상세 작성</button></Toggle>
      </Spread>
      <Fields>
        <Field>장소 이름 <input disabled={busy} value={visit.name} onChange={event=>editVisit('name',event)} placeholder="예: 서울숲, 국립중앙박물관"/></Field>
        <Field>방문 지역 <input disabled={busy} value={visit.region} onChange={event=>editVisit('region',event)} placeholder="예: 서울 성수"/></Field>
        {post.mode==='detail'&&<Field>정확한 지점명<input disabled={busy} value={visit.branch} onChange={event=>editVisit('branch',event)}/></Field>}
      </Fields>
      <Row>
        <Button as="a" href={mapsSearchUrl} target="_blank" rel="noopener noreferrer"><MapPin size={16}/> 구글 지도에서 검색</Button>
        {config.places&&<Button disabled={busy} onClick={search}><Search size={16}/> 앱에서 장소 검색</Button>}
        <Button disabled={busy} onClick={()=>{pending(false);setCandidates([]);if(manual.current) manual.current.open=true;}}>직접 입력</Button>
      </Row>
      <Note style={{marginTop:8}}>구글 지도에서 확인한 주소나 지도 링크는 직접 입력할 수 있습니다.</Note>
      {candidates.length>0&&<Stack style={{marginTop:12}}>
        <Note>방문한 지점을 선택해 주세요.</Note>
        {candidates.map(item=><ListRow key={item.id}><strong>{item.name}</strong><Note>{item.address}</Note><Row><Button disabled={busy} onClick={()=>choose(item)}>이 지점 선택</Button>{safeLink(item.map)&&<a href={safeLink(item.map)} target="_blank" rel="noreferrer">지도</a>}</Row></ListRow>)}
      </Stack>}
      {place&&<ListRow style={{marginTop:12}}>
        <Spread><strong>{place.name||'직접 입력한 장소 정보'}</strong><Button $subtle disabled={busy} onClick={()=>change(item=>({...item,place:null}))}>연결 해제</Button></Spread>
        <Note>{[place.address,place.phone].filter(Boolean).join(' · ')}</Note>
        {place.latitude!=null&&place.longitude!=null&&<Note>지도 좌표 {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</Note>}
        {place.hours&&<Note style={{whiteSpace:'pre-line'}}>{place.hours}</Note>}
        {place.closed&&<Note>정기휴무 {place.closed}</Note>}
        {(place.hours||place.closed)&&<Note>출처 {place.source||'미입력'} · 확인일 {place.checked||'미입력'}</Note>}
        <Row>{safeLink(place.map)&&<a href={safeLink(place.map)} target="_blank" rel="noreferrer">지도</a>}{safeLink(place.website)&&<a href={safeLink(place.website)} target="_blank" rel="noreferrer">공식 홈페이지</a>}</Row>
      </ListRow>}
      <details ref={manual} style={{marginTop:12}}><summary>장소 정보 세부 입력</summary>
        <Fields>{Object.entries(manualFields).map(([field,label])=>{
          const key=field as keyof typeof manualFields;
          const update=(value:string)=>change(item=>({...item,place:{...emptyPlace,...item.place,...((key==='hours'||key==='closed')&&item.place?.id?{id:'',source:'',checked:''}:{}),[key]:value}}));
          return <Field key={key}>{label}{key==='hours'?<textarea rows={2} disabled={busy} value={place?.[key]||''} onChange={event=>update(event.target.value)}/>:<input type={key==='checked'?'date':'text'} disabled={busy} value={place?.[key]||''} onChange={event=>update(event.target.value)}/>}</Field>;
        })}</Fields>
      </details>
    </Card>
    <Card>
      <Spread><CardTitle><span><ImagePlus size={17}/></span><h2>사진 업로드</h2></CardTitle><Note>{photos.length} / 30장</Note></Spread>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden onChange={event=>{upload(event.target.files);event.target.value='';}}/>
      <Drop $over={drag} disabled={busy||photos.length>=30} onClick={()=>input.current?.click()} onDragOver={event=>{event.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={event=>{event.preventDefault();setDrag(false);upload(event.dataTransfer.files);}}>
        <ImagePlus size={24}/>사진을 끌어 놓거나 클릭하여 업로드<small>JPG, PNG, WEBP · 사진당 최대 12MB</small>
      </Drop>
      {photos.length>0&&<div style={{marginTop:12}}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({active,over})=>{
          if(over&&active.id!==over.id) arrangement(arrayMove(photos,photos.findIndex(photo=>photo.id===active.id),photos.findIndex(photo=>photo.id===over.id)));
        }}>
          <SortableContext items={photos.map(photo=>photo.id)} strategy={verticalListSortingStrategy}>
            <Stack>{photos.map((photo,index)=><PhotoItem key={photo.id} photo={photo} index={index} total={photos.length} busy={busy} ai={config.ai}
              edit={patch=>editPhoto(photo.id,patch)} move={direction=>arrangement(arrayMove(photos,index,index+direction))}
              remove={()=>{if(window.confirm('이 사진을 현재 포스팅에서 제거할까요?'))arrangement(photos.filter(item=>item.id!==photo.id));}} analyze={()=>analyze(photo)}/>)}</Stack>
          </SortableContext>
        </DndContext>
      </div>}
    </Card>
    <Card>
      <CardTitle><span><NotebookPen size={17}/></span><h2>방문 후기</h2></CardTitle>
      {post.mode==='detail'&&<Fields>{(Object.keys(visitFields) as (keyof typeof visitFields)[]).filter(key=>!['name','region','branch','memo'].includes(key)).map(key=><Field key={key}>{visitFields[key]}<input type={key==='date'?'date':'text'} disabled={busy} value={visit[key]} onChange={event=>editVisit(key,event)}/></Field>)}</Fields>}
      <Field>방문 메모<textarea rows={4} disabled={busy} value={visit.memo} onChange={event=>editVisit('memo',event)} placeholder="무엇을 했는지, 어떤 점이 인상 깊었는지 적어 주세요."/></Field>
    </Card>
    <Card>
      <CardTitle><span><ListChecks size={17}/></span><h2>글쓰기 설정</h2></CardTitle>
      <Fields>
        <Field>글자 수<select disabled={busy} value={customLength?'custom':options.length} onChange={event=>{setCustomLength(event.target.value==='custom');if(event.target.value!=='custom')setOption('length',Number(event.target.value));}}>{[800,1200,1500,2000].map(value=><option key={value} value={value}>{value.toLocaleString()}자</option>)}<option value="custom">직접 입력</option></select></Field>
        {customLength&&<Field>목표 글자 수<input disabled={busy} type="number" min={200} max={8000} defaultValue={options.length} onBlur={event=>{const value=Math.max(200,Math.min(8000,Math.round(Number(event.target.value)||1500)));event.target.value=String(value);setOption('length',value);}}/></Field>}
        <Field>문체<select disabled={busy} value={options.tone} onChange={event=>setOption('tone',event.target.value as typeof options.tone)}>{['내 블로그 스타일','담백한 후기','상세한 후기'].map(item=><option key={item}>{item}</option>)}</select></Field>
        <Field>이모티콘<select disabled={busy} value={options.emoji} onChange={event=>setOption('emoji',event.target.value as typeof options.emoji)}>{['스타일 따르기','사용 안 함','적게','보통','많이'].map(item=><option key={item}>{item}</option>)}</select></Field>
        <Field>문단 길이<select disabled={busy} value={options.paragraph} onChange={event=>setOption('paragraph',event.target.value as typeof options.paragraph)}>{['스타일 따르기','짧게','보통','길게'].map(item=><option key={item}>{item}</option>)}</select></Field>
        <Field>제목 후보 개수<input disabled={busy} type="number" min={1} max={10} defaultValue={options.titleCount} onBlur={event=>{const value=Math.max(1,Math.min(10,Math.round(Number(event.target.value)||1)));event.target.value=String(value);setOption('titleCount',value);}}/></Field>
        <Field>해시태그 개수<input disabled={busy} type="number" min={0} max={30} defaultValue={options.tagCount} onBlur={event=>{const value=Math.max(0,Math.min(30,Math.round(Number(event.target.value)||0)));event.target.value=String(value);setOption('tagCount',value);}}/></Field>
      </Fields>
      <Field>검색 키워드<input disabled={busy} value={options.keywords} onChange={event=>setOption('keywords',event.target.value)} placeholder="예: 서울 나들이, 전시 관람"/></Field>
      <Row style={{margin:'12px 0'}}><label><input disabled={busy} type="checkbox" checked={options.includeMenu} onChange={event=>setOption('includeMenu',event.target.checked)}/> 메뉴판의 전체 메뉴도 소개</label></Row>
      <Button $primary disabled={!config.ai||busy} onClick={generate}><Sparkles size={17}/> AI 초안 만들기</Button>
      {!config.ai&&<Note style={{marginTop:8}}>OpenAI API 키를 설정하면 AI 글쓰기를 사용할 수 있습니다.</Note>}
    </Card>
  </Stack>;
}
