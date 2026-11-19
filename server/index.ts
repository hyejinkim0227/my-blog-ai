import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { Prisma, PrismaClient } from './generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { categories, emptyStyle, newPost, postData, styleData } from '../shared';
import { analyzePhoto, analyzeStyle, generate, revise } from './ai';
import { lookup, publicSamples } from './sources';
import { HttpError } from './errors';

const db=new PrismaClient({adapter:new PrismaBetterSqlite3({url:process.env.DATABASE_URL||'file:./prisma/studio.db'})});
const app=express();
const directory=resolve(process.env.UPLOAD_DIR||'uploads');
const port=Number(process.env.PORT||4174);
const uploads=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1}});
const uuid=z.string().uuid();
const short=z.string().trim().min(1).max(300);
const definePost=z.object({revision:z.number().int().min(0),data:postData});
const json=(data:unknown)=>data as Prisma.InputJsonValue;
const readStyle=async()=>styleData.parse((await db.style.findUnique({where:{id:'personal'}}))?.data||emptyStyle);
const getPost=async(id:string)=>{
  const post=await db.post.findUnique({where:{id}});
  if(!post) throw new HttpError(404,'포스팅을 찾을 수 없습니다.');
  return post;
};
const saveStyle=(data:z.infer<typeof styleData>)=>db.style.upsert({where:{id:'personal'},create:{id:'personal',data:json(data)},update:{data:json(data)}});

app.disable('x-powered-by');
app.use((req,res,next)=>{
  if(!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(req.get('host')||'')) return next(new HttpError(403,'로컬 주소로 접속해 주세요.'));
  res.setHeader('X-Content-Type-Options','nosniff');next();});
app.use('/api',(req,res,next)=>{
  const origin=req.get('origin');
  const trusted=new Set([port,5173].flatMap(value=>['http://127.0.0.1:'+value,'http://localhost:'+value]));
  if(origin&&!trusted.has(origin)) return next(new HttpError(403,'허용되지 않은 요청 출처입니다.'));
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!req.is('application/json')&&!req.is('multipart/form-data'))
    return next(new HttpError(415,'JSON 또는 파일 업로드 요청이 필요합니다.'));
  res.setHeader('Cache-Control','no-store');
  next();
});
app.use(express.json({limit:'8mb'}));

