import { FileText, Link, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import type { Style } from '../shared';
import { api } from './api';
import { Badge, Button, Card, CardTitle, Field, Fields, ListRow, Note, Row, Spread, Stack } from './ui';

export default function StylePage({style,setStyle,onSaved,busy,ai,run,notify}:{style:Style;setStyle:(style:Style)=>void;onSaved:(style:Style)=>void;busy:boolean;ai:boolean;run:(task:()=>Promise<void>)=>void;notify:(text:string)=>void}){
  const file=useRef<HTMLInputElement>(null);
  const filled=style.samples.filter(item=>item.body.trim()).length;
  const update=(patch:Partial<Style>)=>setStyle({...style,...patch});
  const add=(samples:Style['samples'])=>update({samples:[...style.samples,...samples].slice(0,40)});
  const save=async(next:Style)=>{const saved=await api<Style>('/style','PUT',next);onSaved(saved);};
  return <Stack>
    <Card>
      <CardTitle><span><Link size={16}/></span><h2>네이버 블로그 연결</h2></CardTitle>
      <Field>내 블로그 URL<input type="url" disabled={busy} value={style.url} onChange={event=>update({url:event.target.value})} placeholder="https://blog.naver.com/블로그아이디"/></Field>
      <Row style={{marginTop:10}}>
        <Button disabled={busy||!style.url.trim()||style.samples.length>=40} onClick={()=>run(async()=>{
          const {samples,notice}=await api<{samples:Style['samples'];notice:string}>('/style/import','POST',{url:style.url});
          const keys=new Set(style.samples.map(item=>item.title+'\n'+item.body));
          add(samples.filter(item=>!keys.has(item.title+'\n'+item.body)));notify(notice);
        })}><Link size={15}/> 공개 글 가져오기</Button>
      </Row>
      <Note style={{marginTop:8}}>공개 RSS에 포함된 텍스트를 읽습니다. 본문이 비공개이거나 일부만 제공되면 직접 추가할 수 있습니다.</Note>
    </Card>
    <Card>
      <Spread><CardTitle><span><FileText size={16}/></span><h2>문체 분석 예시</h2></CardTitle><Badge $warn={filled<10}>{filled}개 · 10개 이상 권장</Badge></Spread>
      <Row style={{marginBottom:12}}>
        <Button disabled={busy||style.samples.length>=40} onClick={()=>add([{title:'',body:''}])}><Plus size={16}/> 글 붙여넣기</Button>
        <Button disabled={busy||style.samples.length>=40} onClick={()=>file.current?.click()}>텍스트 파일 올리기</Button>
        <input ref={file} type="file" accept=".txt,.md,text/plain,text/markdown" multiple hidden onChange={event=>{
          const files=Array.from(event.target.files||[]).slice(0,40-style.samples.length);
          event.target.value='';
          if(files.length) run(async()=>{
            if(files.some(item=>item.size>130000)) throw new Error('텍스트 파일은 각 130KB 이하로 올려 주세요.');
            add(await Promise.all(files.map(async item=>({title:item.name.replace(/\.(txt|md)$/i,''),body:(await item.text()).slice(0,30000)}))));
          });
        }}/>
      </Row>
      {style.samples.length===0&&<Note>문단과 사진 배치를 분석하려면 원문의 줄바꿈을 유지하고 사진이 들어간 자리에 [사진]을 적어 주세요.</Note>}
      <Stack>
        {style.samples.map((sample,index)=>{
          const edit=(patch:Partial<typeof sample>)=>update({samples:style.samples.map((item,i)=>i===index?{...item,...patch}:item)});
          return <ListRow key={index}>
            <Spread><h3>글 {index+1}</h3><Button aria-label={`글 ${index+1} 삭제`} title="예시 글 삭제" disabled={busy} onClick={()=>update({samples:style.samples.filter((_,i)=>i!==index)})}><Trash2 size={15}/></Button></Spread>
            <Field>제목<input disabled={busy} value={sample.title} onChange={event=>edit({title:event.target.value})}/></Field>
            <Field>본문<textarea disabled={busy} rows={4} maxLength={30000} value={sample.body} onChange={event=>edit({body:event.target.value})}/></Field>
          </ListRow>;
        })}
      </Stack>
    </Card>
    <Card>
      <CardTitle><span><Sparkles size={17}/></span><h2>개인 블로그 스타일 프로필</h2></CardTitle>
      <Fields>
        <Field>기본 목표 글자 수<input key={style.defaults.length} type="number" min={200} max={8000} defaultValue={style.defaults.length} disabled={busy} onBlur={event=>update({defaults:{...style.defaults,length:Math.max(200,Math.min(8000,Math.round(Number(event.target.value)||1500)))}})}/></Field>
        <Field>기본 이모티콘<select value={style.defaults.emoji} disabled={busy} onChange={event=>update({defaults:{...style.defaults,emoji:event.target.value as Style['defaults']['emoji']}})}>{['스타일 따르기','사용 안 함','적게','보통','많이'].map(item=><option key={item}>{item}</option>)}</select></Field>
        <Field>기본 문단 길이<select value={style.defaults.paragraph} disabled={busy} onChange={event=>update({defaults:{...style.defaults,paragraph:event.target.value as Style['defaults']['paragraph']}})}>{['스타일 따르기','짧게','보통','길게'].map(item=><option key={item}>{item}</option>)}</select></Field>
      </Fields>
      <Field>글쓰기 규칙 (선택)<textarea disabled={busy} rows={9} value={style.profile} onChange={event=>update({profile:event.target.value})} placeholder="예: 도입을 짧게 쓰고, 사진 뒤에 당시 느낀 점을 한두 문장씩 적는다."/></Field>
      <Row style={{marginTop:12}}>
        <Button $primary disabled={busy} onClick={()=>run(async()=>{await save(style);notify('스타일 프로필과 예시 글을 저장했습니다.');})}><Save size={16}/> 저장</Button>
        <Button disabled={busy||!ai||(!filled&&!style.approvals.length)} onClick={()=>run(async()=>{
          const {profile}=await api<{profile:string}>('/style/analyze','POST',style);
          update({profile});notify('분석 결과를 검토하고 저장하면 다음 초안에 반영됩니다.');
        })}><Sparkles size={16}/> AI 스타일 분석</Button>
      </Row>
      {!ai&&<Note style={{marginTop:8}}>AI 스타일 분석은 OpenAI API 키를 설정한 뒤 사용할 수 있습니다.</Note>}
      {!filled&&!style.approvals.length&&<Note style={{marginTop:8}}>분석하려면 공개 글을 가져오거나, 예시 글의 본문을 한 편 이상 입력해 주세요.</Note>}
      {style.approvals.length>0&&<details style={{marginTop:12}}><summary>승인한 편집 기록 ({style.approvals.length})</summary>
        <Stack style={{marginTop:8}}>{[...style.approvals].reverse().map((item,index)=><ListRow key={index}><Note>{new Date(item.date).toLocaleString('ko-KR')}</Note><Field>AI 초안<textarea readOnly rows={3} value={item.before}/></Field><Field>승인한 편집본<textarea readOnly rows={3} value={item.after}/></Field></ListRow>)}</Stack>
      </details>}
    </Card>
  </Stack>;
}
