import { ApiError, invalid, hash, read, update } from './core.mjs';
const MAX = 1024 * 1024;
export function createMedia({store}) {
  async function save(input) {
    if(typeof input.dataUrl!=='string'||input.dataUrl.length>Math.ceil(MAX*4/3)+100)throw invalid();
    const match=input.dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)throw invalid();
    const data=Buffer.from(match[2],'base64');if(!data.length||data.length>MAX||data.toString('base64')!==match[2])throw invalid();
    const type=match[1],valid=type==='png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==='jpeg'?data[0]===255&&data[1]===216&&data[2]===255:data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP';
    if(!valid)throw invalid();const id=hash(data);
    await update(store,'public-service-image/'+id,current=>current?{write:false,result:null}:{value:{type:'image/'+type,base64:match[2]},result:null});
    return {url:'/api/media/'+id};
  }
  async function get(id,request) {
    if(!/^[a-f0-9]{64}$/.test(id))throw invalid();const item=await read(store,'public-service-image/'+id);if(!item)throw new ApiError(404,'NOT_FOUND');
    const headers={'Content-Type':item.type,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff',ETag:'"'+id+'"'};
    return request.headers.get('if-none-match')===headers.ETag?new Response(null,{status:304,headers}):new Response(Buffer.from(item.base64,'base64'),{headers});
  }
  return {save,get};
}
