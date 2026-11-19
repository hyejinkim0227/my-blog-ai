import { BookOpen, Check, ChevronRight, CircleHelp, Cloud, FilePlus, FolderOpen, House, LayoutDashboard, LoaderCircle, Settings, Sparkles, WandSparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { categoryLabels, emptyStyle, newPost, photoUrl, type Draft, type Photo, type PostData, type Saved, type Style } from '../shared';
import { api, type Config, type ListItem } from './api';
import Compose from './Compose';
import Editor from './Editor';
import StylePage from './StylePage';
import { Badge, Brand, Button, Card, CardTitle, Columns, Field, Header, ListRow, Main, Nav, NavButton, Note, Notice, PageHead, Placeholder, Row, Shell, Sidebar, SidebarFoot, Spread, Stack } from './ui';

const nav=[
  {id:'home',label:'대시보드',icon:LayoutDashboard},
  {id:'compose',label:'새 포스팅 작성',icon:FilePlus},
  {id:'saved',label:'저장된 포스팅',icon:FolderOpen},
  {id:'style',label:'내 블로그 스타일 분석',icon:WandSparkles},
  {id:'settings',label:'설정',icon:Settings},
] as const;
type View=typeof nav[number]['id'];
type Version={id:string;revision:number;createdAt:string};
type SaveState='idle'|'dirty'|'saving'|'saved'|'error';

export default function App(){
  const [view,setView]=useState<View>('compose');
  const [post,setPost]=useState<PostData>(newPost);
  const [projectKey,setProjectKey]=useState(0);
  const [status,setStatus]=useState<SaveState>('idle');
  const [config,setConfig]=useState<Config>({ai:false,places:false,model:''});
  const [style,setStyle]=useState<Style>(emptyStyle);
  const [items,setItems]=useState<ListItem[]>([]);
  const [message,setMessage]=useState<{text:string;error:boolean}|null>(null);
  const [busy,setBusy]=useState(false);
  const [versions,setVersions]=useState<Version[]|null>(null);
  const [candidate,setCandidate]=useState(false);
  const [proposal,setProposal]=useState<{draft:Draft;original:PostData}|null>(null);
  const [filter,setFilter]=useState('');
  const live=useRef(post);
  const saved=useRef<Saved|null>(null);
  const dirty=useRef(false);
  const queue=useRef<Promise<unknown>>(Promise.resolve());
  const locked=useRef(false);
  const knownStyle=useRef(emptyStyle);

  function notify(text:string){setMessage({text,error:false});}
  function fault(error:unknown){setMessage({text:error instanceof Error?error.message:'요청에 실패했습니다.',error:true});}
  function run(task:()=>Promise<void>){
    if(locked.current)return;
    locked.current=true;setBusy(true);setMessage(null);
    void task().catch(fault).finally(()=>{locked.current=false;setBusy(false);});
  }
  function installStyle(next:Style){knownStyle.current=next;setStyle(next);}
  function change(fn:(data:PostData)=>PostData) {
    const next=fn(live.current);
    if(JSON.stringify(next)===JSON.stringify(live.current)) return;
    live.current=next;dirty.current=true;setPost(next);setStatus('dirty');
  }
  function openLocal(record:Saved|null){
    saved.current=record;live.current=record?.data||newPost(knownStyle.current.defaults);dirty.current=false;
    setPost(live.current);setStatus(record?'saved':'idle');setVersions(null);setProposal(null);setCandidate(false);
    setProjectKey(key=>key+1);
  }
  function persist(force=false):Promise<string>{
    const operation=queue.current.catch(()=>{}).then(async()=>{
      let record=saved.current;
      if(!record&&!dirty.current&&!force)return '';
      setStatus('saving');
      try{
        if(!record){record=await api<Saved>('/posts','POST');saved.current=record;}
        if(dirty.current){
          const snapshot=live.current;
          record=await api<Saved>('/posts/'+record.id,'PUT',{revision:record.revision,data:snapshot});
          saved.current=record;
          dirty.current=live.current!==snapshot;
        }
        setStatus(dirty.current?'dirty':'saved');
        return record.id;
      }catch(error){setStatus('error');throw error;}
    });
    queue.current=operation;
    return operation;
  }
  useEffect(()=>{
    api<Config>('/config').then(setConfig).catch(fault);
    api<Style>('/style').then(next=>{
      installStyle(next);
      if(!dirty.current&&!saved.current) openLocal(null);
    }).catch(fault);
  },[]);
  useEffect(()=>{
    if(!dirty.current)return;
    const handle=setTimeout(()=>{void persist().catch(fault);},900);
    return ()=>clearTimeout(handle);
  },[post]);
  useEffect(()=>{
    const listener=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',listener);
    return ()=>window.removeEventListener('beforeunload',listener);
  },[]);
  function navigate(next:View){
    if(next===view&&next!=='compose') return;
    if(view==='style'&&JSON.stringify(style)!==JSON.stringify(knownStyle.current)&&!window.confirm('저장하지 않은 스타일 변경사항이 있습니다. 화면을 이동할까요?')) return;
    run(async()=>{
      await persist();
      if(next==='home'||next==='saved')setItems(await api<ListItem[]>('/posts'));
      if(next==='style')installStyle(await api<Style>('/style'));
      if(next==='settings')setConfig(await api<Config>('/config'));
      if(next==='compose')openLocal(null);
      setView(next);
    });
  }
  function load(id:string){
    run(async()=>{await persist();openLocal(await api<Saved>('/posts/'+id));setView('compose');});
  }
  function generate(rewrite:boolean){
    if(candidate){fault(new Error('검색 결과에서 방문한 지점을 선택하거나 직접 입력을 선택하세요.'));return;}
    if(!live.current.visit.name.trim()&&!live.current.place?.name.trim()){fault(new Error('장소 이름을 먼저 입력하세요.'));return;}
    const original=live.current;
    const existing=Boolean(original.draft.title||original.draft.body);
    run(async()=>{
      const id=await persist(true);
      for(const photo of original.photos.filter(item=>!item.visible.trim())){
        const analysis=await api<Pick<Photo,'category'|'visible'|'menu'>>('/posts/'+id+'/photos/'+photo.id+'/analyze','POST',{category:photo.category==='기타'?undefined:photo.category});
        change(item=>({...item,photos:item.photos.map(current=>current.id===photo.id?{
          ...current,...analysis,category:photo.category==='기타'?analysis.category:photo.category,
          menu:current.menu.length?current.menu:analysis.menu,
        }:current)}));
      }
      const input=live.current;
      await persist();
      const draft=await api<Draft>('/generate','POST',{data:input,rewrite:rewrite||existing});
      if(existing||live.current!==input){setProposal({draft,original:input});notify('새 원고 제안을 기존 원고와 비교한 뒤 적용할 수 있습니다.');}
      else{change(item=>({...item,draft}));await persist();notify('초안을 만들고 저장했습니다.');}
    });
  }
  function applyGenerated(){
    if(!proposal) return;
    if(JSON.stringify(live.current)!==JSON.stringify(proposal.original)){fault(new Error('포스팅 내용이 바뀌었습니다. 현재 입력으로 다시 생성해 주세요.'));setProposal(null);return;}
    if(!window.confirm('현재 원고를 제안 원고로 바꿀까요? 이전 원고는 수정 이력에 남습니다.'))return;
    run(async()=>{change(item=>({...item,draft:proposal.draft}));await persist();setProposal(null);notify('제안 원고를 적용했습니다.');});
  }
  function history(){
    if(versions){setVersions(null);return;}
    run(async()=>{const id=await persist();setVersions(id?await api<Version[]>('/posts/'+id+'/versions'):[]);});
  }
  function restore(version:Version){
    if(!window.confirm('이 버전을 현재 작업에 복원할까요? 현재 원고도 수정 이력에 남습니다.'))return;
    run(async()=>{
      const id=await persist(true);
      const record=await api<{data:PostData}>('/posts/'+id+'/versions/'+version.id);
      change(()=>record.data);await persist();setVersions(null);setProposal(null);setCandidate(false);
      setProjectKey(key=>key+1);notify('이전 버전을 복원했습니다.');
    });
  }
  function approve(){
    if(!window.confirm('저장된 AI 초안과 편집본을 분석해 개인 블로그 스타일 규칙에 반영할까요?'))return;
    run(async()=>{
      const id=await persist(true);
      installStyle(await api<Style>('/style/approve','POST',{id}));
      notify('승인한 편집 기록을 스타일 프로필에 반영했습니다.');
    });
  }
  const title=nav.find(item=>item.id===view)!.label;
  const showItems=view==='home'||view==='saved';
  const filtered=view==='saved'?items.filter(item=>[item.title,item.name].join(' ').toLowerCase().includes(filter.toLowerCase())):items;
  return <Shell>
    <Sidebar>
      <Brand><span><BookOpen size={19}/></span><div>블로그 스튜디오<small>AI 블로그 작성 도구</small></div></Brand>
      <Nav aria-label="주 메뉴"><label>작업 공간</label>{nav.map(({id,label,icon:Icon})=><NavButton key={id} $active={view===id} aria-current={view===id?'page':undefined} disabled={busy} onClick={()=>navigate(id)}><Icon size={17}/>{label}</NavButton>)}</Nav>
      <SidebarFoot><CircleHelp size={15}/> API 연결은 설정에서 확인</SidebarFoot>
    </Sidebar>
    <div style={{minWidth:0}}>
      <Header>
        <div><House size={16}/><ChevronRight size={14}/><strong>{view==='compose'&&post.visit.name?post.visit.name:title}</strong></div>
        <div>{view==='compose'&&<>
          <Badge $warn={status==='error'} aria-live="polite">{status==='saved'?<Check size={14}/>:<Cloud size={14}/>}
            {({idle:'새 작업',dirty:'저장 대기',saving:'저장 중',saved:'저장 완료',error:'저장 오류'})[status]}
          </Badge>
          <Button disabled={busy} onClick={()=>run(async()=>{await persist(true);notify('포스팅을 임시 저장했습니다.');})}>임시 저장</Button>
        </>}{busy&&<Badge role="status"><LoaderCircle size={14}/> 처리 중</Badge>}</div>
      </Header>
      <Main>
        <PageHead>
          <div><h1>{title}</h1><p>{({
            compose:'장소 정보와 사진을 담아 나만의 방문 후기를 작성하세요.',
            home:'작성 중인 글과 저장된 포스팅을 확인하세요.',
            saved:'저장한 포스팅을 열어 이어서 작업하세요.',
            style:'공개 글이나 직접 추가한 글을 바탕으로 개인 문체를 정리하세요.',
            settings:'서버의 외부 API 연결 상태를 확인하세요.',
          })[view]}</p></div>
          {showItems&&<Button $primary disabled={busy} onClick={()=>navigate('compose')}><FilePlus size={17}/> 새 포스팅</Button>}
          {view==='compose'&&<Badge $warn={!config.ai}><Sparkles size={14}/>{config.ai?'OpenAI 키 설정됨':'OpenAI 키 미설정'}</Badge>}
        </PageHead>
        {message&&<Notice $error={message.error} role={message.error?'alert':'status'}>{message.text}</Notice>}
        {view==='compose'&&<Columns>
          <Compose key={'form-'+projectKey} post={post} change={change} run={run} notify={notify} ensure={()=>persist(true)} busy={busy} config={config} generate={()=>generate(false)} pending={setCandidate}/>
          <Stack>
            {proposal&&<Card><Stack><h2>새 원고 제안</h2><Field>제안 제목<input readOnly value={proposal.draft.title}/></Field><Field>제안 본문<textarea readOnly rows={8} value={proposal.draft.body.replace(/\[\[photo:([a-f0-9-]+)\]\]/gi,(_,id)=>{const index=post.photos.findIndex(photo=>photo.id===id);return index<0?'[사진]':'[사진 '+(index+1)+' · '+categoryLabels[post.photos[index].category]+']';})}/></Field><Row><Button $primary disabled={busy} onClick={applyGenerated}>이 원고 적용</Button><Button disabled={busy} onClick={()=>setProposal(null)}>제안 닫기</Button></Row></Stack></Card>}
            <Editor key={'editor-'+projectKey} post={post} update={patch=>change(item=>({...item,draft:{...item.draft,...patch}}))} busy={busy} ai={config.ai} run={run} notify={notify} generate={generate} history={history} approve={approve}/>
            {versions&&<Card><Stack><Spread><h2>수정 이력</h2><Button onClick={()=>setVersions(null)}>닫기</Button></Spread>
              {!versions.length&&<Note>저장된 버전이 없습니다.</Note>}
              {versions.map(version=><ListRow key={version.id}><Spread><div><strong>버전 {version.revision+1}</strong><Note>{new Date(version.createdAt).toLocaleString('ko-KR')}</Note></div><Button disabled={busy} onClick={()=>restore(version)}>복원</Button></Spread></ListRow>)}
            </Stack></Card>}
          </Stack>
        </Columns>}
        {showItems&&<Stack>
          {view==='home'&&<Columns><Card><CardTitle><span><FolderOpen size={16}/></span><h2>저장된 포스팅</h2></CardTitle><strong>{items.length}개</strong></Card><Card><CardTitle><span><BookOpen size={16}/></span><h2>본문을 작성한 포스팅</h2></CardTitle><strong>{items.filter(item=>item.complete).length}개</strong></Card></Columns>}
          <Card><Stack><h2>{view==='home'?'최근 포스팅':'포스팅 목록'}</h2>
            {view==='saved'&&<Field>제목 또는 장소 이름 검색<input value={filter} onChange={event=>setFilter(event.target.value)}/></Field>}
            {!filtered.length?<Placeholder style={{minHeight:210}}><span><FolderOpen size={24}/></span><h3>{filter?'검색 결과가 없습니다':'저장한 포스팅이 없습니다'}</h3>{!filter&&<Button $subtle disabled={busy} onClick={()=>navigate('compose')}>포스팅 작성하기</Button>}</Placeholder>:
              (view==='home'?filtered.slice(0,6):filtered).map(item=><ListRow key={item.id}><Spread><Row>
                {item.photos[0]&&<img src={photoUrl(item.photos[0])} alt="" style={{width:54,height:48,objectFit:'cover',borderRadius:6}}/>}
                <div><strong>{item.title||item.name||'제목 없는 포스팅'}</strong><Note>{new Date(item.updatedAt).toLocaleString('ko-KR')} · 사진 {item.photos.length}장</Note></div>
              </Row><Button disabled={busy} onClick={()=>load(item.id)}>열기</Button></Spread></ListRow>)}
          </Stack></Card>
        </Stack>}
        {view==='style'&&<StylePage style={style} setStyle={setStyle} onSaved={installStyle} busy={busy} ai={config.ai} run={run} notify={notify}/>}
        {view==='settings'&&<Stack>
          <Card><Stack><Spread><CardTitle style={{margin:0}}><span><Sparkles size={17}/></span><h2>OpenAI</h2></CardTitle><Badge $warn={!config.ai}>{config.ai?'키 설정됨':'키 미설정'}</Badge></Spread><Note>프로젝트의 .env에 OPENAI_API_KEY와 필요한 경우 OPENAI_MODEL을 설정하고 서버를 재시작하세요.</Note><Note>모델 {config.model||'gpt-4.1-mini'} · 사진 분석, 스타일 분석, 초안 생성, 교정에 사용</Note></Stack></Card>
          <Card><Stack><Spread><CardTitle style={{margin:0}}><span><Settings size={17}/></span><h2>Google Places API</h2></CardTitle><Badge $warn={!config.places}>{config.places?'키 설정됨':'키 미설정'}</Badge></Spread><Note>Google Cloud에서 Places API (New)를 활성화하고 .env의 GOOGLE_PLACES_API_KEY를 설정하세요. 키 없이도 장소 정보를 직접 입력할 수 있습니다.</Note></Stack></Card>
          <Row><Button disabled={busy} onClick={()=>run(async()=>{setConfig(await api<Config>('/config'));notify('서버 환경변수 설정 상태를 새로 확인했습니다.');})}>설정 상태 새로고침</Button></Row>
        </Stack>}
      </Main>
    </div>
  </Shell>;
}
