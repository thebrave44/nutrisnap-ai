import sys, glob
import numpy as np
from PIL import Image
import onnxruntime as ort

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

def preprocess(path, mode):
    img = Image.open(path).convert('RGB')
    if mode == 'centercrop':
        w, h = img.size
        scale = 256 / min(w, h)
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
        w, h = img.size
        left = (w - 224) // 2; top = (h - 224) // 2
        img = img.crop((left, top, left + 224, top + 224))
    else:  # plain resize
        img = img.resize((224, 224), Image.BILINEAR)
    arr = np.asarray(img, dtype=np.float32)
    if mode == 'raw255':
        pass
    elif mode == 'div255':
        arr = arr / 255.0
    elif mode in ('centercrop', 'resize'):
        arr = arr / 255.0
        arr = (arr - MEAN) / STD
    arr = arr.transpose(2, 0, 1)[None].astype(np.float32)
    return arr

sess = ort.InferenceSession('assets/food101_mobilenet.onnx', providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0].name
out = sess.get_outputs()[0].name

for mode in ('centercrop', 'resize', 'raw255'):
    for path in sorted(glob.glob('tools/testimg/*.jpg'))[:3]:
        x = preprocess(path, mode)
        logits = sess.run([out], {inp: x})[0][0]
        print(mode, path.split('\\')[-1], 'x stats: min %.2f max %.2f mean %.2f' % (x.min(), x.max(), x.mean()),
              '| logits: min %.2f max %.2f mean %.2f' % (logits.min(), logits.max(), logits.mean()),
              '| argmax:', int(np.argmax(logits)), 'top:', round(float(logits.max()), 2))
