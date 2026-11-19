import { Node, type JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Check, Clipboard, Download, History, Monitor, Smartphone, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { categoryLabels, photoMarker, photoUrl, splitBody, type Photo, type PostData } from '../shared';
import { api } from './api';
import { Badge, Button, Card, CardTitle, EditorFrame, Field, Note, Placeholder, Preview, Row, Spread, Stack, Toggle } from './ui';

const PhotoMarker=Node.create({
  name:'photoMarker',group:'block',atom:true,selectable:true,
  addAttributes(){return {id:{default:''},label:{default:'사진'}};},
  renderHTML({node}){return ['div',{'data-photo-id':node.attrs.id,contenteditable:'false'},node.attrs.label];},
  parseHTML(){return [];},
});
const extensions=[StarterKit.configure({blockquote:false,heading:false,bulletList:false,orderedList:false,bold:false,italic:false,strike:false,code:false,codeBlock:false,hardBreak:false,horizontalRule:false,link:false,underline:false}),PhotoMarker];
const labelFor=(photos:Photo[],id:string)=>{
  const index=photos.findIndex(photo=>photo.id===id);
  return index<0?'연결된 사진 없음':'사진 '+String(index+1).padStart(2,'0')+' · '+categoryLabels[photos[index].category];
};
const line=(text:string):JSONContent=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
function documentFor(body:string,photos:Photo[]):JSONContent {
  const content=body.split(/\r?\n/).map(value=>{
    const id=photoMarker.exec(value.trim())?.[1];
    return id?{type:'photoMarker',attrs:{id,label:labelFor(photos,id)}}:line(value);
  });
  if(content.at(-1)?.type==='photoMarker') content.push(line(''));
  return {type:'doc',content};
}
function serialize(doc:JSONContent){
  return doc.content?.map(item=>item.type==='photoMarker'?'[[photo:'+item.attrs?.id+']]':item.content?.map(node=>node.text||'').join('')||'').join('\n')||'';
}
const escape=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));
const replaceMarkers=(body:string,photos:Photo[])=>body.split(/\r?\n/).map(value=>{
  const id=photoMarker.exec(value.trim())?.[1];
  return id?'['+labelFor(photos,id)+']':value;
}).join('\n');
const tagsFor=(post:PostData)=>post.draft.tags.map(tag=>'#'+tag).join(' ');
async function exportPost(post:PostData,format:'html'|'md'){
  const {draft,photos}=post;
  const parts=splitBody(draft.body);
  const locationFor=(id:string)=>new URL(photoUrl(id),window.location.origin).href;
  const toDataUrl=async(id:string)=> {
    const response=await fetch(photoUrl(id));
    if(!response.ok) throw new Error('내보낼 사진 파일을 읽을 수 없습니다.');
    const file=await response.blob();
    return new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result));
      reader.onerror=()=>reject(new Error('사진을 HTML에 포함할 수 없습니다.'));
      reader.readAsDataURL(file);
    });
  };
  const html=format==='html'?(await Promise.all(parts.map(async({id,text})=>{
    const paragraph=text?'<p>'+escape(text).replace(/\n/g,'<br>')+'</p>':'';
    return id&&photos.some(photo=>photo.id===id)?'<figure><img src="'+await toDataUrl(id)+'" alt="'+escape(labelFor(photos,id))+'">'+paragraph+'</figure>':paragraph;
  }))).join('\n'):'';
  const markdown=parts.map(({id,text})=>(id&&photos.some(photo=>photo.id===id)?'!['+labelFor(photos,id)+']('+locationFor(id)+')\n\n':'')+text).join('\n\n');
  const output=format==='html'
    ?'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.8 system-ui,sans-serif}article{max-width:760px;margin:2rem auto;padding:0 1rem}figure{margin:1rem 0}img{max-width:100%;height:auto}</style><title>'+escape(draft.title)+'</title><article><h1>'+escape(draft.title)+'</h1>'+html+'<p>'+escape(tagsFor(post))+'</p></article></html>'
    :'# '+draft.title+'\n\n'+markdown+'\n\n'+tagsFor(post)+'\n';
  const url=URL.createObjectURL(new Blob([output],{type:format==='html'?'text/html;charset=utf-8':'text/markdown;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='matjip-post.'+format;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

type Props={
  post:PostData;update:(patch:Partial<PostData['draft']>)=>void;busy:boolean;ai:boolean;
  run:(task:()=>Promise<void>)=>void;notify:(text:string)=>void;generate:(rewrite:boolean)=>void;
  history:()=>void;approve:()=>void;
};
type Proposal={text:string;body:string;from?:number;to?:number};
export default function Editor({post,update,busy,ai,run,notify,generate,history,approve}:Props){
  const [tab,setTab]=useState<'preview'|'edit'>('preview');
  const [mobile,setMobile]=useState(false);
  const [proposal,setProposal]=useState<Proposal|null>(null);
  const {draft,photos}=post;
  const [editingTags,setEditingTags]=useState<string|null>(null);
  const editor=useEditor({extensions,content:documentFor(draft.body,photos),editorProps:{attributes:{'aria-label':'포스팅 본문',role:'textbox','aria-multiline':'true'}},
    onUpdate:({editor})=>update({body:serialize(editor.getJSON())}),
  });
  useEffect(()=>{
    if(!editor) return;
    const next=documentFor(draft.body,photos);
    const current=editor.getJSON();
    const labels=JSON.stringify((current.content||[]).filter(item=>item.type==='photoMarker'));
    const nextLabels=JSON.stringify((next.content||[]).filter(item=>item.type==='photoMarker'));
    if(serialize(current)!==draft.body||labels!==nextLabels) editor.commands.setContent(next,{emitUpdate:false});
  },[draft.body,photos,editor]);
  useEffect(()=>{editor?.setEditable(!busy,false);},[busy,editor]);

  function copy(text:string,message:string){
    run(async()=>{await navigator.clipboard.writeText(text);notify(message);});
  }
  function revise(action:'paragraph'|'spell'|'titles'){
    if(!editor) return;
    let {from,to}=editor.state.selection;
    const {$from,$to}=editor.state.selection;
    if(action==='paragraph'){
      if($from.parent!==$to.parent||$from.parent.type.name!=='paragraph'||!$from.parent.textContent.trim()){
        notify('재작성할 문단에 커서를 놓아 주세요.');return;
      }
      from=$from.start();to=$from.end();
    }
    if(action==='spell'&&from!==to&&$from.parent!==$to.parent){notify('한 문단 안에서 범위를 선택하거나 선택을 해제해 주세요.');return;}
    const range=action==='paragraph'||(action==='spell'&&from!==to);
    const selected=range?editor.state.doc.textBetween(from,to,'\n'):draft.body;
    const body=draft.body;
    run(async()=>{
      const result=await api<{text:string;titles:string[]}>('/revise','POST',{data:post,action,selection:selected});
      if(action==='titles') {update({titles:result.titles.slice(0,post.options.titleCount)});notify('제목 후보를 생성했습니다. 적용할 제목을 선택하세요.');return;}
      if(!result.text.trim()){notify('교정할 내용을 찾지 못했습니다.');return;}
      if(action==='spell'&&!range){
        const ids=(value:string)=>value.split(/\r?\n/).flatMap(item=>photoMarker.exec(item.trim())?.[1]||[]).join(',');
        if(ids(result.text)!==ids(body)) throw new Error('사진 위치를 보존하지 못해 교정안을 적용할 수 없습니다.');
      }
      setProposal({text:range?result.text.replace(/[\r\n]+/g,' '):result.text,body,from:range?from:undefined,to:range?to:undefined});
    });
  }
  function apply(){
    if(!proposal||!editor) return;
    if(draft.body!==proposal.body){setProposal(null);notify('편집 중에 본문이 바뀌었습니다. 다시 요청해 주세요.');return;}
    if(proposal.from!==undefined&&proposal.to!==undefined){
      editor.view.dispatch(editor.state.tr.insertText(proposal.text,proposal.from,proposal.to));
    }else update({body:proposal.text});
    setProposal(null);
  }
  const hasContent=Boolean(draft.body.trim()||draft.title.trim());
  return <Card aria-label="AI 작성 결과">
    <Spread style={{marginBottom:14}}>
      <CardTitle style={{margin:0}}><span><Sparkles size={17}/></span><h2>AI 작성 결과</h2></CardTitle>
      <Toggle><button aria-pressed={tab==='preview'} onClick={()=>setTab('preview')}>미리보기</button><button aria-pressed={tab==='edit'} onClick={()=>setTab('edit')}>편집</button></Toggle>
    </Spread>
    <Spread style={{marginBottom:12}}>
      <Note>{replaceMarkers(draft.body,[]).replace(/\[연결된 사진 없음\]/g,'').trim().length.toLocaleString()}자</Note>
      {tab==='preview'&&<Toggle><button aria-pressed={!mobile} onClick={()=>setMobile(false)}><Monitor size={15}/> PC</button><button aria-pressed={mobile} onClick={()=>setMobile(true)}><Smartphone size={15}/> 모바일</button></Toggle>}
      {tab==='edit'&&<Button onClick={history}><History size={15}/> 수정 이력</Button>}
    </Spread>
    <div hidden={tab!=='preview'}>
      {hasContent?<Preview $mobile={mobile}>
        {draft.title&&<h2>{draft.title}</h2>}
        {splitBody(draft.body).map(({id,text},index)=>id&&photos.some(photo=>photo.id===id)?
          <figure key={index}><img src={photoUrl(id)} alt={labelFor(photos,id)}/><figcaption>{labelFor(photos,id)}</figcaption>{text&&<p>{text}</p>}</figure>:text&&<p key={index}>{text}</p>)}
        {draft.tags.length>0&&<Note>{tagsFor(post)}</Note>}
      </Preview>:<Placeholder><span><Sparkles size={25}/></span><h3>작성한 글이 여기에 표시됩니다</h3><Note>장소 정보와 방문 메모를 입력한 뒤<br/>AI 초안 만들기를 눌러 주세요.</Note><Button $subtle onClick={()=>setTab('edit')}>직접 작성</Button></Placeholder>}
    </div>
    <div hidden={tab!=='edit'}>
      <Stack>
        <Field>글 제목<input value={draft.title} onChange={event=>update({title:event.target.value})} disabled={busy} placeholder="포스팅 제목을 입력하세요"/></Field>
        {draft.titles.length>0&&<Row>{draft.titles.map((title,index)=><Button key={index} disabled={busy} onClick={()=>update({title})}>{title}</Button>)}</Row>}
        <Row><Button disabled={!ai||busy||!hasContent} onClick={()=>revise('titles')}>제목 재생성</Button><Button disabled={!ai||busy||!draft.body.trim()} onClick={()=>revise('paragraph')}>선택 문단 재작성</Button><Button disabled={!ai||busy||!draft.body.trim()} onClick={()=>revise('spell')}>맞춤법 확인</Button><Button disabled={!ai||busy||!hasContent} onClick={()=>generate(true)}>전체 재작성</Button></Row>
        {proposal&&<Stack><Field>AI 수정 제안<textarea value={replaceMarkers(proposal.text,photos)} readOnly rows={5}/></Field><Row><Button $primary onClick={apply}><Check size={16}/> 제안 적용</Button><Button onClick={()=>setProposal(null)}>닫기</Button></Row></Stack>}
        <EditorFrame><EditorContent editor={editor}/></EditorFrame>
        <Note>사진 설명은 사진 표식 아래에서 수정하세요. 사진 뒤에 설명을 입력하려면 사진 표식 다음 줄을 사용하세요.</Note>
        {photos.length>0&&<Row>{photos.map(photo=><Button key={photo.id} disabled={busy||draft.body.includes('[[photo:'+photo.id+']]')} onClick={()=>update({body:[draft.body.trim(),'[[photo:'+photo.id+']]'].filter(Boolean).join('\n\n')})}>{labelFor(photos,photo.id)} 삽입</Button>)}</Row>}
        <Field>해시태그<input value={editingTags??tagsFor(post)} disabled={busy}
          onChange={event=>setEditingTags(event.target.value)}
          onBlur={()=>{if(editingTags!==null) update({tags:[...new Set(editingTags.split(/[\s#]+/).filter(Boolean))].slice(0,30)});setEditingTags(null);}}
          placeholder="#방문후기 #서울나들이"/></Field>
        <Button disabled={busy||!ai||!draft.baseline||draft.body===draft.baseline} onClick={approve}>편집 내용의 스타일 반영 승인</Button>
      </Stack>
    </div>
    <Row style={{marginTop:13}}>
      <Button disabled={!draft.title} onClick={()=>copy(draft.title,'제목을 복사했습니다.')}><Clipboard size={15}/> 제목 복사</Button>
      <Button disabled={!draft.body.trim()} onClick={()=>copy(replaceMarkers(draft.body,photos),'본문과 사진 위치를 복사했습니다.')}><Clipboard size={15}/> 본문 복사</Button>
      <Button disabled={!draft.tags.length} onClick={()=>copy(tagsFor(post),'해시태그를 복사했습니다.')}>해시태그 복사</Button>
      <Button disabled={!hasContent} onClick={()=>run(async()=>{await exportPost(post,'html');notify('사진을 포함한 HTML을 다운로드했습니다.');})}><Download size={15}/> HTML</Button>
      <Button disabled={!hasContent} onClick={()=>run(async()=>{await exportPost(post,'md');notify('Markdown을 다운로드했습니다.');})}><Download size={15}/> Markdown</Button>
    </Row>
    {hasContent&&<Badge style={{marginTop:12}}>게시 전 원고 검토</Badge>}
  </Card>;
}
