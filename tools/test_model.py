import sys, os, glob
import numpy as np
from PIL import Image
import onnxruntime as ort

LABELS = """apple_pie baby_back_ribs baklava beef_carpaccio beef_tartare beet_salad beignets bibimbap bread_pudding breakfast_burrito bruschetta caesar_salad cannoli caprese_salad carrot_cake ceviche cheesecake cheese_plate chicken_curry chicken_quesadilla chicken_wings chocolate_cake chocolate_mousse churros clam_chowder club_sandwich crab_cakes creme_brulee croque_madame cup_cakes deviled_eggs donuts dumplings edamame eggs_benedict escargots falafel filet_mignon fish_and_chips foie_gras french_fries french_onion_soup french_toast fried_calamari fried_rice frozen_yogurt garlic_bread gnocchi greek_salad grilled_cheese_sandwich grilled_salmon guacamole gyoza hamburger hot_and_sour_soup hot_dog huevos_rancheros hummus ice_cream lasagna lobster_bisque lobster_roll macaroni_and_cheese macarons miso_soup mussels nachos omelette onion_rings oysters pad_thai paella pancakes panna_cotta peking_duck pho pizza pork_chop poutine prime_rib pulled_pork_sandwich ramen ravioli red_velvet_cake risotto samosa sashimi scallop seaweed_salad shrimp_and_grits spaghetti_bolognese spaghetti_carbonara spring_rolls steak strawberry_shortcake sushi tacos takoyaki tiramisu tuna_tartare waffles""".split()
assert len(LABELS) == 101, len(LABELS)

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

def preprocess(img_path):
    img = Image.open(img_path).convert('RGB')
    w, h = img.size
    scale = 256 / min(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
    w, h = img.size
    left = (w - 224) // 2
    top = (h - 224) // 2
    img = img.crop((left, top, left + 224, top + 224))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    arr = arr.transpose(2, 0, 1)[None].astype(np.float32)
    return arr

sess = ort.InferenceSession(sys.argv[1], providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0].name
out = sess.get_outputs()[0].name
print('input:', inp, sess.get_inputs()[0].shape, 'output:', out)

paths = []
for a in sys.argv[2:]:
    paths.extend(glob.glob(a))
for path in sorted(paths):
    x = preprocess(path)
    logits = sess.run([out], {inp: x})[0][0]
    probs = np.exp(logits - logits.max()); probs /= probs.sum()
    top = np.argsort(-probs)[:5]
    print(os.path.basename(path), '->', [(LABELS[i], round(float(probs[i]), 3)) for i in top])
