import subprocess, json, tempfile, os
def show(stage):
    return subprocess.check_output(["git","show",f":{stage}:api/buy.js"],text=True).split("\n")
b,o,t=show(1),show(2),show(3)
def idx(L,prefix): return next(i for i,l in enumerate(L) if l.startswith(prefix))
def dec(L,prefix):
    l=L[idx(L,prefix)]; i=l.index('= "')+2; return json.loads(l[i:l.rindex('";')+1])
out=list(t)
for prefix in ("const BUY_CARD_CSS = ","const CLIENT = "):
    merged=None
    parts=[dec(L,prefix) for L in (o,b,t)]   # ours, base, theirs
    d=tempfile.mkdtemp(); paths=[]
    for n,txt in zip(("ours","base","theirs"),parts):
        p=os.path.join(d,n); open(p,"w").write(txt); paths.append(p)
    r=subprocess.run(["git","merge-file","-p"]+paths,capture_output=True,text=True)
    print(prefix[:20], "conflicts:", r.returncode)
    txt=r.stdout
    i=idx(out,prefix); l=out[i]; k=l.index('= "')+2
    out[i]=l[:k]+json.dumps(txt,ensure_ascii=False)+";"
open("api/buy.js","w").write("\n".join(out))
