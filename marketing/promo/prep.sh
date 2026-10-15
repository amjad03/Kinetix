#!/bin/sh
# Patched copy of the real 3D viewer for frame-exact rendering: black background (blended over the
# video's own backdrop) and an `instant` flag on the `view` command, so the camera can be driven per frame.
set -e
cd "$(dirname "$0")"
V=../../packages/zynetix_3d/assets/viewer3d
rm -rf build/viewer3d && mkdir -p build && cp -r $V build/viewer3d
sed -i 's/Qn.background=new we(mp?1448222:16052714)/Qn.background=null/; s/preserveDrawingBuffer:!0,alpha:!1/preserveDrawingBuffer:!0,alpha:!0/; s/view:s=>Zc(s.dir)/view:s=>Zc(s.dir,!!s.instant)/' build/viewer3d/viewer.js
grep -c "Zc(s.dir,!!s.instant)" build/viewer3d/viewer.js
grep -c "Qn.background=null" build/viewer3d/viewer.js
mkdir -p build/lib && cp ../../apps/board/assets/library/*.webp build/lib/ 2>/dev/null || true
# Indic fonts + black page for the labels/model inside the viewer (the render machine has no Indic fonts)
python3 - <<'PY'
import json
p = 'build/viewer3d/index.html'
h = open(p).read()
st = ("<style>@font-face{font-family:Deva;src:url(/packages/zynetix_ui/fonts/NotoSansDevanagari-700.ttf)}"
      "@font-face{font-family:Knda;src:url(/packages/zynetix_ui/fonts/NotoSansKannada-700.ttf)}"
      ".label{font-family:Deva,Knda,system-ui,sans-serif!important;font-size:19px!important}"
      "html,body{background:transparent!important}</style>"
      "<script>window.__q=[];window.requestAnimationFrame=function(cb){__q.push(cb);return 1};window.__step=function(){var q=__q.splice(0),t=performance.now();q.forEach(function(cb){cb(t)})}</script></head>")
if '__step' not in h: open(p, 'w').write(h.replace('</head>', st))
ids = [m['id'] for m in json.load(open('build/viewer3d/models/index.json'))['models']]
import os
ph = sorted(f[:-4] for f in os.listdir('../../apps/board/assets/phet/thumbs') if f.endswith('.jpg'))
open('compose/models.js', 'w').write('window.MODEL_IDS=' + json.dumps(ids) + ';\nwindow.PHET_IDS=' + json.dumps(ph) + ';\n')
print(len(ids), 'model ids')
PY
