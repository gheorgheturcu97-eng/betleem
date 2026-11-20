# Procedural backgrounds for Echipa Betleem: original, license-free, made here.
import numpy as np, subprocess, sys, os
from PIL import Image, ImageFilter
W,H=1920,1080; OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
rng=np.random.default_rng(7)
def hexc(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)/255
def grain(img,a=0.018):
    return img+rng.normal(0,a,img.shape[:2])[...,None]
def save(img,name):
    img=np.clip(img,0,1); Image.fromarray((img*255+.5).astype(np.uint8)).save(f'{OUT}/{name}.jpg',quality=88,optimize=True,progressive=True)
def vignette(img,s=.55):
    y,x=np.mgrid[0:img.shape[0],0:img.shape[1]]; x=x/img.shape[1]-.5; y=y/img.shape[0]-.5
    return img*(1-s*(x*x*1.2+y*y*1.6))[...,None]
def mesh(pal,base,seed,t=0.0,w=W,h=H,n=6,sharp=2.2):
    r=np.random.default_rng(seed); y,x=np.mgrid[0:h,0:w]; x=x/w; y=y/h
    img=np.ones((h,w,3))*hexc(base)
    for i in range(n):
        cx,cy=r.uniform(.05,.95),r.uniform(.05,.95); ax,ay=r.uniform(.08,.22),r.uniform(.06,.18); ph=r.uniform(0,6.28); rad=r.uniform(.22,.45)
        cx+=ax*np.sin(2*np.pi*t+ph); cy+=ay*np.cos(2*np.pi*t+ph*1.3)
        d=((x-cx)*1.6)**2+(y-cy)**2; wgt=np.exp(-d/(rad*rad)*sharp)[...,None]*r.uniform(.55,.95)
        img=img*(1-wgt)+hexc(pal[i%len(pal)])*wgt
    return img
def up(img): return np.asarray(Image.fromarray((np.clip(img,0,1)*255).astype(np.uint8)).resize((W,H),Image.BICUBIC),float)/255
P={
 'aurora-albastru':(['#1b3b8f','#3a1c71','#0f6f8f','#5b2a86','#1d4fa3'],'#05060f'),
 'apus-cald':(['#d9603b','#8e2d4f','#f2a65a','#5a1e4a','#b8432f'],'#120608'),
 'smarald':(['#0e6b5c','#13423f','#2a8f6a','#0b3b4a','#3e9e7e'],'#030a0a'),
 'violet-noapte':(['#4b2a8a','#7a2f7a','#22266b','#9a4d9e','#2f1f5a'],'#06040c'),
 'auriu-visiniu':(['#7a1e2c','#b57a2a','#4a0f22','#d4a24c','#5e1530'],'#0a0305'),
 'gri-elegant':(['#3a3f4a','#5a606c','#23262d','#707784','#2d3139'],'#0b0c0f'),
 'ocean':(['#0b4f7a','#0e7aa0','#06325a','#3aa6c4','#0a2a4a'],'#02060c'),
 'roz-pastel':(['#c47a9a','#7a6ab0','#e0a07a','#9a5a8a','#5a6aa8'],'#140a12'),
}
for i,(k,(pal,base)) in enumerate(P.items()):
    img=up(mesh(pal,base,i*11+3,w=480,h=270)); img=vignette(grain(img*.92)); save(img,'fundal-'+k)
# bokeh
def bokeh(name,base,cols,seed):
    r=np.random.default_rng(seed); im=Image.new('RGB',(W,H)); bg=up(mesh(cols,base,seed,w=480,h=270,n=4))*.55
    layer=np.zeros((H,W,3))
    for blur,count,(rmin,rmax),a in [(28,22,(60,160),.22),(10,30,(25,70),.32),(3,40,(6,20),.45)]:
        L=Image.new('RGB',(W,H)); from PIL import ImageDraw; d=ImageDraw.Draw(L)
        for _ in range(count):
            x,y=r.uniform(0,W),r.uniform(H*.1,H); rr=r.uniform(rmin,rmax); c=(hexc(cols[r.integers(len(cols))])*255*r.uniform(.6,1)).astype(int)
            d.ellipse([x-rr,y-rr,x+rr,y+rr],fill=tuple(c))
        L=np.asarray(L.filter(ImageFilter.GaussianBlur(blur)),float)/255; layer=1-(1-layer)*(1-L*a)
    save(vignette(grain(1-(1-bg)*(1-layer))),name)
