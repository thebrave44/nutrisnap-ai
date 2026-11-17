import torch
import torch.nn as nn
import torchvision.models as models

ckpt = torch.load("tools/alexkoff88_bin", map_location="cpu", weights_only=False)
sd = ckpt["state_dict"] if "state_dict" in ckpt else ckpt
sd = {k.replace("module.", ""): v for k, v in sd.items()}
print("epoch:", ckpt.get("epoch"), "best_acc1:", ckpt.get("best_acc1"))

model = models.mobilenet_v2(num_classes=101)
model.load_state_dict(sd)
model.eval()

with torch.no_grad():
    dummy = torch.randn(1, 3, 224, 224)
    torch.onnx.export(
        model, dummy, "assets/food101_mnv2_ak.onnx",
        input_names=["input"], output_names=["output1"],
        dynamic_axes={"input": {0: "batch"}, "output1": {0: "batch"}},
        opset_version=17, dynamo=False,
    )
print("exported assets/food101_mnv2_ak.onnx")
