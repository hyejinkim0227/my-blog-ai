import styled,{createGlobalStyle} from 'styled-components';

export const Global=createGlobalStyle`
  :root { font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif; color:#172b25; background:#f4f7f5; font-synthesis:none; --line:#e0e8e3; --green:#146d52; --muted:#51665f; --light:#eaf4ee; }
  *{box-sizing:border-box} body{margin:0} button,input,textarea,select{font:inherit} button{cursor:pointer} button:disabled{cursor:not-allowed;opacity:.55}
  a{color:var(--green)} button:focus-visible, a:focus-visible, input:focus-visible,textarea:focus-visible,select:focus-visible,[contenteditable]:focus-visible{outline:2px solid #339475;outline-offset:2px}
  h1,h2,h3,p,figure{margin:0} p{line-height:1.6} svg{flex-shrink:0} img{max-width:100%}
  [hidden]{display:none!important}
`;
export const Shell=styled.div`
  display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh;
  @media(max-width:960px){grid-template-columns:1fr}
`;
export const Sidebar=styled.aside`
  height:100vh;position:sticky;top:0;background:#fff;border-right:1px solid var(--line);display:flex;flex-direction:column;padding:26px 16px 18px;
  @media(max-width:960px){height:auto;position:static;border-right:0;border-bottom:1px solid var(--line);padding:14px 18px;gap:12px}
`;
export const Brand=styled.div`
 display:flex;align-items:center;gap:10px;padding:0 8px;margin-bottom:42px;font-size:17px;font-weight:800;letter-spacing:-.055em;
 span:first-child{width:38px;height:38px;border-radius:11px;background:#146d52;color:white;display:grid;place-items:center}
 small{display:block;color:var(--muted);font-size:11px;font-weight:650;letter-spacing:.02em;margin-top:2px}
 @media(max-width:960px){margin:0;padding:0}
`;
export const Nav=styled.nav`
 display:grid;gap:5px; label{padding:0 10px 8px;font-size:12px;font-weight:750;color:var(--muted)}
 @media(max-width:960px){display:flex;flex-wrap:wrap;label{display:none}}
`;
export const NavButton=styled.button<{$active?:boolean}>`
 border:0;border-radius:8px;background:${p=>p.$active?'#eaf4ee':'transparent'};color:${p=>p.$active?'#135f49':'#3c544b'};display:flex;gap:9px;align-items:center;text-align:left;padding:11px 10px;font-size:14px;font-weight:${p=>p.$active?750:550};
 &:hover{background:#edf5f0}
`;
export const SidebarFoot=styled.div`
 margin-top:auto;padding:12px;background:#f4f7f5;border:1px solid var(--line);border-radius:10px;color:var(--muted);font-size:12px;display:flex;align-items:center;gap:8px;
 @media(max-width:960px){display:none}
`;
export const Header=styled.header`
 height:66px;background:white;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 clamp(16px,3vw,35px);font-size:14px;
 > div{display:flex;gap:9px;align-items:center;min-width:0} > div:first-child{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
 @media(max-width:560px){height:auto;min-height:58px;flex-wrap:wrap;padding-block:8px}
`;
export const Main=styled.main`padding:27px clamp(16px,3vw,35px) 48px;max-width:1540px;margin:auto;`;
export const PageHead=styled.div`
 display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:22px;
 h1{font-size:clamp(23px,3vw,30px);letter-spacing:-.06em;line-height:1.22;margin-bottom:7px} p{color:var(--muted);font-size:14px}
 @media(max-width:540px){flex-wrap:wrap}
`;
export const Columns=styled.div`
 display:grid;grid-template-columns:minmax(0,1.06fr) minmax(0,.94fr);gap:20px;align-items:start;
 @media(max-width:1120px){grid-template-columns:1fr}
`;
export const Stack=styled.div`display:grid;gap:16px;min-width:0`;
export const Card=styled.section`
 background:#fff;border:1px solid var(--line);border-radius:13px;padding:19px;min-width:0;box-shadow:0 2px 5px #18352804;
 h2{font-size:17px;letter-spacing:-.035em} h3{font-size:14px;letter-spacing:-.02em} details>summary{cursor:pointer;font-weight:700;font-size:14px}
 @media(max-width:500px){padding:14px}
`;
export const CardTitle=styled.div`
 display:flex;align-items:center;gap:10px;margin-bottom:15px;
 > span{display:grid;place-items:center;background:#edf6f0;color:var(--green);height:32px;width:32px;border-radius:8px}
`;
export const Row=styled.div`display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0`;
export const Spread=styled(Row)`justify-content:space-between`;
export const Fields=styled.div`
 display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr));margin:12px 0;
 @media(max-width:510px){grid-template-columns:1fr}
`;
export const Field=styled.label`
 display:grid;gap:6px;font-size:14px;font-weight:650;min-width:0;
 input,textarea,select{width:100%;min-width:0;border:1px solid #dbe5de;color:#172b25;background:#fff;border-radius:8px;padding:9px 10px;font-size:14px;font-weight:450;min-height:41px}
 input::placeholder,textarea::placeholder{color:#687c73} textarea{resize:vertical;line-height:1.55}
 select{appearance:none;padding-right:25px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2340534b'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E");background-size:16px;background-repeat:no-repeat;background-position:right 7px center}
`;
export const Button=styled.button<{$primary?:boolean;$subtle?:boolean}>`
 display:inline-flex;align-items:center;justify-content:center;gap:6px;max-width:100%;border:1px solid ${p=>p.$primary?'#146d52':p.$subtle?'transparent':'#dbe5de'};border-radius:8px;min-height:36px;padding:7px 11px;background:${p=>p.$primary?'#146d52':p.$subtle?'#edf5ef':'#fff'};color:${p=>p.$primary?'#fff':'#24493d'};font-size:14px;font-weight:700;white-space:normal;text-align:left;
 &:hover:not(:disabled){background:${p=>p.$primary?'#105b44':'#eaf4ee'}}
`;
export const Toggle=styled.div`
 display:inline-flex;background:#f2f6f3;border:1px solid var(--line);padding:3px;border-radius:9px;gap:3px;flex-wrap:wrap;
 button{display:inline-flex;gap:6px;align-items:center;justify-content:center;background:transparent;border:1px solid transparent;border-radius:6px;padding:6px 10px;color:var(--muted);font-size:13px;font-weight:650}
 button[aria-pressed=true]{background:white;border-color:var(--line);color:#144c3a;box-shadow:0 1px 2px #173a2410}
`;
export const Note=styled.p`color:var(--muted);font-size:13px;overflow-wrap:anywhere;`;
export const Notice=styled.p<{$error?:boolean}>`
 margin:0 0 14px;border:1px solid ${p=>p.$error?'#f0cfc7':'#cce4d6'};background:${p=>p.$error?'#fff4f1':'#edf8f1'};color:${p=>p.$error?'#902e1e':'#1a5e46'};padding:9px 12px;border-radius:8px;font-size:14px;overflow-wrap:anywhere;
`;
export const Badge=styled.span<{$warn?:boolean}>`
 display:inline-flex;align-items:center;gap:6px;border-radius:30px;padding:4px 8px;color:${p=>p.$warn?'#845723':'#205b46'};background:${p=>p.$warn?'#fbf1de':'#eaf4ee'};font-weight:650;font-size:12px;white-space:nowrap;
`;
export const ListRow=styled.div`
 border:1px solid var(--line);padding:12px;border-radius:9px;display:grid;gap:5px;overflow-wrap:anywhere;
`;
export const Drop=styled.button<{$over?:boolean}>`
 border:1px dashed #9fbead;background:${p=>p.$over?'#e7f5ec':'#f8fbf9'};border-radius:10px;width:100%;min-height:122px;display:grid;place-items:center;align-content:center;gap:7px;color:#285e4a;font-weight:700;font-size:14px;padding:12px;
 &:hover{background:#eff7f1} small{color:var(--muted);font-size:12px;font-weight:500}
`;
export const Placeholder=styled.div`
 background:#f7faf8;border:1px solid #e6eee8;border-radius:10px;min-height:355px;display:grid;justify-items:center;align-content:center;text-align:center;gap:9px;padding:25px;
 > span{display:grid;place-items:center;width:54px;height:54px;color:#4c816e;background:#e9f3ed;border-radius:15px;margin-bottom:5px} h3{font-size:16px}
`;
export const Preview=styled.article<{$mobile?:boolean}>`
 width:100%;max-width:${p=>p.$mobile?'360px':'100%'};margin:auto;background:#fff;min-height:230px;border:1px solid var(--line);padding:clamp(13px,3vw,27px);border-radius:9px;overflow-wrap:anywhere;
 h2{font-size:23px;line-height:1.45;margin-bottom:18px} p{white-space:pre-wrap;line-height:1.85;margin-bottom:13px} figure{margin:15px 0} img{width:100%;border-radius:5px} figcaption{color:var(--muted);font-size:13px;margin-top:5px}
`;
export const EditorFrame=styled.div`
 border:1px solid var(--line);border-radius:8px;padding:11px;
 .tiptap{min-height:220px;max-height:590px;overflow:auto;overflow-wrap:anywhere;outline:0}
 .tiptap p{margin-bottom:9px;white-space:pre-wrap} .tiptap [data-photo-id]{margin:11px 0;padding:8px 10px;border:1px solid #cee5d8;border-radius:7px;background:#eff8f2;color:#1b6149;font-size:13px;font-weight:650;user-select:none}
 .tiptap .ProseMirror-selectednode{outline:2px solid #339475}
`;
