import sys, os, glob
import numpy as np
from PIL import Image
import onnxruntime as ort

# usage: test_generic.py MODEL INPUT_NAME MODE(imagenet|half|raw) [SIZE]
LABELS = [l.strip() for l in open(os.path.join(os.path.dirname(__file__), 'labels.txt')) if l.strip()]

model_path, inp_name, mode = sys.argv[1], sys.argv[2], sys.argv[3]
size = int(sys.argv[4]) if len(sys.argv) > 4 else 224
pre = int(sys.argv[5]) if len(sys.argv) > 5 else 256  # resize shortest edge

if mode == 'imagenet':
    MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32); STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
elif mode == 'half':
    MEAN = np.array([0.5, 0.5, 0.5], dtype=np.float32); STD = np.array([0.5, 0.5, 0.5], dtype=np.float32)
else:
    MEAN = np.zeros(3, dtype=np.float32); STD = np.ones(3, dtype=np.float32)

def preprocess(path):
    img = Image.open(path).convert('RGB')
    w, h = img.size
    scale = pre / min(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
    w, h = img.size
    left = (w - size) // 2; top = (h - size) // 2
    img = img.crop((left, top, left + size, top + size))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    return arr.transpose(2, 0, 1)[None].astype(np.float32)

sess = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
out = sess.get_outputs()[0].name
print('input:', sess.get_inputs()[0].name, sess.get_inputs()[0].shape, 'output:', out, sess.get_outputs()[0].shape)

correct = 0; total = 0
expected = {'burger.jpg': 'hamburger', 'pizza.jpg': 'pizza', 'sushi.jpg': 'sushi', 'salad.jpg': 'caesar_salad',
            'friedrice.jpg': 'fried_rice', 'steak.jpg': 'steak', 'pancakes.jpg': 'pancakes', 'icecream.jpg': 'ice_cream'}
for path in sorted(glob.glob('tools/testimg/*.jpg')):
    x = preprocess(path)
    logits = sess.run([out], {inp_name: x})[0][0]
    probs = np.exp(logits - logits.max()); probs /= probs.sum()
    top = np.argsort(-probs)[:5]
    name = os.path.basename(path)
    pred = LABELS[int(top[0])] if len(LABELS) > int(top[0]) else '?'
    ok = expected.get(name) == pred
    correct += ok; total += 1
    print(f"{name:15s} -> {[(LABELS[i], round(float(probs[i]), 2)) for i in top[:3]]}  {'OK' if ok else 'X (want ' + str(expected.get(name)) + ')'}")
print(f"top-1 on test set: {correct}/{total}")
