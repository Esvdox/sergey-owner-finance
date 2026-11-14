import http from 'node:http';
import {readFile,mkdir,readdir,writeFile,rename} from 'node:fs/promises';
import {createHash,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validate} from './public/model.mjs';
const base=path.dirname(fileURLToPath(import.meta.url)),root=path.join(base,'public');
const runtime=process.env.DATA_DIR||path.join(base,'runtime');
for(const name of ['inbox','archive','rejected'])await mkdir(path.join(runtime,name),{recursive:true});
let current=null,hash='',busy=false;
try{current=JSON.parse(await readFile(path.join(runtime,'current.json'),'utf8'));if(validate(current).length||current.isDemo)current=null;}catch{}
export async function ingest(){if(busy)return;busy=true;try{for(const file of (await readdir(path.join(runtime,'inbox'))).filter(x=>x.endsWith('.json')).sort()){
 const input=path.join(runtime,'inbox',file);let text='';try{text=await readFile(input,'utf8');if(Buffer.byteLength(text)>5*1024*1024)throw Error('Размер больше 5 МБ');const s=JSON.parse(text),errors=validate(s);if(s.isDemo)errors.push('Учебный снимок запрещён в рабочем API');if(current&&Date.parse(s.generatedAt)<Date.parse(current.generatedAt))errors.push('Снимок старее текущего');if(current&&s.id===current.id&&JSON.stringify(s)!==JSON.stringify(current))errors.push('ID версии повторён с другим содержимым');if(errors.length)throw Error(errors.join('; '));const nextHash=createHash('sha256').update(text).digest('hex');if(nextHash!==hash){await writeFile(path.join(runtime,'current.tmp'),text);await rename(path.join(runtime,'current.tmp'),path.join(runtime,'current.json'));current=s;hash=nextHash;}await rename(input,path.join(runtime,'archive',nextHash+'.json'));}
 catch(e){const suffix=Date.now()+'-'+file;await rename(input,path.join(runtime,'rejected',suffix)).catch(()=>{});await writeFile(path.join(runtime,'rejected',suffix+'.error.txt'),String(e.message));}
 }}finally{busy=false;}}
await ingest();const interval=setInterval(()=>ingest().catch(()=>{}),Math.max(1000,Number(process.env.INGEST_INTERVAL_MS||15000)));interval.unref();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
function authorized(req){const user=process.env.DASHBOARD_USER,pass=process.env.DASHBOARD_PASSWORD;if(!user||!pass)return false;const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Basic '+Buffer.from(user+':'+pass).toString('base64'));return actual.length===expected.length&&timingSafeEqual(actual,expected);}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(url.pathname==='/api/snapshot'){res.setHeader('Cache-Control','no-store');if(!authorized(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Owner finance", charset="UTF-8"'});res.end(JSON.stringify({error:'Authentication required'}));return;}res.setHeader('Content-Type',mime['.json']);if(!current){res.writeHead(404);res.end(JSON.stringify({error:'No approved snapshot'}));return;}res.end(JSON.stringify(current));return;}
 let name=decodeURIComponent(url.pathname);if(name==='/')name='/index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}try{const data=await readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(data);}catch{res.writeHead(404);res.end('Not found');}
 }catch{res.writeHead(400);res.end('Bad request');}});
server.listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1',()=>console.log('Owner dashboard: http://127.0.0.1:'+(process.env.PORT||4173)));