bokeh('fundal-lumini-calde','#0a0604',['#f2b45a','#e07a3a','#ffd89a','#c45a2a'],21)
bokeh('fundal-lumini-reci','#03060c',['#5aa0f2','#7a6ae0','#9ad8ff','#3a5ac4'],22)
# light rays from above
def rays(name,base,col,seed):
    r=np.random.default_rng(seed); y,x=np.mgrid[0:H,0:W]; x=x/W-.5; y=y/H+.15
    ang=np.arctan2(x,y); v=np.zeros((H,W))
    for _ in range(26):
        a0=r.uniform(-.75,.75); wd=r.uniform(.008,.05); v+=r.uniform(.15,.6)*np.exp(-((ang-a0)/wd)**2)
    v=v*np.exp(-y*1.6)+.9*np.exp(-(x*x*8+(y-.15)**2*6))
    img=hexc(base)+v[...,None]*hexc(col)*.55
    save(vignette(grain(img)),name)
rays('fundal-raze-aurii','#0d0805','#f5c77a',31)
rays('fundal-raze-albastre','#03070f','#8ec5ff',32)
# soft cross of light
def cross(name,base,col):
    y,x=np.mgrid[0:H,0:W]; x=(x-W/2)/H; y=(y-H*.47)/H
    v=np.exp(-(x/.012)**2)*np.exp(-np.clip(np.abs(y)-.30,0,None)*40)*(np.abs(y)<.5)
    v=np.maximum(v,np.exp(-((y+.12)/.012)**2)*np.exp(-np.clip(np.abs(x)-.17,0,None)*40))
    img=np.asarray(Image.fromarray((v*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)),float)/255
    glow=np.asarray(Image.fromarray((v*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(60)),float)/255*2.2
    halo=np.exp(-(x*x+(y+.12)**2)/.08)*.35
    out=hexc(base)+(img*.85+glow*.6+halo)[...,None]*hexc(col)
    save(vignette(grain(out)),name)
cross('fundal-cruce-lumina','#07050a','#ffe2b0')
# silk waves
def silk(name,base,col,seed):
    r=np.random.default_rng(seed); y,x=np.mgrid[0:H,0:W]; x=x/W; y=y/H; v=np.zeros((H,W))
    for i in range(48):
        c=.55+.18*np.sin(x*3.1+i*.07)+.08*np.sin(x*7.3+i*.13+1)+(i-24)*.0045
        v+=np.exp(-((y-c)/.0025)**2)*(.18+.5*np.sin(i/48*np.pi))
    v=np.asarray(Image.fromarray(np.clip(v*255,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)),float)/255
    bg=up(mesh([col,base],base,seed,w=480,h=270,n=3))*.5
    save(vignette(grain(bg+v[...,None]*hexc(col)*.8)),name)
silk('fundal-valuri-matase','#05040a','#b9a6ff',41)
silk('fundal-valuri-aurii','#080503','#f0c27a',42)
# animated loops: moving mesh gradients, perfectly looping
def loop(name,pal,base,seed,sec=12,fps=30):
    p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s','480x270','-r',str(fps),'-i','-',
      '-vf',f'scale={W}:{H}:flags=bicubic,noise=alls=6:allf=t,vignette=PI/5','-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart','-an',f'{OUT}/{name}.mp4'],stdin=subprocess.PIPE)
    for f in range(sec*fps):
        img=mesh(pal,base,seed,t=f/(sec*fps),w=480,h=270)*.92
        p.stdin.write((np.clip(img,0,1)*255).astype(np.uint8).tobytes())
    p.stdin.close(); p.wait()
loop('miscare-aurora',*P['aurora-albastru'],101,sec=16)
loop('miscare-apus',*P['apus-cald'],102,sec=16)
loop('miscare-smarald',*P['smarald'],103,sec=16)
loop('miscare-violet',*P['violet-noapte'],104,sec=16)
