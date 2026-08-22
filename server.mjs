import http from 'node:http';
import { handle } from './src/app.mjs';
const host=process.env.HOST||'127.0.0.1'; const port=Number(process.env.PORT||3000);
const server=http.createServer((req,res)=>handle(req,res));
server.requestTimeout=130000; server.headersTimeout=10000;
server.listen(port,host,()=>console.log(`Nightglass listening on http://${host}:${port}`));
