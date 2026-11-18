window.CATEGORIES=[{id:'skin',key:'categorySkin'},{id:'injectables',key:'categoryInjectables'},{id:'laser',key:'categoryLaser'},{id:'cosmetic',key:'categoryCosmetic'},{id:'consultations',key:'categoryConsultations'}];
// Existing appointments may carry older category art. Resolve known services by ID.
window.catalogPhotoKey = (id, fallback) => {
  const key = 'treatment-' + id;
  return ASSETS[key] ? key : fallback;
};
window.CATALOG=[
 ['basic','serviceBasicFacial','skin',250,40,'skin'],['deep','serviceDeepFacial','skin',350,50,'skin'],
 ['hydra','serviceHydrafacial','skin',650,60,'skin',[['basic','optionBasic',650,60],['deluxe','optionDeluxe',850,75],['premium','optionPremium',1050,90]]],
 ['micro','serviceMicroneedling','skin',850,60,'skin'],['botox','serviceBotox','injectables',1200,40,'beauty'],
 ['filler','serviceFiller','injectables',1600,45,'beauty',[['1ml','option1ml',1600,45],['2ml','option2ml',2800,60]]],
 ['laser','serviceLaser','laser',200,20,'laser',[['underarms','optionUnderarms',200,20],['legs','optionLegs',450,40],['body','optionFullBody',700,60]]],
 ['brow','serviceBrowBleaching','cosmetic',120,20,'beauty'],['face','serviceFaceBleaching','cosmetic',180,25,'beauty'],
 ['lashes','serviceLashes','cosmetic',300,45,'beauty'],['lips','serviceLipBlushing','cosmetic',900,90,'beauty'],['brightening','serviceBrightening','cosmetic',450,40,'skin'],
 ['botox-consult','serviceBotoxConsult','consultations',200,25,'clinic'],['filler-consult','serviceFillerConsult','consultations',200,25,'clinic']
].map(([id,key,category,price,duration,image,options])=>({id,key,category,price,duration,image:catalogPhotoKey(id,image),options:options?.map(([id,key,price,duration])=>({id,key,price,duration}))||[]}));
