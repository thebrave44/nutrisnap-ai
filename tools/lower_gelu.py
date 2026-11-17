import onnx
from onnx import helper, numpy_helper
import numpy as np

import sys
src = sys.argv[1] if len(sys.argv) > 1 else "tools/food101_fp32.onnx"
dst = sys.argv[2] if len(sys.argv) > 2 else "assets/food101_convnext_op17.onnx"

m = onnx.load(src)
graph = m.graph

new_nodes = []
counter = 0
for node in graph.node:
    if node.op_type == "Gelu":
        x, y = node.input[0], node.output[0]
        base = f"gelu_{counter}"; counter += 1
        c_sqrt = numpy_helper.from_array(np.array(1.0 / np.sqrt(2.0), dtype=np.float32), name=base + "_c1")
        c_one = numpy_helper.from_array(np.array(1.0, dtype=np.float32), name=base + "_c2")
        c_half = numpy_helper.from_array(np.array(0.5, dtype=np.float32), name=base + "_c3")
        graph.initializer.extend([c_sqrt, c_one, c_half])
        new_nodes.append(helper.make_node("Mul", [x, base + "_c1"], [base + "_t1"], name=base + "_mul"))
        new_nodes.append(helper.make_node("Erf", [base + "_t1"], [base + "_t2"], name=base + "_erf"))
        new_nodes.append(helper.make_node("Add", [base + "_t2", base + "_c2"], [base + "_t3"], name=base + "_add"))
        new_nodes.append(helper.make_node("Mul", [base + "_t3", base + "_c3"], [base + "_t4"], name=base + "_mul2"))
        new_nodes.append(helper.make_node("Mul", [x, base + "_t4"], [y], name=base + "_out"))
    else:
        new_nodes.append(node)

# rebuild node list in place (preserves topological order)
del graph.node[:]
graph.node.extend(new_nodes)

# keep opset 20 / ir 10 (ORT 1.17 supports them; only Gelu kernel was missing)
# m.opset_import and m.ir_version unchanged

onnx.checker.check_model(m)
onnx.save(m, dst)
print("saved", dst)

# sanity: run in python ORT and compare with original
import onnxruntime as ort
sess_new = ort.InferenceSession(dst, providers=['CPUExecutionProvider'])
sess_old = ort.InferenceSession(src, providers=['CPUExecutionProvider'])
x = np.random.rand(1, 3, 224, 224).astype(np.float32)
inp = sess_new.get_inputs()[0].name
o_new = sess_new.run(None, {inp: x})[0]
o_old = sess_old.run(None, {sess_old.get_inputs()[0].name: x})[0]
print("max diff vs original:", float(np.abs(o_new - o_old).max()))
