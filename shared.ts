import { z } from 'zod';

const string = z.string().max(30000);
export const categories = ['식당 외관','식당 내부','메뉴판','주문 음식','기타'] as const;
// Keep stored category values compatible with existing posts.
export const categoryLabels = {'식당 외관':'장소 외관','식당 내부':'장소 내부','메뉴판':'메뉴판','주문 음식':'주문 음식','기타':'기타'} satisfies Record<typeof categories[number], string>;
export const menus = z.object({name:string,price:string,description:string,set:string,review:z.boolean()});
export const photo = z.object({id:z.string().uuid(),name:string,category:z.enum(categories),visible:string,note:string,menu:z.array(menus).max(100)});
export const place = z.object({id:string,name:string,address:string,phone:string,website:string,map:string,hours:string,closed:string,source:string,checked:string,latitude:z.number().nullable(),longitude:z.number().nullable()});
export const visitFields = {
  name:'장소 이름',region:'방문 지역',branch:'정확한 지점명',date:'방문 날짜',ordered:'이용한 서비스·체험 또는 주문한 메뉴',price:'이용 요금·가격',wait:'웨이팅 시간',taste:'이용 소감',atmosphere:'장소 분위기',service:'서비스 평가',again:'재방문 의사',memo:'방문 메모',
} as const;
export const options = z.object({
  length:z.number().int().min(200).max(8000),tone:z.enum(['내 블로그 스타일','담백한 후기','상세한 후기']),
  emoji:z.enum(['스타일 따르기','사용 안 함','적게','보통','많이']),paragraph:z.enum(['스타일 따르기','짧게','보통','길게']),keywords:string,
  titleCount:z.number().int().min(1).max(10),tagCount:z.number().int().min(0).max(30),includeMenu:z.boolean(),
});
export const draft = z.object({
  title:string,titles:z.array(string).max(10),tags:z.array(string).max(30),body:string,baseline:string,
});
export const postData = z.object({
  mode:z.enum(['simple','detail']),visit:z.object(Object.fromEntries(Object.keys(visitFields).map(key=>[key,string])) as Record<keyof typeof visitFields,typeof string>),
  place:place.nullable(),photos:z.array(photo).max(30).refine(photos=>new Set(photos.map(item=>item.id)).size===photos.length),options,draft,
});
export const styleDefaults=options.pick({length:true,emoji:true,paragraph:true,titleCount:true,tagCount:true});
export const defaultWriting={length:1500,emoji:"스타일 따르기",paragraph:"스타일 따르기",titleCount:3,tagCount:8} as const;
export const styleData = z.object({
  defaults:styleDefaults.default(defaultWriting),
  url:string,samples:z.array(z.object({title:string,body:string})).max(40),profile:string,
  approvals:z.array(z.object({date:string,before:string,after:string})).max(50),
});
export type Place=z.infer<typeof place>;
export type Photo=z.infer<typeof photo>;
export type PostData=z.infer<typeof postData>;
export type Draft=z.infer<typeof draft>;
export type Style=z.infer<typeof styleData>;
export type Saved={id:string;revision:number;data:PostData;updatedAt:string};
export const emptyPlace:Place={id:'',name:'',address:'',phone:'',website:'',map:'',hours:'',closed:'',source:'',checked:'',latitude:null,longitude:null};
export const emptyStyle:Style={defaults:defaultWriting,url:'',samples:[],profile:'',approvals:[]};
export function newPost(defaults:Style["defaults"]=defaultWriting):PostData {
  return {
    mode:'simple',
    visit:Object.fromEntries(Object.keys(visitFields).map(key=>[key,''])) as PostData['visit'],
    place:null,photos:[],
    options:{...defaults,tone:'내 블로그 스타일',keywords:'',includeMenu:true},
    draft:{title:'',titles:[],tags:[],body:'',baseline:''},
  };
}
export function photoUrl(id:string){return '/uploads/'+id;}
export const photoMarker = /^\[\[photo:([a-f0-9-]{36})\]\]$/i;
export function splitBody(body:string) {
  return body.trim().split(/\r?\n[ \t]*\r?\n/).filter(Boolean).flatMap<{id?:string;text:string}>(block=>{
    const [first,...rest]=block.split(/\r?\n/);
    const match=photoMarker.exec(first.trim());
    return match?[{id:match[1],text:rest.join('\n')}]:[{text:block}];
  });
}
export function reorderBody(body:string, photos:Photo[]) {
  const parts=splitBody(body);
  const images=new Map(parts.flatMap(part=>part.id?[[part.id,part] as const]:[]));
  const arranged=photos.flatMap(photo=>images.has(photo.id)?[images.get(photo.id)!]:[]);
  return parts.flatMap(part=>{
    const next=part.id?arranged.shift():part;
    return next?[next.id?'[[photo:'+next.id+']]'+(next.text.trim()?'\n'+next.text.trim():''):next.text.trim()]:[];
  }).filter(Boolean).join('\n\n');
}
