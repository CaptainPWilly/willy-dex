#!/usr/bin/env python3
"""Publish a Willy-dex card from a JSON record. Standard library only.
Usage: python generate_card.py data/001.json
The output SVG is a real image asset read by the website, not HTML-generated artwork.
"""
import base64, html, json, pathlib, re, sys
ROOT=pathlib.Path(__file__).resolve().parent
def esc(v): return html.escape(str(v),quote=True)
def publish(path):
    d=json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    number=str(d["number"]).zfill(3)
    if not re.fullmatch(r"\d{3}",number) or not 1<=int(number)<=100: raise ValueError("Card number must be 001–100")
    logo=ROOT/"assets"/"willy-corp.jpeg"
    if logo.exists():
        b64=base64.b64encode(logo.read_bytes()).decode("ascii")
    else:
        existing=(ROOT/"cards"/"001.svg").read_text(encoding="utf-8")
        match=re.search(r"data:image/jpeg;base64,([A-Za-z0-9+/=]+)",existing)
        if not match: raise FileNotFoundError("Missing Willy Corp logo")
        b64=match.group(1)
    name=esc(d["name"]); typ=esc(d.get("type","Member")); tag=esc(d.get("tag","")); bio=esc(d.get("bio",""))
    notes=[esc(n) for n in d.get("notes",[])][:3]
    note_svg="".join(f'<text x="350" y="{745+i*36}" text-anchor="middle" font-family="Georgia" font-size="21" fill="#d9b17a">{n}</text>' for i,n in enumerate(notes))
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="700" height="980" viewBox="0 0 700 980">
<defs><linearGradient id="gold"><stop stop-color="#885027"/><stop offset=".4" stop-color="#ffe0a4"/><stop offset=".75" stop-color="#bd8548"/><stop offset="1" stop-color="#ffe8b8"/></linearGradient><linearGradient id="bg" x2=".8" y2="1"><stop stop-color="#3a281d"/><stop offset=".5" stop-color="#17110e"/><stop offset="1" stop-color="#392419"/></linearGradient></defs>
<rect width="700" height="980" rx="28" fill="#100b09"/><rect x="10" y="10" width="680" height="960" rx="22" fill="url(#bg)" stroke="url(#gold)" stroke-width="12"/><rect x="32" y="32" width="636" height="916" rx="12" fill="none" stroke="#b17a42" stroke-width="2"/>
<text x="350" y="87" text-anchor="middle" fill="#e9c58e" font-family="Georgia" font-size="24" letter-spacing="5">WILLY CORP. · #{number}</text>
<image x="175" y="125" width="350" height="350" href="data:image/jpeg;base64,{b64}"/><rect x="148" y="112" width="404" height="390" rx="14" fill="none" stroke="url(#gold)" stroke-width="5"/>
<text x="350" y="558" text-anchor="middle" fill="#f9e7c2" font-family="Georgia" font-size="44" font-weight="bold">{name}</text><path d="M110 582H590" stroke="#b27b42" stroke-width="2"/>
<text x="350" y="625" text-anchor="middle" fill="#dba969" font-family="Georgia" font-size="28">{tag} {typ}</text>
<text x="350" y="688" text-anchor="middle" fill="#ead6b6" font-family="Georgia" font-size="23">{bio}</text>{note_svg}
<path d="M65 872H635" stroke="#b9894e" stroke-width="3"/>
<text x="75" y="910" fill="#f4d59c" font-family="Georgia" font-size="23">LVL {esc(d.get("level","???"))}</text>
<text x="625" y="910" text-anchor="end" fill="#f4d59c" font-family="Georgia" font-size="22">{esc(d.get("date","???"))}</text></svg>'''
    (ROOT/"cards").mkdir(exist_ok=True)
    (ROOT/"cards"/f"{number}.svg").write_text(svg,encoding="utf-8")
    dbpath=ROOT/"cards.json"
    cards=json.loads(dbpath.read_text(encoding="utf-8"))
    cards[int(number)-1]={k:d.get(k) for k in ("number","name","type","tag","level","date") if k in d}
    cards[int(number)-1]["number"]=number
    cards[int(number)-1]["image"]=f"cards/{number}.svg"
    cards[int(number)-1]["placeholder"]=False
    dbpath.write_text(json.dumps(cards,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("Published card",number)
if __name__=="__main__":
    if len(sys.argv)!=2: raise SystemExit("Usage: python generate_card.py data/001.json")
    publish(sys.argv[1])
