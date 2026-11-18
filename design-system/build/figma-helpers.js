// Shared native Figma construction helpers. Adapted from Figma MCP library scripts.
const created = [];
const track = n => { created.push(n.id); return n; };
const rgb = h => ({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const font = (ar=false,bold=false) => ({family:ar?'Noto Sans Arabic':'Sora',style:bold?'SemiBold':'Regular'});
await Promise.all([false,true].flatMap(ar=>[false,true].map(b=>figma.loadFontAsync(font(ar,b)))));
const vars = Object.fromEntries((await figma.variables.getLocalVariablesAsync()).map(v=>[v.name,v]));
const styles = Object.fromEntries((await figma.getLocalTextStylesAsync()).map(s=>[s.name,s]));
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const colorCollection = collections.find(c=>c.name==='Clinime Color');
function paint(key) {const p={type:'SOLID',color:rgb('#2D3E5B')};return vars[key]?figma.variables.setBoundVariableForPaint(p,'color',vars[key]):{...p,color:rgb(key.startsWith('#')?key:'#2D3E5B')};}
function fill(n,key) {n.fills=[paint(key)];return n;}
function stroke(n,key='color/border/control',weight=1) {n.strokes=[paint(key)];n.strokeWeight=weight;return n;}
function bind(n,prop,key,value) {if(vars[key])n.setBoundVariable(prop,vars[key]);else if(value!==undefined)n[prop]=value;}
function radius(n,r=8) {n.cornerRadius=r;if(r>0&&r<100)n.cornerSmoothing=.6;for(const p of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])bind(n,p,'radius/'+r);return n;}
function pad(n,p=16,gap=12) {for(const k of ['paddingLeft','paddingRight','paddingTop','paddingBottom'])bind(n,k,'space/'+p,p);bind(n,'itemSpacing','space/'+gap,gap);return n;}
function box(parent,name,w=320,dir='VERTICAL',bg=null,p=0,gap=8){const n=track(figma.createAutoLayout(dir));n.name=name;if(parent)parent.appendChild(n);n.resize(w,40);n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.fills=[];n.clipsContent=false;pad(n,p,gap);if(bg)fill(n,bg);return n;}
function text(parent,value,size=14,bold=false,key='color/text/primary',width=null,ar=false){const t=track(figma.createText());parent.appendChild(t);t.name=value.slice(0,70);t.fontName=font(ar,bold);t.fontSize=size;t.lineHeight={unit:'PERCENT',value:ar?160:150};t.letterSpacing={unit:'PIXELS',value:size>=28&&!ar?-0.7:0};t.textAutoResize=width?'HEIGHT':'WIDTH_AND_HEIGHT';if(width)t.resize(width,size*1.6);t.characters=value;t.fills=[paint(key)];t.textAlignHorizontal=ar?'RIGHT':'LEFT';const role=({12:'Caption',13:'Supporting',14:'Label',16:'Body',18:'Subheading',20:'Section',24:'Title',28:'Page',32:'Metric',36:'Display',40:'Client display'})[size];const s=styles['Clinime/'+(ar?'AR/':'EN/')+role+'/'+(bold?'SemiBold':'Regular')];if(s)t.textStyleId=s.id;t.textAutoResize=width?'HEIGHT':'WIDTH_AND_HEIGHT';return t;}
function line(parent,w=320){const n=track(figma.createRectangle());parent.appendChild(n);n.name='Divider';n.resize(w,1);fill(n,'color/border/subtle');return n;}
function row(parent,name,w=320,gap=8,p=0,bg=null){return box(parent,name,w,'HORIZONTAL',bg,p,gap);}
function prop(c,n,label='Label'){const k=c.addComponentProperty(label,'TEXT',n.characters);n.componentPropertyReferences={characters:k};return k;}
function theme(n,name='Light'){if(colorCollection){const mode=colorCollection.modes.find(m=>m.name===name);if(mode)n.setExplicitVariableModeForCollection(colorCollection,mode.modeId);}return n;}
function svg(parent,source,w=24,h=24){const n=figma.createNodeFromSvg(source);parent.appendChild(n);n.resize(w,h);created.push(n.id,...n.findAll(()=>true).map(x=>x.id));return n;}
function board(page,title,subtitle,w=1120){const n=box(page,title,w,'VERTICAL','color/bg/canvas',40,24);n.x=80;n.y=80;const tag=row(n,'Library label',w-80,8);text(tag,'CLINIME',12,true,'color/text/secondary');text(tag,'/  DESIGN SYSTEM 2.0',12,false,'color/text/secondary');text(n,title,32,true,'color/text/primary',w-80);text(n,subtitle,16,false,'color/text/secondary',w-80);line(n,w-80);return n;}
function note(parent,title,body,w=1040){const n=box(parent,title,w,'VERTICAL','color/bg/surface',24,8);radius(n,12);text(n,title,18,true,'color/text/primary',w-48);text(n,body,14,false,'color/text/secondary',w-48);return n;}
function makeComponent(page,name,w=320,dir='VERTICAL',bg='color/bg/surface',p=16,gap=8){const n=track(figma.createComponent());page.appendChild(n);n.name=name;n.layoutMode=dir;n.resize(w,48);n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.fills=[];n.clipsContent=false;pad(n,p,gap);if(bg)fill(n,bg);radius(n,12);return n;}
function combine(page,name,components,description){const set=track(figma.combineAsVariants(components,page));set.name=name;set.description=description;set.fills=[];let x=24,y=24,maxH=0,maxX=0;for(const c of components){if(x+c.width>1460&&x>24){x=24;y+=maxH+32;maxH=0;}c.x=x;c.y=y;x+=c.width+24;maxH=Math.max(maxH,c.height);maxX=Math.max(maxX,x);}set.resizeWithoutConstraints(maxX,y+maxH+24);return set;}
function showcase(page,title,subtitle,sets){const b=board(page,title,subtitle);for(const set of sets){const section=box(b,set.name,1040,'VERTICAL',null,0,16);text(section,set.name,20,true);const examples=row(section,'Representative instances',1040,16);for(const c of set.children.slice(0,3)){const i=track(c.createInstance());examples.appendChild(i);created.push(...i.findAll(()=>true).map(x=>x.id));}text(section,set.description,13,false,'color/text/secondary',1040);line(section,1040);}let yy=80;for(const set of sets){set.x=1320;set.y=yy;yy+=set.height+80;}return b;}
function result(extra={}) {return {createdNodeIds:[...new Set(created)],...extra};}
