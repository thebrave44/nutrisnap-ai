import onnx
from onnx import helper, TensorProto

# tiny model: C = A + B
node = helper.make_node("Add", ["A", "B"], ["C"])
graph = helper.make_graph(
    [node], "tiny",
    [helper.make_tensor_value_info("A", TensorProto.FLOAT, [2]),
     helper.make_tensor_value_info("B", TensorProto.FLOAT, [2])],
    [helper.make_tensor_value_info("C", TensorProto.FLOAT, [2])],
)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
model.ir_version = 8
onnx.checker.check_model(model)
onnx.save(model, "assets/tiny.onnx")
print("saved assets/tiny.onnx")
