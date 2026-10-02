"""Optional local preview: python3 dev.py (requires requirements.txt)."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from api.remote import handler
class Dev(handler,SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(Path(__file__).parent/'public'),**kwargs)
    def do_GET(self):return SimpleHTTPRequestHandler.do_GET(self)
if __name__=='__main__':
    print('Open http://localhost:8000',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8000),Dev).serve_forever()
