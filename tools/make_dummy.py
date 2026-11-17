import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper

# dummy model: C = A + BIG  (BIG is a 8M-float initializer ~32MB) to test wasm size threshold
big = np.random.rand(8_000_000).astype(np.float32)
big_t = numpy_helper.from_array(big, name="BIG")
node = helper.make_node("Add", ["A", "BIG"], ["C"])
graph = helper.make_graph(
    [node], "dummy",
    [helper.make_tensor_value_info("A", TensorProto.FLOAT, [8_000_000])],
    [helper.make_tensor_value_info("C", TensorProto.FLOAT, [8_000_000])],
    initializer=[big_t],
)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
model.ir_version = 8
onnx.checker.check_model(model)
onnx.save(model, "assets/dummy32mb.onnx")
print("saved assets/dummy32mb.onnx")
