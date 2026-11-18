// Isolated loopback verification harness; never built or imported by Netlify.
import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createFixture} from './staff-local-server.mjs';
import {activateWalletProgram} from '../server/wallet-events.mjs';
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url))),port=9006,origin=`http://127.0.0.1:${port}`,apiOrigin='https://care-local.invalid',cookieName='clinime-care-local-session';
const fixture=await createFixture({origin:apiOrigin,seed:false,elapsed:true,epoch:new Date().toISOString(),adminEmails:['owner@example.invalid']});
// Initialize the actual visit-card shape in this isolated memory store only.
// No Loopy adapter is configured or called by this review server.
await activateWalletProgram(fixture.store,fixture.now,{campaignId:'local-card-review-only'});
const sessions={owner:await fixture.login('owner@example.invalid'),customer:await fixture.login('player@example.invalid')};
const localCookie=value=>value.replace('__Host-clinime-session',cookieName).replace(/; Secure/ig,'');
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.json':'application/json'};
http.createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(400,headers);res.end();return;}
 const url=new URL(req.url,origin);
 if(url.pathname==='/__local/signin'&&req.method==='GET'){
  const kind=url.searchParams.get('as');if(!['owner','customer'].includes(kind)){res.writeHead(400,headers);res.end();return;}
  res.writeHead(303,{...headers,'Set-Cookie':localCookie(sessions[kind].setCookie),Location:kind==='owner'?'/admin#marketing/contest':'/#/care-point'});res.end();return;
 }
 if(url.pathname==='/__local/qa-code'){const latest=fixture.mail.calls.at(-1)?.text||'';const code=latest.match(/(?<![0-9])[0-9]{6}(?![0-9])/)?.[0]||'';res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({fakeMailOnly:true,code}));return;}
 if(url.pathname==='/__local/health'){res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({isolated:true,realProviders:false}));return;}
 if(url.pathname.startsWith('/api/')){
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1500000){res.writeHead(413,headers);res.end();return;}chunks.push(chunk);}const bytes=Buffer.concat(chunks),incoming={...req.headers};
  if(incoming.origin===origin)incoming.origin=apiOrigin;
  if(incoming.cookie)incoming.cookie=incoming.cookie.replaceAll(cookieName,'__Host-clinime-session');
  const result=await fixture.api(new Request(apiOrigin+url.pathname+url.search,{method:req.method,headers:incoming,...(bytes.length?{body:bytes}:{})}),{ip:'127.0.0.1'});
  const outgoing=Object.fromEntries(result.headers);if(outgoing['set-cookie'])outgoing['set-cookie']=localCookie(outgoing['set-cookie']);
  res.writeHead(result.status,outgoing);res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,headers);res.end();return;}
 let file=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,''));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403,headers);res.end();return;}
 if(/^\/admin(?:\/|$)/.test(url.pathname))file=path.join(root,'admin/index.html');
 try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');}catch{if(path.extname(url.pathname)){res.writeHead(404,headers);res.end();return;}file=path.join(root,'index.html');}
 const content=await readFile(file),out={...headers,'Content-Type':types[path.extname(file)]||'application/octet-stream'};
 if(url.pathname.startsWith('/game'))out['Content-Security-Policy']=headers['Content-Security-Policy'].replace("frame-ancestors 'none'","frame-ancestors 'self'");
 res.writeHead(200,out);res.end(req.method==='HEAD'?undefined:content);
 }catch(error){res.writeHead(500,headers);res.end('Isolated review failed');console.error(error.message);}
}).listen(port,'127.0.0.1',()=>console.log(`Care Point isolated review: ${origin}`));
