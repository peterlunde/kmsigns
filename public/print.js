/* One canvas renderer for preview and PDF. Colour is baked into the page,
   so browser "background graphics" settings cannot remove it. */
window.StudioPrint=(()=>{
 const MM=300/25.4,PT=25.4/72,WIDTH=297,HEIGHT=210,fontCache=new Map();
 const cap=s=>String(s||'').trim().replace(/\p{L}/u,c=>c.toLocaleUpperCase());
 const color=(s,fallback)=>/^#[\da-f]{6}$/i.test(s||'')?s:fallback;
 const limit=(n,lo,hi,fallback)=>Number.isFinite(+n)?Math.max(lo,Math.min(hi,+n)):fallback;
 async function family(name,io){
  if(name==='System sans')return 'Arial';if(name==='System serif')return 'Georgia';
  if(!fontCache.has(name))fontCache.set(name,(async()=>{const source=await io.fontData(name);if(!source)throw Error('Font is missing: '+name);const id='StudioLabel'+fontCache.size,face=new FontFace(id,`url(${source})`);await face.load();document.fonts.add(face);return id})());
  try{return await fontCache.get(name)}catch(e){fontCache.delete(name);throw e}
 }
 function wrap(ctx,text,width){
  const lines=[];for(const paragraph of String(text).split(/\r?\n/)){let line='';for(const word of paragraph.trim().split(/\s+/).filter(Boolean)){
   if(ctx.measureText(word).width>width){if(line){lines.push(line);line=''}let fragment='';for(const c of Array.from(word)){if(fragment&&ctx.measureText(fragment+c).width>width){lines.push(fragment);fragment=''}fragment+=c}line=fragment;
   }else if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line=word}else line+=(line?' ':'')+word;
  }if(line)lines.push(line)}return lines;
 }
 function textBlock(ctx,text,width,size,font){ctx.font=`${size*PT}px "${font}"`;const lines=wrap(ctx,text,width);return {lines,size,font,line:size*PT*1.08,height:lines.length*size*PT*1.08}}
 function drawText(ctx,b,x,y,width,align='center'){
  ctx.font=`${b.size*PT}px "${b.font}"`;ctx.textAlign=align;ctx.textBaseline='alphabetic';
  b.lines.forEach((line,i)=>{const m=ctx.measureText(line);const baseline=y+i*b.line+(b.line+(m.actualBoundingBoxAscent||b.size*PT*.75)-(m.actualBoundingBoxDescent||0))/2;ctx.fillText(line,align==='center'?x+width/2:x,baseline)})
 }
 function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
 function badge(ctx,text,x,y,width,height,font,fg,size){
  ctx.font=`${size*PT}px "${font}"`;while(size>7&&ctx.measureText(text).width+8>width){size--;ctx.font=`${size*PT}px "${font}"`}
  const w=Math.min(width,ctx.measureText(text).width+8),left=x+(width-w)/2;ctx.fillStyle=fg;rounded(ctx,left,y,w,height,height/2);ctx.fill();ctx.fillStyle='#ffffff';drawText(ctx,textBlock(ctx,text,w,size,font),left,y+(height-size*PT*1.08)/2,w)
 }
 function layout(ctx,label,s,fonts,w,h){
  const shelf=s.format==='shelf',compact=s.format==='compact',pad=shelf?2:compact?3:5,innerW=w-2*pad,innerH=h-2*pad;
  const badgeH=s.badge&&!shelf?(compact?5:7):0,gap=compact?2:4;
  const textW=compact?innerW*.68-2:innerW;
  const points=s.features&&!shelf?label.p.features.filter(Boolean).slice(0,3):[];
  const featureBlocks=points.map(p=>textBlock(ctx,'• '+p,innerW,10,fonts.small));
  const featureH=featureBlocks.reduce((n,b)=>n+b.height+1,0);
  const colour=s.colour&&label.v?.name&&label.v.name.toLowerCase()!=='original'?textBlock(ctx,label.v.name,textW,10,fonts.small):null;
  const minImage=shelf?0:Math.min(compact?12:20,innerH*.25);
  let fs=limit(label.override.fontSize||s.fontSize,10,64,shelf||compact?18:26),title,copyH,available;
  for(;;){title=textBlock(ctx,label.title,textW,fs,fonts.title);copyH=(badgeH?badgeH+gap:0)+title.height+(colour?1.5+colour.height:0);available=innerH-(featureH?featureH+gap:0);
   if(shelf?copyH<=innerH:compact?copyH<=available&&available>=minImage:copyH+gap+minImage<=available)break;
   if(fs<=10)throw Error('Label is too small for '+label.title+'. Choose a larger label or fewer talking points.');fs=Math.max(10,fs-1)
  }
  return {pad,innerW,innerH,badgeH,gap,textW,title,colour,copyH,available,featureBlocks,featureH,compact,shelf};
 }
 function drawLabel(ctx,label,s,fonts,w,h,bitmap){
  const [bg,fg]=s.palette==='mono'?['#ffffff','#000000']:s.palette==='custom'?[color(s.background,'#ffffff'),color(s.text,'#172d21')]:({men:['#eeedf7','#20265a'],woman:['#faedeb','#882d29'],unisex:['#e9f0e5','#285733']}[label.p.gender]||['#e9f0e5','#285733']);
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);const l=layout(ctx,label,s,fonts,w,h);let copyX=l.pad,copyY=l.pad;
  if(l.shelf)copyY+=(l.innerH-l.copyH)/2;
  if(l.compact){copyX+=l.innerW*.32+2;copyY+=(l.available-l.copyH)/2}
  if(l.badgeH){badge(ctx,label.badge,copyX,copyY,l.textW,l.badgeH,fonts.small,fg,l.compact?10:12);copyY+=l.badgeH+l.gap}
  ctx.fillStyle=fg;drawText(ctx,l.title,copyX,copyY,l.textW,l.shelf?'left':'center');copyY+=l.title.height;
  if(l.colour)drawText(ctx,l.colour,copyX,copyY+1.5,l.textW);
  if(!l.shelf){const rect=l.compact?{x:l.pad,y:l.pad,w:l.innerW*.32,h:l.available}:{x:l.pad,y:l.pad+l.copyH+l.gap,w:l.innerW,h:l.available-l.copyH-l.gap};
   const scale=Math.min(rect.w/bitmap.width,rect.h/bitmap.height),iw=bitmap.width*scale,ih=bitmap.height*scale;
   ctx.save();if(s.palette==='mono')ctx.filter='grayscale(1)';ctx.drawImage(bitmap,rect.x+(rect.w-iw)/2,rect.y+(l.compact?(rect.h-ih)/2:0),iw,ih);ctx.restore();
  }
  let featureY=h-l.pad-l.featureH;ctx.fillStyle=fg;for(const b of l.featureBlocks){drawText(ctx,b,l.pad,featureY,l.innerW,'left');featureY+=b.height+1}
 }
 function labelsFor(req,state,s){
  const labels=[];for(const item of req.items||[]){const p=state.products.find(p=>p.id===item.id);if(!p)throw Error('A selected product is missing. Select your products again.');const vs=[];
   if(item.mode==='alternate'){const count=Math.floor(limit(item.count,0,500,0));if(count&&!p.variants.length&&s.format!=='shelf')throw Error('Add a picture for '+p.name);for(let n=0;n<count;n++)vs.push(p.variants[n%p.variants.length]||null)}
   else for(const [id,n] of Object.entries(item.counts||{})){const count=Math.floor(limit(n,0,500,0));if(!count)continue;const v=p.variants.find(v=>v.id===id);if(!v)throw Error('A selected picture is missing for '+p.name+'. Select the product again.');for(let i=0;i<count;i++)vs.push(v)}
   for(const v of vs){if(labels.length>=1000)throw Error('Maximum 1000 labels per PDF');const override=req.allowOverrides?item.override||{}:{},title=cap(override.name||p.name);if(!title)throw Error('Enter a product name before printing');
    const badgeText=p.gender==='men'?'Men’s':p.gender==='woman'?'Women’s':({sekk:'Backpack',bag:'Bag',tilbehør:'Accessories',jakke:'Jacket',bukse:'Pants',genser:'Midlayer',overdel:'Top',vest:'Vest',Other:'Unisex'}[p.category]||cap(p.category)||'Unisex');labels.push({p:{...p,features:p.features||[]},v,override,title,badge:badgeText})
   }
  }if(!labels.length)throw Error('Select at least one product');return labels;
 }
 async function render(req,state,io,onPage){
  const s={format:'card',font:'RotisSemiSansPro-Bold.otf',fontSize:26,palette:'gender',badge:true,...req.settings};
  const dims={card:[90,150],compact:[90,60],shelf:[90,22],custom:[+s.width,+s.height]},[w,h]=dims[s.format]||dims.card;
  if(!(w>=30&&w<=281&&h>=15&&h<=194))throw Error('Choose a size between 30–281 × 15–194 mm');
  const cols=Math.floor(285/(w+4)),rows=Math.floor(198/(h+4)),per=cols*rows,labels=labelsFor(req,state,s),total=Math.ceil(labels.length/per);
  const fonts={title:await family(s.font,io),small:await family('RotisSemiSansPro_Regular.otf',io)},images=new Map();
  const canvas=document.createElement('canvas');canvas.width=Math.round(WIDTH*MM);canvas.height=Math.round(HEIGHT*MM);const ctx=canvas.getContext('2d');
  try{for(let page=0;page<total;page++){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(MM,MM);
   const batch=labels.slice(page*per,(page+1)*per);for(let i=0;i<batch.length;i++){const label=batch[i];let bitmap;
    if(s.format!=='shelf'){if(!images.has(label.v.image)){const blob=await io.readImage(label.v.image);if(!blob)throw Error('Picture is missing for '+label.title);let decoded;try{decoded=await createImageBitmap(blob)}catch{throw Error('Picture cannot be opened for '+label.title)}images.set(label.v.image,decoded);if(images.size>8){const key=images.keys().next().value;images.get(key).close();images.delete(key)}}bitmap=images.get(label.v.image)}
    ctx.save();ctx.translate(8+(i%cols)*(w+4),8+Math.floor(i/cols)*(h+4));drawLabel(ctx,label,s,fonts,w,h,bitmap);ctx.restore();
   }ctx.font=`${8*PT}px Arial`;ctx.textAlign='right';ctx.fillStyle='#888888';ctx.fillText(String(Math.max(1,Math.floor(+s.start||1))+page),289,208);await onPage(canvas.toDataURL('image/jpeg',.96),page,total);window.dispatchEvent(new CustomEvent('studio:pdfprogress',{detail:{done:page+1,total}}));
  }}finally{for(const bitmap of images.values())bitmap.close();canvas.width=canvas.height=0}
 }
 function newPDF(){const pdf=new jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});if(pdf.viewerPreferences)pdf.viewerPreferences({PrintScaling:'None',PickTrayByPDFSize:true});return pdf}
 function addPage(pdf,jpeg,index){if(index)pdf.addPage([297,210],'landscape');pdf.addImage(jpeg,'JPEG',0,0,297,210)}
 async function preview(req,state,io){const pages=[],pdf=newPDF();await render(req,state,io,(jpeg,i)=>{pages.push(jpeg);addPage(pdf,jpeg,i)});
  const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:8px;background:#ddd}.sheet{width:100%;max-width:1123px;margin:0 auto 8px}.sheet img{display:block;width:100%;height:auto}@page{size:A4 landscape;margin:0}@media print{body{padding:0;background:white}.sheet{width:297mm;height:210mm;max-width:none;margin:0;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.sheet img{width:297mm;height:210mm;print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body>'+pages.map(jpeg=>'<section class="sheet"><img src="'+jpeg+'" alt="A4 landscape label sheet"></section>').join('')+'</body></html>';
  return {file:URL.createObjectURL(new Blob([html],{type:'text/html'})),pdfFile:URL.createObjectURL(pdf.output('blob')),name:'Klattermusen-labels.pdf'}
 }
 async function pdf(req,state,io){const doc=newPDF();await render(req,state,io,(jpeg,i)=>addPage(doc,jpeg,i));return {file:URL.createObjectURL(doc.output('blob')),name:'Klattermusen-labels.pdf'}}
 return {preview,pdf};
})();
