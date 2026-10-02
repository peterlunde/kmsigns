"""Stateless Vercel function. Public product facts and bounded image downloads only."""
import base64, io, ipaddress, json, re, socket, time, unicodedata
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, urljoin
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

CACHE={}
HEADERS={'User-Agent':'Mozilla/5.0 (compatible; StockroomStudio/2.0)','Accept':'text/html,image/*;q=0.9,*/*;q=0.8'}
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def validate(url,official=False):
    p=urlparse(url)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.port not in (None,443):raise ValueError('Use a public HTTPS URL')
    if official and p.hostname not in ('www.klattermusen.com','klattermusen.com'):raise ValueError('Use an official Klättermusen product page')
    for record in socket.getaddrinfo(p.hostname,443,type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(record[4][0]).is_global:raise ValueError('Private network addresses are not allowed')
    return url

def fetch(url,official=False,limit=6_000_000):
    opener=build_opener(NoRedirect)
    for _ in range(4):
        validate(url,official)
        try:
            with opener.open(Request(url,headers=HEADERS),timeout=12) as r:
                data=r.read(limit+1)
                if len(data)>limit:raise ValueError('Remote file is too large')
                return data,r.headers.get_content_type(),url
        except HTTPError as e:
            if e.code in (301,302,303,307,308):url=urljoin(url,e.headers['Location']);continue
            raise ValueError('Website returned HTTP '+str(e.code))
    raise ValueError('Too many redirects')

def normal(text):return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',str(text)).encode('ascii','ignore').decode().lower())
def without_gender(text):return re.sub(r"\b(men['’]?s|women['’]?s|unisex|ms|ws)\b",'',text,flags=re.I).strip()
def gender_of(text):
    if re.search(r"women['’]?s|(?:^|[- /])ws(?:[- /]|$)",text,re.I):return 'woman'
    if re.search(r"\bmen['’]?s|(?:^|[- /])ms(?:[- /]|$)",text,re.I):return 'men'
    return 'unisex'

def sitemap_urls():
    c=CACHE.get('sitemap')
    if c and time.time()-c[0]<3600:return c[1]
    raw=fetch('https://www.klattermusen.com/sitemap.xml',True)[0].decode('utf-8','replace')
    urls=list(dict.fromkeys(re.findall(r'https://www\.klattermusen\.com/en-(?:no|eu)/[^\s<>"\']+',raw)))
    CACHE['sitemap']=(time.time(),urls);return urls

def resolve(data):
    if data.get('url'):return data['url']
    name=normal(without_gender(data.get('name','')));style=str(data.get('style','')).lower();gender=data.get('gender','unisex')
    if len(name)<4 and not style:raise ValueError('Missing product page. Add the official URL under Name & source.')
    matches=[]
    for url in sitemap_urls():
        slug=urlparse(url).path.rstrip('/').split('/')[-1];norm=normal(slug)
        style_match=bool(style and re.search(r'(?:^|-)'+re.escape(style)+r'(?:-|$)',slug,re.I))
        name_match=len(name)>3 and name in norm
        if (style_match or name_match) and gender_of(slug)==gender:matches.append((0 if style_match else 1,0 if '/en-no/' in url else 1,url))
    if not matches:raise ValueError('Missing product page. Add the official URL under Name & source.')
    return sorted(matches)[0][2]

def product_data(data):
    url=resolve(data);raw,_,url=fetch(url,True);soup=BeautifulSoup(raw,'html.parser');records=[]
    def walk(x):
        if isinstance(x,dict):
            kind=x.get('@type',[]);kind=[kind] if isinstance(kind,str) else kind
            if 'Product' in kind:records.append(x)
            for v in x.values():walk(v)
        elif isinstance(x,list):
            for v in x:walk(v)
    for node in soup.find_all('script',type='application/ld+json'):
        try:walk(json.loads(node.string or node.get_text()))
        except (ValueError,TypeError):pass
    if not records:raise ValueError('This page has no product record. Use a product page, not a category page.')
    p=records[0];title=p.get('name','');expected=normal(without_gender(data.get('name','')));actual=normal(without_gender(title));style=str(data.get('style','')).lower()
    sku=str(p.get('sku',p.get('mpn',''))).lower()
    name_match=bool(expected and expected==actual)
    style_match=bool(style and (sku.startswith(style) or re.search(r'(?:^|[-/])'+re.escape(style)+r'-',url,re.I)))
    if (expected or style) and not (name_match or style_match):raise ValueError('Product identity does not match: '+title+'. Check the URL or product name.')
    if data.get('gender') and gender_of(title)!=data['gender']:raise ValueError('Product gender does not match: '+title)
    for node in soup(['script','style','nav','footer']):node.decompose()
    points=[]
    for heading in soup.find_all(['h2','h3','h4','button']):
        if heading.get_text(' ',strip=True).lower() not in ('features','product details','main features','funksjoner','produktdetaljer'):continue
        for el in heading.find_all_next(['li','h2'],limit=35):
            if el.name=='h2':break
            text=el.get_text(' ',strip=True)
            if 18<=len(text)<=220 and text not in points:points.append(text)
        if len(points)>=3:break
    if not points:
        description=BeautifulSoup(p.get('description',''),'html.parser').get_text(' ',strip=True)
        points=[s.strip() for s in re.split(r'(?<=[.!?])\s+',description) if 25<=len(s.strip())<=220][:3]
    primary=p.get('image','');primary=primary[0] if isinstance(primary,list) and primary else primary
    if isinstance(primary,dict):primary=primary.get('url','')
    images=list(dict.fromkeys(re.findall(r'https://klattermusen\.centracdn\.net/[^\s"\\<>]+?\.(?:jpg|jpeg|png|webp)',raw.decode('utf-8','replace'))))
    parts=urlparse(primary).path.rsplit('/',1)[-1].split('_') if isinstance(primary,str) else []
    if len(parts)>5 and parts[1]=='hs':
        variant='_'.join(parts[3:-1]).lower();images=[u for u in images if '_'.join(urlparse(u).path.rsplit('/',1)[-1].split('_')[3:-1]).lower()==variant]
    else:images=[primary] if isinstance(primary,str) and primary.startswith('https://') else []
    by_number={}
    for u in images:
        n=re.search(r'_(\d{3})(?:-full)?\.',u);n=n.group(1) if n else u
        if n not in by_number or '-full.' in u:by_number[n]=u
    return {'points':points[:3],'source':url,'page_name':title,'date':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'images':list(by_number.values())[:8],'name':without_gender(title),'style':style or sku,'gender':gender_of(title)}

def image_data(url):
    raw,mime,_=fetch(url,False,12_000_000)
    if not mime.startswith('image/'):raise ValueError('URL is not a direct image. Upload the file instead.')
    with Image.open(io.BytesIO(raw)) as im:
        if im.width*im.height>40_000_000:raise ValueError('Image exceeds 40 megapixels')
        im=ImageOps.exif_transpose(im).convert('RGBA');im.thumbnail((1800,1800))
        while True:
            out=io.BytesIO();im.save(out,'PNG');data=out.getvalue()
            if len(data)<2_800_000:break
            im.thumbnail((max(300,int(im.width*.8)),max(300,int(im.height*.8))))
            if max(im.size)<=300:raise ValueError('Unable to resize image')
    return {'data':base64.b64encode(data).decode(),'mime':'image/png'}

class handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def send_json(self,obj,status=200):
        raw=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(raw)
    def do_POST(self):
        try:
            origin=self.headers.get('Origin')
            if origin and urlparse(origin).netloc!=self.headers.get('Host'):raise ValueError('Use this tool from its own website')
            length=int(self.headers.get('Content-Length',0))
            if length>20_000:raise ValueError('Request too large')
            data=json.loads(self.rfile.read(length));op=data.get('op')
            if op=='image':result=image_data(data['url'])
            elif op=='product':
                k=json.dumps(data,sort_keys=True);c=CACHE.get(k)
                if c and time.time()-c[0]<3600:result=c[1]
                else:
                    result=product_data(data)
                    if len(CACHE)>200:CACHE.clear()
                    CACHE[k]=(time.time(),result)
            else:raise ValueError('Unknown operation')
            self.send_json(result)
        except Exception as e:self.send_json({'error':str(e)},400)
