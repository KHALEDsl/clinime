// Apply only after the Figma connection has recovered. The existing component
// sets must be inspected first; this script never deletes or replaces masters.
await figma.loadFontAsync({family:'Sora',style:'Regular'});
await figma.loadFontAsync({family:'Sora',style:'SemiBold'});
const p=await figma.getNodeByIdAsync('2:259');await figma.setCurrentPageAsync(p);
const variables=await figma.variables.getLocalVariablesAsync();
const focus=variables.find(v=>v.name==='color/focus/ring');
if(!focus)throw new Error('Missing focus color variable');
const created=[],changed=[],states=[];
for(const [name,sourceId] of [['TextArea','15:4572'],['SearchField','15:4589'],['Select','15:4659'],['PhoneField','15:4776'],['OtpInput','15:5051'],['Combobox','15:4708'],['AmountField','15:4805'],['NumberField','15:4822'],['DateField','15:4857'],['TimeField','15:4898'],['ColorInput','15:4931'],['FileUpload','15:4966']]){
 const set=p.children.find(n=>n.type==='COMPONENT_SET'&&n.name===name);
 if(!set)throw new Error('Missing '+name);
 if(set.children.some(c=>c.name==='State=Focus'))continue;
 const src=await figma.getNodeByIdAsync(sourceId);if(src.parent.id!==set.id)throw new Error('Unexpected source '+name);
 const clone=src.clone();set.appendChild(clone);created.push(clone.id,...clone.findAll(()=>true).map(n=>n.id));clone.name='State=Focus';
 const target=name==='OtpInput'?clone.findOne(n=>n.type==='FRAME'&&n.name==='Code digit 1'):name==='FileUpload'?clone.findOne(n=>n.type==='FRAME'&&n.name==='Upload region'):clone.findOne(n=>n.type==='FRAME'&&n.name==='Control');
 if(!target)throw new Error('Missing focus target for '+name);
 target.clipsContent=false;const ring=figma.createRectangle();target.appendChild(ring);ring.name='Focus ring / 2px + 2px gap';ring.layoutPositioning='ABSOLUTE';ring.resize(target.width+8,target.height+8);ring.x=-4;ring.y=-4;ring.fills=[];ring.strokes=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:.18,g:.24,b:.36}},'color',focus)];ring.strokeWeight=2;ring.cornerRadius=12;ring.cornerSmoothing=.6;ring.constraints={horizontal:'STRETCH',vertical:'STRETCH'};created.push(ring.id);changed.push(target.id);
 let bottom=24;for(const x of set.children.filter(n=>n.id!==clone.id))bottom=Math.max(bottom,x.y+x.height);clone.x=24;clone.y=bottom+32;set.resize(set.width,clone.y+clone.height+24);changed.push(set.id);states.push({name,set:set.id,variant:clone.id,target:target.id});
}
let y=80;for(const s of p.children.filter(x=>x.type==='COMPONENT_SET')){s.y=y;y+=s.height+64;changed.push(s.id);}
for(const t of p.children.filter(n=>n.type==='TEXT'&&n.name.startsWith('State label / '))){const parts=t.name.split(' / '),s=p.children.find(x=>x.type==='COMPONENT_SET'&&x.name===parts[1]),c=s&&s.children.find(x=>x.name===parts.slice(2).join(' / '));if(c){t.x=s.x+c.x;t.y=s.y+c.y-18;changed.push(t.id);}}
for(const item of states){const set=await figma.getNodeByIdAsync(item.set),c=await figma.getNodeByIdAsync(item.variant);const t=figma.createText();p.appendChild(t);t.name='State label / '+item.name+' / State=Focus';t.fontName={family:'Sora',style:'Regular'};t.fontSize=11;t.characters='Focus';t.fills=[{type:'SOLID',color:{r:.32,g:.36,b:.42}}];t.x=set.x+c.x;t.y=set.y+c.y-18;created.push(t.id);}
return {createdNodeIds:created,mutatedNodeIds:[...new Set(changed)],states};
