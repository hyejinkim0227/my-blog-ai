import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { newPost, reorderBody, splitBody, type Photo, type Saved, type Style } from '../shared';
import { blogId } from '../server/sources';

const left=randomUUID();
const right=randomUUID();
const makePhoto=(id:string):Photo=>({id,name:'사진',category:'기타',visible:'',note:'',menu:[]});
test('사진을 바꿔도 설명은 이미지 ID에, 도입과 총평은 본문에 남는다',()=>{
  const body=['도입',`[[photo:${left}]]\n외관 설명`,`[[photo:${right}]]\n음식 설명`,'총평'].join('\n\n');
  const result=splitBody(reorderBody(body,[makePhoto(right),makePhoto(left)]));
  assert.deepEqual(result,[{text:'도입'},{id:right,text:'음식 설명'},{id:left,text:'외관 설명'},{text:'총평'}]);
});
test('방문 경험과 매장 자료를 별도로 유지하고 문체 기본값을 적용한다',()=>{
  const data=newPost({length:800,emoji:'적게',paragraph:'짧게',titleCount:2,tagCount:0});
  assert.equal(data.visit.memo,'');
  assert.equal(data.place,null);
  assert.equal(data.options.length,800);
});
test('네이버 블로그 공식 호스트의 블로그 ID만 인식한다',()=>{
  assert.equal(blogId('https://blog.naver.com/sample_user/123'),'sample_user');
  assert.equal(blogId('https://rss.blog.naver.com/sample_user.xml'),'sample_user');
  assert.throws(()=>blogId('https://blog.naver.com.evil.invalid/sample_user'),/공개 네이버/);
});

let path:string;
let child:ChildProcess|undefined;
let origin:string;
before(async()=>{
  path=await mkdtemp(join(tmpdir(),'matjip-test-'));
  const port=await new Promise<number>((resolve,reject)=>{
    const listener=createServer().once('error',reject).listen(0,'127.0.0.1',()=>{
      const address=listener.address();
      if(typeof address!=='object'||!address){listener.close();reject(new Error('테스트 포트를 열 수 없습니다.'));return;}
      listener.close(()=>resolve(address.port));
    });
  });
  origin='http://127.0.0.1:'+port;
  const env={...process.env,DATABASE_URL:'file:'+join(path,'test.db'),UPLOAD_DIR:join(path,'uploads'),PORT:String(port),OPENAI_API_KEY:'',GOOGLE_PLACES_API_KEY:''};
  execFileSync('node',['node_modules/prisma/build/index.js','db','push'],{env});
  child=spawn('node',['--import','tsx','server/index.ts'],{env,stdio:'ignore'});
  for(let attempt=0;attempt<40;attempt++){
    if(child.exitCode!==null) throw new Error('테스트 서버가 시작 중 종료되었습니다.');
    try{if((await fetch(origin+'/api/config')).ok)return;}catch{}
    await delay(200);
  }
  throw new Error('테스트 서버가 시작되지 않았습니다.');
});
after(async()=>{
  if(child&&child.exitCode===null){
    const exited=new Promise(resolve=>child!.once('exit',resolve));
    child.kill();
    await exited;
  }
  if(path) await rm(path,{recursive:true,force:true});
});

function request(path:string,method='GET',body?:unknown){
  return fetch(origin+'/api'+path,{method,headers:method==='GET'?undefined:{'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body??{})});
}

test('포스팅을 생성하고 사진과 후기, 편집 본문을 저장하며 이전 버전을 읽는다',async()=>{
  const response=await request('/posts','POST');
  assert.equal(response.status,201);
  const post:Saved=await response.json();
  const file=new FormData();
  const png=new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64')],{type:'image/png'});
  file.append('photo',png,'음식.png');
  const upload=await fetch(origin+'/api/posts/'+post.id+'/photos',{method:'POST',body:file});
  assert.equal(upload.status,201,await upload.clone().text());
  const photo:Photo=await upload.json();
  assert.equal(photo.name,'음식.png');
  const image=await fetch(origin+'/uploads/'+photo.id);
  assert.equal(image.headers.get('content-type'),'image/png');
  const data={...post.data,photos:[{...photo,category:'주문 음식',note:'따뜻하게 제공됨'}],visit:{...post.data.visit,name:'직접 입력 식당',memo:'국물이 깔끔했다'},draft:{...post.data.draft,title:'후기',body:`[[photo:${photo.id}]]\n국물이 깔끔했다.`}};
  const save=await request('/posts/'+post.id,'PUT',{revision:post.revision,data});
  assert.equal(save.status,200,await save.clone().text());
  const record:Saved=await save.json();
  assert.equal(record.revision,1);
  assert.deepEqual(record.data,data);
  const conflict=await request('/posts/'+post.id,'PUT',{revision:post.revision,data});
  assert.equal(conflict.status,409);
  const versions:{id:string;revision:number}[]=await (await request('/posts/'+post.id+'/versions')).json();
  assert.deepEqual(versions.map(version=>version.revision),[1,0]);
  const original=await (await request('/posts/'+post.id+'/versions/'+versions[1].id)).json();
  assert.equal(original.data.draft.body,'');
  const restore=await request('/posts/'+post.id,'PUT',{revision:1,data:original.data});
  assert.equal(restore.status,200);
  assert.equal((await restore.json()).revision,2);
  assert.equal((await fetch(origin+'/uploads/'+photo.id)).status,200);
});

test('API 키가 없으면 검색, 사진 분석, 초안 생성에서 설정 안내를 반환한다',async()=>{
  assert.equal((await request('/places?q='+encodeURIComponent('식당'))).status,503);
  const {id}=await (await request('/posts','POST')).json();
  const badFile=new FormData();badFile.append('photo',new Blob(['<svg/>'],{type:'image/png'}),'invalid.png');
  assert.equal((await fetch(origin+'/api/posts/'+id+'/photos',{method:'POST',body:badFile})).status,415);
  const data=newPost();data.visit.name='식당';
  const generation=await request('/generate','POST',{data,rewrite:false});
  assert.equal(generation.status,503);
  assert.match((await generation.json()).error,/OPENAI_API_KEY/);
  const style:Style=await (await request('/style')).json();
  style.samples=[{title:'직접 추가',body:'방문해서 적은 문장입니다.'}];
  const saved=await request('/style','PUT',style);
  assert.equal(saved.status,200);
  assert.deepEqual((await (await request('/style')).json()).samples,style.samples);
  assert.equal((await request('/style/analyze','POST',style)).status,503);
});
