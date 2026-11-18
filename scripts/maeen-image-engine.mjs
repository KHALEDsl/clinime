// Local, offline generation with stable-diffusion.cpp and DreamShaper 8 LCM.
// Assets are installed once outside the project by setup-maeen-images.py.
import { execFile } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { access, chmod, mkdir, mkdtemp, open, readFile, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const imageEngine = Object.freeze({
  name: 'DreamShaper 8 LCM',
  version: 'lykon-a4f3e152-sd984eb06-v2',
  width: 448, height: 768
});
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
let queue = Promise.resolve();

async function rejectBlankImage(output, staging) {
  // A Metal backend failure can return a valid but uniformly white PNG with
  // exit code 0. Decode a thumbnail with ImageIO before committing the file.
  const sample = path.join(staging,'histogram.bmp');
  await exec('/usr/bin/sips',['-s','format','bmp','-z','24','24',output,'--out',sample],{timeout:30000});
  const bitmap = await readFile(sample);
  const offset=bitmap.readUInt32LE(10);
  if (bitmap.toString('ascii',0,2)!=='BM' || bitmap.readUInt16LE(28)!==24 || bitmap.length<offset+24*24*3) {
    throw Error('Unexpected decoded sample format.');
  }
  let total=0, squares=0;
  for(let i=offset;i<offset+24*24*3;i+=3){
    const luma=(bitmap[i]*.0722+bitmap[i+1]*.7152+bitmap[i+2]*.2126);
    total+=luma;
    squares+=luma*luma;
  }
  const count=24*24;
  if(squares/count-(total/count)**2<2) throw Error('Image has no visible tonal detail.');
}

async function render({ prompt, outputPath, signal }) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 3500) {
    throw new TypeError('A visual prompt of 1–3500 characters is required.');
  }
  if (!path.isAbsolute(outputPath) || path.extname(outputPath).toLowerCase() !== '.png') {
    throw new TypeError('An absolute PNG destination is required.');
  }
  signal?.throwIfAborted();
  const cache = process.env.CLINIME_MAEEN_IMAGE_CACHE || path.join(os.homedir(), 'Library', 'Caches', 'ClinimeMaeenImage');
  const binary = path.join(cache, 'sd-cli');
  const model = path.join(cache, 'DreamShaper8_LCM.safetensors');
  await Promise.all([access(binary, constants.X_OK), access(model, constants.R_OK)]);
  const destination = path.dirname(outputPath);
  await mkdir(destination, {recursive:true,mode:0o700});
  const staging = await mkdtemp(path.join(destination,'.render-'));
  const output = path.join(staging,'image.png');
  const seed = randomInt(1, 2147483647);
  try {
    const visual = prompt.replace(/[<>\x00-\x1f]/g,' ').trim();
    const args = ['-m',model,'-p',visual,'-n','text, typography, logo, watermark, cartoon, clutter, deformed, oversaturated, low resolution, illustration',
      '-W',String(imageEngine.width),'-H',String(imageEngine.height),'--sampling-method','lcm','--scheduler','discrete','--cfg-scale','1','--batched-cfg','off',
      '--steps','7','-t','4','-s',String(seed),'-o',output];
    await exec(binary,args,{cwd:cache,env:{...process.env,GGML_METAL_TENSOR_DISABLE:'1'},timeout:300000,signal,maxBuffer:6*1024*1024,windowsHide:true});
    const handle = await open(output,'r');
    try {
      const header=Buffer.alloc(24);
      const {bytesRead}=await handle.read(header,0,header.length,0);
      if(bytesRead!==24 || !header.subarray(0,8).equals(pngSignature) ||
         header.readUInt32BE(16)!==imageEngine.width || header.readUInt32BE(20)!==imageEngine.height){
        throw Error('Model did not produce the expected portrait PNG.');
      }
    } finally { await handle.close(); }
    await rejectBlankImage(output, staging);
    await chmod(output,0o600);
    await rename(output, outputPath);
    return {...imageEngine,seed,path:outputPath};
  } catch(error) {
    if(signal?.aborted)throw signal.reason;
    const failure = new Error('Local image generation failed.');
    // Exclude command line and prompts from errors forwarded to the application.
    failure.code = error.killed ? 'IMAGE_GENERATION_TIMEOUT' : 'IMAGE_GENERATION_FAILED';
    throw failure;
  } finally { await rm(staging,{recursive:true,force:true}); }
}

export function generateImage(request) {
  // The laptop shares unified memory with the local text model.
  const job=queue.then(()=>render(request));
  queue=job.catch(()=>{});
  return job;
}
