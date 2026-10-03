import zipfile,json,io,os,hashlib,argparse
from datetime import date
from PIL import Image
from pathlib import Path
parser=argparse.ArgumentParser(description='Build the shared web catalogue from a Studio product-pack ZIP')
parser.add_argument('source',help='Product pack exported from Import & share')
parser.add_argument('--output',default='public/catalogue')
args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(args.source) as z:
 d=json.loads(z.read('products.json'));encoded={};mapping={}
 for idx,n in enumerate(sorted({v['image'] for p in d['products'] for v in p['variants']})):
  im=Image.open(io.BytesIO(z.read(n))).convert('RGBA');im.thumbnail((1800,1800));buf=io.BytesIO();im.save(buf,format='WEBP',quality=90,method=4)
  raw=buf.getvalue();image='media/'+hashlib.sha256(raw).hexdigest()+'.webp';mapping[n]=image;encoded[image]=raw
  if idx%40==0:print('Optimized',idx+1,flush=True)
 for p in d['products']:
  for v in p['variants']:v['image']=mapping[v['image']]
 version=hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()[:16]
 packs=[];batch=[];size=0
 def pack(ps):
  names={v['image'] for p in ps for v in p['variants']};b=io.BytesIO()
  with zipfile.ZipFile(b,'w',compression=zipfile.ZIP_STORED) as dst:
   dst.writestr('products.json',json.dumps({'version':2,'products':ps},ensure_ascii=False))
   for n in sorted(names):dst.writestr(n,encoded[n])
  raw=b.getvalue();name=f'products-{version}-{len(packs)+1:02}.zip';(out/name).write_bytes(raw);packs.append({'file':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'products':len(ps),'ids':[p['id'] for p in ps]})
 for p in d['products']:
  n=sum(len(encoded[v['image']]) for v in p['variants'])
  if batch and size+n>1400000:pack(batch);batch=[];size=0
  batch.append(p);size+=n
 if batch:pack(batch)
 manifest={'version':version,'name':'Klättermusen catalogue','updated':date.today().isoformat(),'products':len(d['products']),'features':sum(bool(p.get('features')) for p in d['products']),'bytes':sum(p['bytes'] for p in packs),'packs':packs}
 (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('DONE',json.dumps({k:v for k,v in manifest.items() if k!='packs'}),'packs',len(packs),flush=True)
