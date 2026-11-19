export async function api<T>(url:string,method='GET',data?:unknown):Promise<T>{
  const form=data instanceof FormData;
  const response=await fetch('/api'+url,{method,headers:method==='GET'||form?undefined:{'Content-Type':'application/json'},body:form?data:method==='GET'?undefined:JSON.stringify(data??{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result) throw new Error(result?.error||'서버에 연결할 수 없습니다. 실행 상태를 확인하세요.');
  return result;
}
export type Config={ai:boolean;places:boolean;model:string};
export type ListItem={id:string;updatedAt:string;name:string;title:string;photos:string[];complete:boolean};
