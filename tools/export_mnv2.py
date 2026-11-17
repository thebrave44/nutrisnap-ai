import json
import torch
from transformers import AutoModelForImageClassification, AutoImageProcessor

SRC = "paolopertino/mobilenet-finetuned-food101"
model = AutoModelForImageClassification.from_pretrained(SRC)
proc = AutoImageProcessor.from_pretrained(SRC)
model.eval()

cfg = json.load(open("tools/config.json"))  # convnext labels for reference
id2label = model.config.id2label
labels = [id2label[i] if i in id2label else id2label[str(i)] for i in range(len(id2label))]
print("labels:", labels[:10], "... count", len(labels))
ref = [l.strip() for l in open("tools/labels.txt") if l.strip()]
print("matches food101 alphabetical:", labels == ref)

with torch.no_grad():
    dummy = torch.zeros(1, 3, 224, 224)
    torch.onnx.export(
        model,
        dummy,
        "assets/food101_mnv2.onnx",
        input_names=["pixel_values"],
        output_names=["logits"],
        dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
print("exported assets/food101_mnv2.onnx")
print("preproc:", proc)