app.get('/api/config',(_req,res)=>res.json({ai:Boolean(process.env.OPENAI_API_KEY),places:Boolean(process.env.GOOGLE_PLACES_API_KEY),model:process.env.OPENAI_MODEL||'gpt-4.1-mini'}));
app.get('/api/places',async(req,res)=>res.json(await lookup(short.parse(req.query.q))));
app.get('/api/posts',async(_req,res)=>{
  const posts=await db.post.findMany({orderBy:{updatedAt:'desc'}});
  res.json(posts.map(item=>{const data=postData.parse(item.data);return {id:item.id,updatedAt:item.updatedAt,name:data.visit.name||data.place?.name||'',title:data.draft.title,photos:data.photos.map(photo=>photo.id),complete:!!data.draft.body};}));
});
app.post('/api/posts',async(_req,res)=>{
  const data=json(newPost((await readStyle()).defaults));
  const post=await db.post.create({data:{data,versions:{create:{revision:0,data}}}});
  res.status(201).json(post);
});
app.get('/api/posts/:id',async(req,res)=>res.json(await getPost(uuid.parse(req.params.id))));
app.put('/api/posts/:id',async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const {revision,data}=definePost.parse(req.body);
  const updated=await db.$transaction(async tx=>{
    const existing=await tx.post.findUnique({where:{id}});
    if(!existing) throw new HttpError(404,'포스팅을 찾을 수 없습니다.');
    if(existing.revision!==revision) throw new HttpError(409,'다른 화면에서 변경되었습니다. 현재 내용을 복사한 뒤 포스팅을 다시 열어 주세요.');
    if(data.photos.length){
      const count=await tx.photo.count({where:{postId:id,id:{in:data.photos.map(photo=>photo.id)}}});
      if(count!==data.photos.length) throw new HttpError(400,'이 포스팅의 사진만 연결할 수 있습니다.');
    }
    if(JSON.stringify(existing.data)===JSON.stringify(data)) return existing;
    const next=revision+1;
    return tx.post.update({where:{id,revision},data:{revision:next,data:json(data),versions:{create:{revision:next,data:json(data)}}}});
  });
  res.json(updated);
});
app.get('/api/posts/:id/versions',async(req,res)=>{
  const postId=uuid.parse(req.params.id);
  res.json(await db.version.findMany({where:{postId},select:{id:true,createdAt:true,revision:true},orderBy:{revision:'desc'}}));
});
app.get('/api/posts/:id/versions/:version',async(req,res)=>{
  const version=await db.version.findFirst({where:{id:uuid.parse(req.params.version),postId:uuid.parse(req.params.id)}});
  if(!version) throw new HttpError(404,'저장 버전을 찾을 수 없습니다.');
  res.json(version);
});
export function mimeOf(bytes:Buffer){
  if(bytes.length<12) return '';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255) return 'image/jpeg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP') return 'image/webp';
  return '';
}
app.post('/api/posts/:id/photos',uploads.single('photo'),async(req,res)=>{
  const postId=uuid.parse(req.params.id);
  await getPost(postId);
  if(!req.file) throw new HttpError(400,'사진을 선택하세요.');
  const mime=mimeOf(req.file.buffer);
  if(!mime) throw new HttpError(415,'JPG, PNG, WEBP 사진을 올려 주세요. HEIC는 JPEG로 변환 후 올려 주세요.');
  const id=randomUUID();
  const path=join(directory,id);
  const name=Buffer.from(req.file.originalname,'latin1').toString('utf8').slice(0,255);
  await writeFile(path,req.file.buffer,{flag:'wx'});
  try{await db.photo.create({data:{id,postId,path:id,name,mime,size:req.file.size}});}
  catch(error){await unlink(path).catch(()=>{});throw error;}
  res.status(201).json({id,name,category:'기타',visible:'',note:'',menu:[]});
});
app.get('/uploads/:id',async(req,res)=>{
  const photo=await db.photo.findUnique({where:{id:uuid.parse(req.params.id)}});
  if(!photo) throw new HttpError(404,'사진을 찾을 수 없습니다.');
  res.type(photo.mime).sendFile(photo.path,{root:directory,headers:{'Content-Security-Policy':"default-src 'none'"}});
});
app.post('/api/posts/:id/photos/:photo/analyze',async(req,res)=>{
  const photo=await db.photo.findFirst({where:{id:uuid.parse(req.params.photo),postId:uuid.parse(req.params.id)}});
  if(!photo) throw new HttpError(404,'사진을 찾을 수 없습니다.');
  const {category}=z.object({category:z.enum(categories).optional()}).parse(req.body);
  if(!process.env.OPENAI_API_KEY) throw new HttpError(503,'OPENAI_API_KEY를 설정해야 사진을 분석할 수 있습니다.');
  const bytes=await readFile(join(directory,photo.path));
  res.json(await analyzePhoto('data:'+photo.mime+';base64,'+bytes.toString('base64'),category));
});
app.post('/api/generate',async(req,res)=>{
  const {data,rewrite}=z.object({data:postData,rewrite:z.boolean()}).parse(req.body);
  if(!data.visit.name.trim()&&!data.place?.name.trim()) throw new HttpError(400,'장소 이름을 먼저 입력하세요.');
  res.json(await generate(data,await readStyle(),rewrite));
});
app.post('/api/revise',async(req,res)=>{
  const {data,action,selection}=z.object({data:postData,action:z.enum(['paragraph','spell','titles']),selection:z.string().max(30000)}).parse(req.body);
  res.json(await revise(data,await readStyle(),action,selection));
});
app.get('/api/style',async(_req,res)=>res.json(await readStyle()));
app.put('/api/style',async(req,res)=>{
  const style=styleData.parse(req.body);
  await saveStyle(style);
  res.json(style);
});
app.post('/api/style/import',async(req,res)=>res.json(await publicSamples(short.parse(req.body.url))));
app.post('/api/style/analyze',async(req,res)=>{
  const style=styleData.parse(req.body);
  if(!style.samples.some(item=>item.body.trim())&&!style.approvals.length) throw new HttpError(400,'분석할 블로그 글을 추가하세요.');
  res.json(await analyzeStyle(style));
});
app.post('/api/style/approve',async(req,res)=>{
  const {id}=z.object({id:uuid}).parse(req.body);
  const post=await getPost(id);
  const {draft}=postData.parse(post.data);
  if(!draft.baseline||draft.body===draft.baseline) throw new HttpError(400,'AI 초안과 달라진 본문을 먼저 저장하세요.');
  const style=await readStyle();
  if(style.approvals.some(item=>item.before===draft.baseline&&item.after===draft.body)) return res.json(style);
  style.approvals=[...style.approvals,{before:draft.baseline,after:draft.body,date:new Date().toISOString()}].slice(-50);
  style.profile=(await analyzeStyle(style)).profile;
  await saveStyle(style);
  res.json(style);
});
app.use('/api',(_req,res)=>res.status(404).json({error:'요청한 기능을 찾을 수 없습니다.'}));
app.use(express.static(resolve('dist')));
app.get('/',(_req,res)=>res.sendFile(resolve('dist/index.html')));
const errors:ErrorRequestHandler=(err,_req,res,_next)=>{
  if(err instanceof HttpError){res.status(err.status).json({error:err.message});return;}
  if(err instanceof z.ZodError){res.status(400).json({error:'입력값을 확인하세요.',fields:err.issues.map(issue=>issue.path.join('.'))});return;}
  if(err instanceof multer.MulterError){res.status(400).json({error:'사진 한 장은 12MB 이하여야 합니다.'});return;}
  if(err.status===413){res.status(413).json({error:'요청 크기 제한을 초과했습니다.'});return;}
  if(err.status===400){res.status(400).json({error:'JSON 요청 형식이 올바르지 않습니다.'});return;}
  console.error(err.code||err.name);
  res.status(500).json({error:'요청을 처리하지 못했습니다. 서버 설정을 확인해 주세요.'});
};
app.use(errors);
await mkdir(directory,{recursive:true});
await db.$connect();
app.listen(port,'127.0.0.1',()=>console.log('블로그 스튜디오 http://127.0.0.1:'+port));
