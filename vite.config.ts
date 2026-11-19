import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode})=>{
  const port=process.env.PORT||loadEnv(mode,process.cwd(),'PORT').PORT||4174;
  const target='http://127.0.0.1:'+port;
  return {plugins:[react()],server:{port:5173,strictPort:true,proxy:{'/api':target,'/uploads':target}}};
});
