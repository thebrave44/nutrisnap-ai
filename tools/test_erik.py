import sys, os, glob
import numpy as np
from PIL import Image
import onnxruntime as ort

LABELS = [l.strip() for l in open(os.path.join(os.path.dirname(__file__), 'labels.txt')) if l.strip()]

def preprocess(path, size, mode):
    img = Image.open(path).convert('RGB')
    w, h = img.size
    scale = size / min(w, h)
    img = img.resize((max(size, round(w * scale)), max(size, round(h * scale))), Image.BILINEAR)
    w, h = img.size
    left = (w - size) // 2; top = (h - size) // 2
    img = img.crop((left, top, left + size, top + size))
    arr = np.asarray(img, dtype=np.float32)
    if mode == 'xception':      # [-1, 1]
        arr = arr / 255.0 * 2 - 1
    elif mode == 'div255':
        arr = arr / 255.0
    elif mode == 'imagenet':    # NHWC normalized
        mean = np.array([0.5, 0.5, 0.5], dtype=np.float32); std = np.array([0.5, 0.5, 0.5], dtype=np.float32)
        arr = (arr / 255.0 - mean) / std
    return arr[None].astype(np.float32)  # NHWC

sess = ort.InferenceSession(sys.argv[1], providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0]
out = sess.get_outputs()[0].name
print('input:', inp.name, inp.shape, 'output:', out)

paths = sorted(glob.glob('tools/testimg/*.jpg'))
for mode in ('xception', 'div255', 'imagenet'):
    print('=== mode', mode)
    for path in paths:
        x = preprocess(path, 299, mode)
        logits = sess.run([out], {inp.name: x})[0][0]
        probs = np.exp(logits - logits.max()); probs /= probs.sum()
        top = np.argsort(-probs)[:3]
        print(' ', os.path.basename(path), '->', [(LABELS[i] if i < len(LABELS) else i, round(float(probs[i]), 2)) for i in top])
