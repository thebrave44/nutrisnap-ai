import sys, os, glob
import numpy as np
from PIL import Image
import onnxruntime as ort

LABELS = [l.strip() for l in open(os.path.join(os.path.dirname(__file__), 'labels.txt')) if l.strip()]
assert len(LABELS) == 101, len(LABELS)

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

def preprocess(path):
    img = Image.open(path).convert('RGB')
    w, h = img.size
    scale = 224 / min(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
    w, h = img.size
    left = (w - 224) // 2; top = (h - 224) // 2
    img = img.crop((left, top, left + 224, top + 224))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    return arr.transpose(2, 0, 1)[None].astype(np.float32)

model = sys.argv[1]
sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0].name
out = sess.get_outputs()[0].name
print('input:', inp, sess.get_inputs()[0].shape, 'output:', out, sess.get_outputs()[0].shape)

paths = []
for a in sys.argv[2:]:
    paths.extend(glob.glob(a))
for path in sorted(paths):
    x = preprocess(path)
    logits = sess.run([out], {inp: x})[0][0]
    probs = np.exp(logits - logits.max()); probs /= probs.sum()
    top = np.argsort(-probs)[:5]
    print(os.path.basename(path), '->', [(LABELS[i], round(float(probs[i]), 3)) for i in top])
