import { NextResponse } from 'next/server'

export async function GET(request, { params }) {
  const { slug } = await params
  const origin   = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL || 'cataconjuanjo.com'}`
  const kioskUrl = `${origin}/kiosko/${slug}`

  const js = `(function(){
  if(document.getElementById('kiosko-widget-${slug}'))return;
  var style=document.createElement('style');
  style.textContent=
    '#kiosko-btn-${slug}{position:fixed;bottom:24px;right:24px;z-index:99998;background:#c9a96e;color:#1a1a2e;border:none;border-radius:50px;padding:12px 20px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.25);font-family:system-ui,sans-serif;display:flex;align-items:center;gap:8px;transition:transform .15s,box-shadow .15s}'+
    '#kiosko-btn-${slug}:hover{transform:translateY(-2px);box-shadow:0 6px 28px rgba(0,0,0,.3)}'+
    '#kiosko-overlay-${slug}{display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);align-items:center;justify-content:center}'+
    '#kiosko-overlay-${slug}.open{display:flex}'+
    '#kiosko-frame-wrap-${slug}{position:relative;width:min(420px,95vw);height:min(700px,90vh);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}'+
    '#kiosko-close-${slug}{position:absolute;top:10px;right:12px;z-index:1;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:30px;height:30px;font-size:16px;cursor:pointer;line-height:1}'+
    '#kiosko-iframe-${slug}{width:100%;height:100%;border:none}';
  document.head.appendChild(style);

  var btn=document.createElement('button');
  btn.id='kiosko-btn-${slug}';
  btn.innerHTML='🍷 Buscar vino';
  document.body.appendChild(btn);

  var overlay=document.createElement('div');
  overlay.id='kiosko-overlay-${slug}';
  overlay.innerHTML='<div id="kiosko-frame-wrap-${slug}"><button id="kiosko-close-${slug}">✕</button><iframe id="kiosko-iframe-${slug}" src="${kioskUrl}" allow="fullscreen"></iframe></div>';
  document.body.appendChild(overlay);

  btn.addEventListener('click',function(){overlay.classList.add('open')});
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.classList.remove('open')});
  document.getElementById('kiosko-close-${slug}').addEventListener('click',function(){overlay.classList.remove('open')});
})();`

  return new NextResponse(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
