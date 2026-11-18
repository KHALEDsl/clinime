// Run after native family creation. Figma set-level TEXT defaults are shared.
// Separate differing defaults so real instances preserve state/intent meaning.
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(PAGE_ID));
const altered=[];const newPropertyKeys=[];const createdNodeIds=[];const deletedNodeIds=[];const checks=[];
for(const set of figma.currentPage.children.filter(n=>n.type==='COMPONENT_SET')){
 const groups={};for(const v of set.children)for(const t of v.findAllWithCriteria({types:['TEXT']})){const key=t.componentPropertyReferences.characters;if(key)(groups[key]??=[]).push({t,v,value:t.characters});}
 for(const [key,nodes]of Object.entries(groups)){
  const values=[...new Set(nodes.map(n=>n.value))];if(values.length<2)continue;
  const base=key.split('#')[0];const keys={};
  for(const value of values){const item=nodes.find(n=>n.value===value);const state=item.v.name.replace(/Intent=|State=/g,'').replace(/, /g,' · ');const name=base+' / '+state;const existing=Object.keys(set.componentPropertyDefinitions).find(k=>k.split('#')[0]===name);keys[value]=existing||set.addComponentProperty(name,'TEXT',value);newPropertyKeys.push({set:set.name,property:keys[value],defaultValue:value});}
  for(const n of nodes){n.t.componentPropertyReferences={...n.t.componentPropertyReferences,characters:keys[n.value]};altered.push(n.t.id);}
  set.deleteComponentProperty(key);altered.push(set.id);
 }
 for(const v of set.children){const i=v.createInstance();createdNodeIds.push(i.id,...i.findAll(()=>true).map(n=>n.id));const expected=v.findAllWithCriteria({types:['TEXT']}).map(t=>t.characters);const actual=i.findAllWithCriteria({types:['TEXT']}).map(t=>t.characters);const expectedIcons=await Promise.all(v.findAllWithCriteria({types:['INSTANCE']}).map(async n=>(await n.getMainComponentAsync()).key));const actualIcons=await Promise.all(i.findAllWithCriteria({types:['INSTANCE']}).map(async n=>(await n.getMainComponentAsync()).key));checks.push({family:set.name,state:v.name,textMatches:JSON.stringify(expected)===JSON.stringify(actual),iconsMatch:JSON.stringify(expectedIcons)===JSON.stringify(actualIcons),textCount:expected.length,iconCount:expectedIcons.length});deletedNodeIds.push(i.id);i.remove();}
}
return {mutatedNodeIds:[...new Set(altered)],createdNodeIds,deletedNodeIds,newPropertyKeys,checks,families:figma.currentPage.children.filter(n=>n.type==='COMPONENT_SET').length,variants:checks.length,mismatches:checks.filter(c=>!c.textMatches||!c.iconsMatch)};
